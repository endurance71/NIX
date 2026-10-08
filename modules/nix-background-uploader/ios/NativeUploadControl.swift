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
