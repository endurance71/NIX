import Foundation

/// URLSession task identifiers are scoped to their session, never to the app.
struct NativeUploadTaskKey: Hashable {
  let session: ObjectIdentifier
  let task: Int

  init(session: URLSession, task: URLSessionTask) {
    self.session = ObjectIdentifier(session)
    self.task = task.taskIdentifier
  }
}

enum NativeUploadControl {
  static func canEnqueue(control: String?, snapshotState: String?, previousBatch: String?, batch: String) -> Bool {
    if control == "paused" || snapshotState == "paused" { return false }
    if control == "cancelled" {
      guard let previousBatch else { return false }
      return previousBatch != batch
    }
    return true
  }

  static func resumedState(finalized: Bool, nextRetryAt: Double?, online: Bool, now: Double) -> String {
    if finalized { return "completed" }
    if (nextRetryAt ?? 0) > now { return "retry_scheduled" }
    return online ? "queued" : "waiting_network"
  }

  static func preservedState(previous: String, proposed: String, allowPausedTransition: Bool) -> String {
    if ["cancelled", "completed"].contains(previous) { return previous }
    if previous == "paused", !allowPausedTransition { return previous }
    return proposed
  }
  static func isCurrent(snapshotAttempt: String?, taskAttempt: String) -> Bool {
    snapshotAttempt == nil || snapshotAttempt == taskAttempt
  }

  static func canResume(
    state: String?, snapshotAttempt: String?, taskAttempt: String,
    nextRetryAt: Double?, now: Double
  ) -> Bool {
    guard let state,
      ["queued", "uploading", "finalizing", "retry_scheduled", "waiting_network"].contains(state),
      isCurrent(snapshotAttempt: snapshotAttempt, taskAttempt: taskAttempt)
    else { return false }
    return (nextRetryAt ?? 0) <= now
  }
}

// MARK: - Live Activity model (SEND-2, PERF-8)
// Kept in this file: a new source file in the development pod would need `pod install`.

/// Queue state reported by JS (`reportLiveActivityState`) and kept in the App Group, so the
/// native layer sees work that never reaches URLSession: compression of the next segment,
/// `begin-media-upload`, moderation after finalize, the JS/TUS fallback (SEND-2).
struct UploadLiveActivityJSJob: Codable, Equatable {
  /// Durable job id — the same value as the native snapshot `jobId`.
  var id: String
  /// JS `UploadJobState` (`preparing`, `uploading`, `retry_scheduled`, `finalizing`…).
  var state: String
  /// JS display progress (already banded, see `src/lib/uploadProgress.ts`).
  var progress: Double
}

struct UploadLiveActivityJSState: Codable, Equatable {
  var version: Int
  /// Milliseconds since 1970 — native snapshots updated later are newer than this report.
  var updatedAt: Double
  var locale: String?
  /// Unfinished jobs only (completed, cancelled and expired are omitted by JS).
  var jobs: [UploadLiveActivityJSJob]
}

/// Minimal native snapshot view needed by the Live Activity model.
struct UploadLiveActivityNativeJob: Equatable {
  var id: String
  var state: String
  /// Raw URLSession transfer fraction 0…1.
  var progress: Double
  var updatedAt: Double
  var responseBody: String?
}

struct UploadLiveActivityContent: Equatable {
  var phase: String
  var progress: Double
  var remainingCount: Int
}

/// Same phase and progress model as JS (`uploadProgress.ts` + `buildUploadQueueSummary` +
/// `buildUploadLiveActivityProps`). Pure, so it is testable without ActivityKit.
enum UploadLiveActivityModel {
  static let processingBandEnd = 0.25
  static let sendingBandEnd = 0.95

  /// Sending band: 0.25 + p · 0.70.
  static func sendingProgress(_ transferFraction: Double) -> Double {
    processingBandEnd + clamp01(transferFraction) * (sendingBandEnd - processingBandEnd)
  }

  /// Native snapshot → (JS job state, display progress). `floor` is the last display progress
  /// JS reported for the job; within the background session the ring never moves below it.
  static func jobState(native: UploadLiveActivityNativeJob, floor: Double) -> (state: String, progress: Double)? {
    let floor = clamp01(floor)
    switch native.state {
    case "queued":
      return ("uploading", max(floor, processingBandEnd))
    case "uploading":
      return ("uploading", max(floor, sendingProgress(native.progress)))
    case "retry_scheduled", "waiting_network", "waiting_for_auth", "paused", "failed":
      // An automatic retry stays „sending” (NOTIF-10); the aggregate maps it like JS does.
      return (native.state, floor)
    case "finalizing":
      return ("finalizing", max(floor, sendingBandEnd))
    case "completed":
      switch finalizeStatus(native.responseBody) {
      case "moderation_pending":
        return ("finalizing", max(floor, sendingBandEnd))
      case "failed":
        return ("failed", floor)
      case "partially_completed":
        return ("partially_completed", 1)
      default:
        return ("completed", 1)
      }
    case "cancelled":
      return nil
    default:
      return ("uploading", floor)
    }
  }

