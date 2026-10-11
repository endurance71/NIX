import Foundation

// Standalone: swiftc ios/NativeUploadControl.swift tests/NativeUploadControlTests.swift -o /tmp/nix-upload-control-tests
@main
struct NativeUploadControlTests {
  static func main() throws {
    var checks = 0
    func check(_ condition: @autoclosure () -> Bool, _ message: String) {
      precondition(condition(), message)
      checks += 1
    }

    for proposed in ["uploading", "finalizing", "retry_scheduled", "waiting_network", "failed", "completed"] {
      check(NativeUploadControl.preservedState(previous: "paused", proposed: proposed,
        allowPausedTransition: false) == "paused", "Async callback must preserve user pause: \(proposed)")
    }
    check(NativeUploadControl.preservedState(previous: "paused", proposed: "queued",
      allowPausedTransition: true) == "queued", "Explicit resume may leave pause")
    for terminal in ["cancelled", "completed"] {
      check(NativeUploadControl.preservedState(previous: terminal, proposed: "uploading",
        allowPausedTransition: true) == terminal, "Terminal state must never revive")
    }

    // Every trigger (pump, watchdog, timer, network recovery, explicit resume,
    // relaunch reconciliation) calls this same policy before URLSession.resume.
    for state in ["paused", "cancelled", "completed", "failed", "waiting_for_auth", "unknown"] {
      check(!NativeUploadControl.canResume(state: state, snapshotAttempt: "new", taskAttempt: "new",
        nextRetryAt: nil, now: 10_000), "Control state must block resume: \(state)")
    }
    for state in ["queued", "uploading", "finalizing", "retry_scheduled", "waiting_network"] {
      check(!NativeUploadControl.canResume(state: state, snapshotAttempt: "new", taskAttempt: "new",
        nextRetryAt: 15_000, now: 14_999), "Retry deadline must apply to \(state)")
      check(NativeUploadControl.canResume(state: state, snapshotAttempt: "new", taskAttempt: "new",
        nextRetryAt: 15_000, now: 15_000), "Retry becomes eligible exactly at deadline")
      check(!NativeUploadControl.canResume(state: state, snapshotAttempt: "new", taskAttempt: "old",
        nextRetryAt: nil, now: 20_000), "Stale timer/task must not resume replaced attempt")
    }
    struct PersistedRetry: Codable { let deadline: Double }
    let restored = try JSONDecoder().decode(PersistedRetry.self,
      from: JSONEncoder().encode(PersistedRetry(deadline: 15_000)))
    check(!NativeUploadControl.canResume(state: "queued", snapshotAttempt: "new", taskAttempt: "new",
      nextRetryAt: restored.deadline, now: 14_999), "Relaunch must retain retry backoff")
    check(NativeUploadControl.isCurrent(snapshotAttempt: nil, taskAttempt: "legacy:job:0"),
      "Existing pre-upgrade task remains reconcilable")
    check(!NativeUploadControl.isCurrent(snapshotAttempt: "legacy:job:2", taskAttempt: "legacy:job:1"),
      "Normalized pre-upgrade snapshot must reject earlier legacy attempts")
    check(!NativeUploadControl.canEnqueue(control: "paused", snapshotState: nil,
      previousBatch: nil, batch: "batch"), "Pause before first snapshot must block late enqueue")
    check(!NativeUploadControl.canEnqueue(control: "cancelled", snapshotState: nil,
      previousBatch: nil, batch: "batch"), "Cancel before first snapshot must block late enqueue")
    check(!NativeUploadControl.canEnqueue(control: "cancelled", snapshotState: "cancelled",
      previousBatch: "old", batch: "old"), "Cancelled batch must never revive")
    check(NativeUploadControl.canEnqueue(control: "cancelled", snapshotState: "cancelled",
      previousBatch: "old", batch: "new"), "Explicit retry with new server batch may replace cancelled transfer")
    check(NativeUploadControl.resumedState(finalized: true, nextRetryAt: nil,
      online: false, now: 10_000) == "completed", "Consume successful finalize deferred during pause")
    check(NativeUploadControl.resumedState(finalized: false, nextRetryAt: 15_000,
      online: true, now: 10_000) == "retry_scheduled", "Manual resume must retain remaining backoff")
    check(NativeUploadControl.resumedState(finalized: false, nextRetryAt: nil,
      online: false, now: 10_000) == "waiting_network", "Resume offline must wait for connectivity")

    let first = URLSession(configuration: .ephemeral)
    let second = URLSession(configuration: .ephemeral)
    defer { first.invalidateAndCancel(); second.invalidateAndCancel() }
    let url = URL(string: "https://example.invalid/upload")!
    let taskA = first.dataTask(with: url)
    let taskB = second.dataTask(with: url)
    check(taskA.taskIdentifier == taskB.taskIdentifier, "Fixture should collide across sessions")
    let keyA = NativeUploadTaskKey(session: first, task: taskA)
    let keyB = NativeUploadTaskKey(session: second, task: taskB)
    check(keyA != keyB, "Response bodies must be scoped by session identity")
    let responses = [keyA: "PUT", keyB: "finalize"]
    check(responses.count == 2 && responses[keyA] == "PUT" && responses[keyB] == "finalize",
      "Same numeric task ID must retain separate responses")
    print("NativeUploadControl: \(checks) behavioral checks passed")
  }
}
