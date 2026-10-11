import Foundation

// Standalone: swiftc ios/NativeUploadControl.swift tests/UploadLiveActivityModelTests.swift -o /tmp/nix-live-activity-model-tests
@main
struct UploadLiveActivityModelTests {
  static func main() {
    var checks = 0
    func check(_ condition: @autoclosure () -> Bool, _ message: String) {
      precondition(condition(), message)
      checks += 1
    }
    func near(_ lhs: Double, _ rhs: Double) -> Bool { abs(lhs - rhs) < 0.000_001 }
    func js(_ jobs: [UploadLiveActivityJSJob], at updatedAt: Double = 1_000) -> UploadLiveActivityJSState {
      UploadLiveActivityJSState(version: 1, updatedAt: updatedAt, locale: "pl", jobs: jobs)
    }
    func native(
      _ id: String, _ state: String, progress: Double = 0, at updatedAt: Double = 2_000,
      body: String? = nil
    ) -> UploadLiveActivityNativeJob {
      UploadLiveActivityNativeJob(id: id, state: state, progress: progress, updatedAt: updatedAt, responseBody: body)
    }

    // Same sending band as src/lib/uploadProgress.ts.
    check(near(UploadLiveActivityModel.sendingProgress(0), 0.25), "Sending starts at 0.25")
    check(near(UploadLiveActivityModel.sendingProgress(0.5), 0.60), "Sending midpoint is 0.25 + 0.5 · 0.70")
    check(near(UploadLiveActivityModel.sendingProgress(1), 0.95), "Sending ends at 0.95")

    // SEND-2: a finished URLSession transfer is not „sent” while JS still compresses the next segment.
    let segments = UploadLiveActivityModel.build(
      js: js([
        UploadLiveActivityJSJob(id: "a", state: "uploading", progress: 0.5),
        UploadLiveActivityJSJob(id: "b", state: "preparing", progress: 0.1),
      ]),
      native: [native("a", "completed")]
    )
    check(segments?.phase == "preparing", "Pending compression keeps the activity open")
    check(segments?.remainingCount == 1, "Only the unfinished segment remains")
    check(near(segments?.progress ?? -1, 0.1), "Progress averages active jobs only")

    // Moderation pending after finalize is „confirming”, never completed.
    let moderation = UploadLiveActivityModel.build(
      js: js([UploadLiveActivityJSJob(id: "a", state: "uploading", progress: 0.8)]),
      native: [native("a", "completed", body: #"{"status":"moderation_pending","jobId":"m"}"#)]
    )
    check(moderation?.phase == "finalizing", "Moderation pending maps to finalizing")
    check(near(moderation?.progress ?? -1, 0.95), "Confirming sits at the end of the sending band")

    // Everything JS knew about finished natively → the only case native may end the activity.
    let done = UploadLiveActivityModel.build(
      js: js([UploadLiveActivityJSJob(id: "a", state: "uploading", progress: 0.9)]),
      native: [native("a", "completed", body: #"{"status":"completed"}"#)]
    )
    check(done == UploadLiveActivityContent(phase: "completed", progress: 1, remainingCount: 0),
      "All reported jobs completed")

    // A native snapshot older than the JS report is stale: JS already consumed it.
    let stale = UploadLiveActivityModel.build(
      js: js([UploadLiveActivityJSJob(id: "a", state: "finalizing", progress: 0.95)], at: 5_000),
      native: [native("a", "completed", at: 4_000)]
    )
    check(stale?.phase == "finalizing", "JS view wins over an older native snapshot")

    // NOTIF-10: an automatic retry is still sending, not failed.
    let retry = UploadLiveActivityModel.build(
      js: js([UploadLiveActivityJSJob(id: "a", state: "uploading", progress: 0.4)]),
      native: [native("a", "retry_scheduled", progress: 0.3)]
    )
    check(retry?.phase == "uploading", "retry_scheduled shows as uploading")
    check(near(retry?.progress ?? -1, 0.4), "Retry keeps the current ring value")
    check(UploadLiveActivityModel.aggregate([("retry_scheduled", 0.4), ("waiting_network", 0.3)])?.phase
      == "uploading", "Retry outranks network waiting exactly like buildUploadQueueSummary")
    check(UploadLiveActivityModel.aggregate([("waiting_for_auth", 0.4)])?.phase == "failed",
      "Lost session needs the user's attention")
    check(UploadLiveActivityModel.aggregate([("failed", 0.4), ("uploading", 0.5)])?.phase == "failed",
      "A terminal failure wins")
    check(UploadLiveActivityModel.aggregate([("waiting_network", 0.4)])?.phase == "waiting_network",
      "Network waiting stays distinct")
    check(UploadLiveActivityModel.aggregate([("paused", 0.4)])?.phase == "paused", "Pause stays distinct")
    check(UploadLiveActivityModel.aggregate([("cancelled", 0.4)]) == nil, "Nothing visible, nothing to show")

    // Monotonic within the background session: a new native attempt restarts bytes from 0.
    let restarted = UploadLiveActivityModel.build(
      js: js([UploadLiveActivityJSJob(id: "a", state: "uploading", progress: 0.7)]),
      native: [native("a", "uploading", progress: 0.1)]
    )
    check(near(restarted?.progress ?? -1, 0.7), "Ring never drops below the JS-reported value")
    let advancing = UploadLiveActivityModel.build(
      js: js([UploadLiveActivityJSJob(id: "a", state: "uploading", progress: 0.3)]),
      native: [native("a", "uploading", progress: 0.5)]
    )
    check(near(advancing?.progress ?? -1, 0.6), "Native bytes move the ring in the sending band")

    // A transfer handed over after the last report still counts.
    let handedOver = UploadLiveActivityModel.build(
      js: js([UploadLiveActivityJSJob(id: "a", state: "uploading", progress: 0.5)]),
      native: [native("b", "uploading", progress: 0), native("old", "completed", at: 10)]
    )
    check(handedOver?.remainingCount == 2, "Newer native-only transfer is included, old history is not")

    // Without any JS report native knows only URLSession work and may never claim completion.
    check(UploadLiveActivityModel.build(js: nil, native: [native("a", "completed")]) == nil,
      "No JS report: never end as completed")
    check(UploadLiveActivityModel.build(js: nil, native: [native("a", "uploading", progress: 0.5)])
      == UploadLiveActivityContent(phase: "uploading", progress: 0.6, remainingCount: 1),
      "No JS report: banded progress from URLSession")
    check(UploadLiveActivityModel.build(js: js([]), native: []) == nil, "Idle queue publishes nothing")

    check(UploadLiveActivityModel.finalizeStatus(nil) == "completed", "Empty finalize body is success")
    check(UploadLiveActivityModel.finalizeStatus("not json") == "completed", "Unparsable body is success like JS")

    // PERF-8 throttle.
    var throttle = UploadProgressThrottle()
    check(throttle.sample(progress: 0.001, isFinal: false, now: 0) == (true, true), "First sample emits and persists")
    check(throttle.sample(progress: 0.2, isFinal: false, now: 0.1) == (false, false), "Under 250 ms is coalesced")
    check(throttle.sample(progress: 0.005, isFinal: false, now: 0.3) == (false, false), "Under 1 % is coalesced")
    check(throttle.sample(progress: 0.2, isFinal: false, now: 0.3).emit, "250 ms and ≥1 % emits")
    check(!throttle.sample(progress: 0.3, isFinal: false, now: 0.6).persist, "Disk write at most once per second")
    check(throttle.sample(progress: 0.301, isFinal: false, now: 1.7) == (true, true), "Heartbeat on a slow link")
    check(throttle.sample(progress: 1, isFinal: true, now: 1.71) == (true, true), "Final 100 % always emits and persists")

    print("UploadLiveActivityModel: \(checks) behavioral checks passed")
  }
}