  /// Mirrors `parseFinalizeUploadStatus` in `durableUploadPolicy.ts`.
  static func finalizeStatus(_ responseBody: String?) -> String {
    guard let responseBody, let data = responseBody.data(using: .utf8),
      let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let status = payload["status"] as? String
    else { return "completed" }
    return status
  }

  /// Merged queue view. Returns nil when there is nothing to show.
  ///
  /// - Without a JS report the native layer only knows URLSession work, so it may never claim
  ///   „completed” (it cannot see compression or moderation still pending).
  static func build(js: UploadLiveActivityJSState?, native: [UploadLiveActivityNativeJob]) -> UploadLiveActivityContent? {
    var jobs: [(state: String, progress: Double)] = []
    let nativeById = Dictionary(native.map { ($0.id, $0) }, uniquingKeysWith: { lhs, rhs in
      lhs.updatedAt >= rhs.updatedAt ? lhs : rhs
    })
    if let js {
      var listed = Set<String>()
      for job in js.jobs {
        listed.insert(job.id)
        if let snapshot = nativeById[job.id], snapshot.updatedAt > js.updatedAt {
          if let derived = jobState(native: snapshot, floor: job.progress) { jobs.append(derived) }
        } else {
          jobs.append((job.state, clamp01(job.progress)))
        }
      }
      // Transfers enqueued after the last report (JS suspended right after handing them over).
      for snapshot in native where !listed.contains(snapshot.id) && snapshot.updatedAt > js.updatedAt {
        guard !["completed", "cancelled", "failed", "waiting_for_auth"].contains(snapshot.state),
          let derived = jobState(native: snapshot, floor: 0)
        else { continue }
        jobs.append(derived)
      }
    } else {
      for snapshot in native {
        guard snapshot.state != "completed", let derived = jobState(native: snapshot, floor: 0) else { continue }
        jobs.append(derived)
      }
    }
    guard let content = aggregate(jobs) else { return nil }
    if js == nil && content.phase == "completed" { return nil }
    return content
  }

  /// Mirrors `buildUploadQueueSummary` + `buildUploadLiveActivityProps`.
  static func aggregate(_ jobs: [(state: String, progress: Double)]) -> UploadLiveActivityContent? {
    let terminal: Set<String> = ["completed", "partially_completed", "cancelled", "expired"]
    let visible = jobs.filter { $0.state != "cancelled" && $0.state != "expired" }
    guard !visible.isEmpty else { return nil }
    let active = visible.filter { !terminal.contains($0.state) && $0.state != "failed" }
    let failed = visible.filter { $0.state == "failed" }
    let completed = visible.filter { $0.state == "completed" || $0.state == "partially_completed" }
    let progress = !active.isEmpty
      ? active.map(\.progress).reduce(0, +) / Double(active.count)
      : (completed.isEmpty ? 0 : 1)
    let priority = [
      "waiting_for_auth", "retry_scheduled", "waiting_network", "paused", "preparing",
      "requesting_target", "uploading", "finalizing", "queued", "staging",
    ]
    let activePhase = priority.first { state in active.contains { $0.state == state } }
    let summaryPhase = failed.first?.state ?? activePhase ?? completed.first?.state
    let phase: String
    if !failed.isEmpty || summaryPhase == "failed" || summaryPhase == "waiting_for_auth" {
      phase = "failed"
    } else if summaryPhase == "waiting_network" {
      phase = "waiting_network"
    } else if summaryPhase == "paused" {
      phase = "paused"
    } else if summaryPhase == "preparing" {
      phase = "preparing"
    } else if summaryPhase == "finalizing" {
      phase = "finalizing"
    } else if active.isEmpty && !completed.isEmpty {
      phase = "completed"
    } else {
      phase = "uploading"
    }
    return UploadLiveActivityContent(
      phase: phase, progress: clamp01(progress), remainingCount: active.count + failed.count
    )
  }

  static func clamp01(_ value: Double) -> Double {
    value.isFinite ? min(1, max(0, value)) : 0
  }
}

/// Rate limiter for `didSendBodyData` (PERF-8): progress events at most every 250 ms with ≥1 %
/// change, a 1 s heartbeat for slow links, and the final 100 % always.
struct UploadProgressThrottle {
  static let minInterval: TimeInterval = 0.25
  static let minDelta = 0.01
  static let heartbeatInterval: TimeInterval = 1
  static let persistInterval: TimeInterval = 1

  var lastEmitAt: TimeInterval = -.infinity
  var lastProgress: Double = -1
  var lastPersistAt: TimeInterval = -.infinity

  /// Returns (emit, persist) for a progress sample and records it when emitted.
  mutating func sample(progress: Double, isFinal: Bool, now: TimeInterval) -> (emit: Bool, persist: Bool) {
    let elapsed = now - lastEmitAt
    let delta = abs(progress - lastProgress)
    let emit = isFinal
      || lastProgress < 0
      || (elapsed >= Self.minInterval && delta >= Self.minDelta)
      || (elapsed >= Self.heartbeatInterval && delta > 0)
    guard emit else { return (false, false) }
    lastEmitAt = now
    lastProgress = progress
    let persist = isFinal || now - lastPersistAt >= Self.persistInterval
    if persist { lastPersistAt = now }
    return (true, persist)
  }
}
