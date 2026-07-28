import ExpoWidgets
import Foundation
import Network

private let appGroupIdentifier = "group.com.damianmotylinski.nixapp.uploads"
private let snapshotsStorageKey = "nix.background.upload.snapshots.v1"
private let liveActivityName = "UploadStatusActivity"
private let liveActivityURL = URL(string: "nix://inbox")

private enum NativeUploadState: String, Codable {
  case queued
  case uploading
  case retryScheduled = "retry_scheduled"
  case waitingNetwork = "waiting_network"
  case waitingForAuth = "waiting_for_auth"
  case finalizing
  case completed
  case failed
  case paused
  case cancelled
}

private struct NativeUploadSnapshot: Codable {
  var jobId: String
  var batchId: String
  var state: NativeUploadState
  var progress: Double
  var bytesSent: Int64
  var bytesTotal: Int64
  var attempt: Int
  var statusCode: Int?
  var errorCode: String?
  var errorMessage: String?
  var responseBody: String?
  var updatedAt: Double

  var dictionary: [String: Any?] {
    [
      "jobId": jobId,
      "batchId": batchId,
      "state": state.rawValue,
      "progress": progress,
      "bytesSent": bytesSent,
      "bytesTotal": bytesTotal,
      "attempt": attempt,
      "statusCode": statusCode,
      "errorCode": errorCode,
      "errorMessage": errorMessage,
      "responseBody": responseBody,
      "updatedAt": updatedAt
    ]
  }
}

private enum NativeTaskKind: String, Codable {
  case upload
  case finalize
}

private struct NativeTaskDescriptor: Codable {
  var kind: NativeTaskKind
  var jobId: String
  var batchId: String
  var filePath: String
  var requestUrl: String
  var requestHeaders: [String: String]
  var finalizeUrl: String
  var finalizeHeaders: [String: String]
  var finalizeToken: String
  var attempt: Int
  var expiresAt: Double
}

public final class BackgroundUploadCoordinator: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate, @unchecked Sendable {
  public static let sessionIdentifier = "com.damianmotylinski.nixapp.media-upload"
  public static let shared = BackgroundUploadCoordinator()

  public var eventSink: ((String, [String: Any?]) -> Void)?

  private let delegateQueue: OperationQueue
  private let stateQueue = DispatchQueue(label: "com.damianmotylinski.nixapp.media-upload.state")
  private let pathMonitor = NWPathMonitor()
  private let pathQueue = DispatchQueue(label: "com.damianmotylinski.nixapp.media-upload.network")
  private var isWiFi = false
  private var isOnline = true
  private var responseBodies: [Int: Data] = [:]
  private var backgroundCompletion: (() -> Void)?
  private var lastLiveActivityUpdateAt: TimeInterval = 0
  private var lastLiveActivityProgress: Double = -1
  private var lastLiveActivityPhase = ""

  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
    configuration.waitsForConnectivity = true
    configuration.allowsCellularAccess = true
    configuration.isDiscretionary = false
    configuration.sessionSendsLaunchEvents = true
    configuration.httpMaximumConnectionsPerHost = 2
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.urlCache = nil
    return URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
  }()

  private override init() {
    delegateQueue = OperationQueue()
    delegateQueue.name = "com.damianmotylinski.nixapp.media-upload.delegate"
    delegateQueue.maxConcurrentOperationCount = 1
    super.init()
    pathMonitor.pathUpdateHandler = { [weak self] path in
      guard let self else { return }
      self.isOnline = path.status == .satisfied
      self.isWiFi = path.usesInterfaceType(.wifi)
      if self.isOnline {
        Task { await self.pumpTasks() }
      } else {
        self.markActiveUploadsWaitingForNetwork()
      }
    }
    pathMonitor.start(queue: pathQueue)
    _ = session
  }

  public func attachBackgroundCompletion(_ completion: @escaping () -> Void) {
    stateQueue.async {
      self.backgroundCompletion = completion
      _ = self.session
    }
  }

  public func stageFile(jobId: String, sourceUri: URL, fileName: String) throws -> [String: Any] {
    guard sourceUri.isFileURL else {
      throw NSError(
        domain: "NixBackgroundUploader",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Only file:// sources can be staged."]
      )
    }
    let safeJobId = sanitizePathComponent(jobId)
    let safeFileName = sanitizePathComponent(fileName)
    guard !safeJobId.isEmpty, !safeFileName.isEmpty else {
      throw NSError(
        domain: "NixBackgroundUploader",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Invalid staging path."]
      )
    }

    let fileManager = FileManager.default
    let appSupport = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let jobDirectory = appSupport
      .appendingPathComponent("NiX", isDirectory: true)
      .appendingPathComponent("Uploads", isDirectory: true)
      .appendingPathComponent(safeJobId, isDirectory: true)
    try fileManager.createDirectory(
      at: jobDirectory,
      withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
    )
    var excludedDirectory = jobDirectory
    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    try? excludedDirectory.setResourceValues(resourceValues)

    let destination = jobDirectory.appendingPathComponent(safeFileName, isDirectory: false)
    if sourceUri.standardizedFileURL != destination.standardizedFileURL {
      if fileManager.fileExists(atPath: destination.path) {
        try fileManager.removeItem(at: destination)
      }
      try fileManager.copyItem(at: sourceUri, to: destination)
    }
    try fileManager.setAttributes(
      [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
      ofItemAtPath: destination.path
    )
    var excludedFile = destination
    try? excludedFile.setResourceValues(resourceValues)
    let attributes = try fileManager.attributesOfItem(atPath: destination.path)
    let size = (attributes[.size] as? NSNumber)?.int64Value ?? 0
    return ["uri": destination.absoluteString, "sizeBytes": size]
  }

  public func deleteStagedJob(jobId: String) throws {
    let safeJobId = sanitizePathComponent(jobId)
    guard !safeJobId.isEmpty else { return }
    let fileManager = FileManager.default
    let appSupport = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let jobDirectory = appSupport
      .appendingPathComponent("NiX", isDirectory: true)
      .appendingPathComponent("Uploads", isDirectory: true)
      .appendingPathComponent(safeJobId, isDirectory: true)
    if fileManager.fileExists(atPath: jobDirectory.path) {
      try fileManager.removeItem(at: jobDirectory)
    }
    removeSnapshot(jobId: jobId)
  }

  public func findStagedFile(jobId: String, role: String) throws -> [String: Any]? {
    let safeJobId = sanitizePathComponent(jobId)
    let safeRole = sanitizePathComponent(role)
    guard !safeJobId.isEmpty, !safeRole.isEmpty else { return nil }
    let fileManager = FileManager.default
    let appSupport = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let jobDirectory = appSupport
      .appendingPathComponent("NiX", isDirectory: true)
      .appendingPathComponent("Uploads", isDirectory: true)
      .appendingPathComponent(safeJobId, isDirectory: true)
    guard let files = try? fileManager.contentsOfDirectory(
      at: jobDirectory,
      includingPropertiesForKeys: [.fileSizeKey],
      options: [.skipsHiddenFiles]
    ), let file = files.first(where: { $0.lastPathComponent.hasPrefix("\(safeRole).") }) else {
      return nil
    }
    let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    return ["uri": file.absoluteString, "sizeBytes": size]
  }

  public func enqueue(
    jobId: String,
    batchId: String,
    fileUri: URL,
    uploadUrl: URL,
    uploadHeaders: [String: String],
    finalizeUrl: URL,
    finalizeHeaders: [String: String],
    finalizeToken: String,
    expiresAt: Double
  ) async throws -> [String: Any] {
    guard fileUri.isFileURL, FileManager.default.fileExists(atPath: fileUri.path) else {
      throw NSError(
        domain: "NixBackgroundUploader",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Staged upload file does not exist."]
      )
    }
    if await hasTask(jobId: jobId) {
      return ["scheduled": true, "duplicate": true]
    }

    let descriptor = NativeTaskDescriptor(
      kind: .upload,
      jobId: jobId,
      batchId: batchId,
      filePath: fileUri.path,
      requestUrl: uploadUrl.absoluteString,
      requestHeaders: uploadHeaders,
      finalizeUrl: finalizeUrl.absoluteString,
      finalizeHeaders: finalizeHeaders,
      finalizeToken: finalizeToken,
      attempt: 0,
      expiresAt: expiresAt
    )
    let task = try makeUploadTask(descriptor: descriptor)
    task.suspend()
    saveSnapshot(
      NativeUploadSnapshot(
        jobId: jobId,
        batchId: batchId,
        state: isOnline ? .queued : .waitingNetwork,
        progress: 0,
        bytesSent: 0,
        bytesTotal: fileSize(path: fileUri.path),
        attempt: 0,
        statusCode: nil,
        errorCode: nil,
        errorMessage: nil,
        responseBody: nil,
        updatedAt: nowMilliseconds()
      )
    )
    await pumpTasks()
    return ["scheduled": true, "nativeTaskId": task.taskIdentifier]
  }

  public func pause(jobId: String) async {
    let tasks = await allTasks()
    tasks.filter { descriptor(for: $0)?.jobId == jobId }.forEach { $0.suspend() }
    patchSnapshot(jobId: jobId) {
      $0.state = .paused
      $0.updatedAt = nowMilliseconds()
    }
    emitState(jobId: jobId)
    updateLiveActivity()
  }

  public func resume(jobId: String) async {
    patchSnapshot(jobId: jobId) {
      $0.state = isOnline ? .queued : .waitingNetwork
      $0.errorCode = nil
      $0.errorMessage = nil
      $0.updatedAt = nowMilliseconds()
    }
    await pumpTasks()
    emitState(jobId: jobId)
    updateLiveActivity()
  }

  public func cancel(jobId: String) async {
    patchSnapshot(jobId: jobId) {
      $0.state = .cancelled
      $0.updatedAt = nowMilliseconds()
    }
    let tasks = await allTasks()
    tasks.filter { descriptor(for: $0)?.jobId == jobId }.forEach { $0.cancel() }
    emitState(jobId: jobId)
    updateLiveActivity()
  }

  public func reconcile() async -> [[String: Any?]] {
    await pumpTasks()
    updateLiveActivity()
    return snapshotDictionaries()
  }

  public func snapshotDictionaries() -> [[String: Any?]] {
    loadSnapshots()
      .values
      .sorted { $0.updatedAt > $1.updatedAt }
      .map(\.dictionary)
  }

  private func hasTask(jobId: String) async -> Bool {
    await allTasks().contains { descriptor(for: $0)?.jobId == jobId }
  }

  private func allTasks() async -> [URLSessionTask] {
    await withCheckedContinuation { continuation in
      session.getAllTasks { continuation.resume(returning: $0) }
    }
  }

  private func makeUploadTask(descriptor: NativeTaskDescriptor) throws -> URLSessionUploadTask {
    guard let url = URL(string: descriptor.requestUrl) else {
      throw NSError(
        domain: "NixBackgroundUploader",
        code: 4,
        userInfo: [NSLocalizedDescriptionKey: "Invalid upload URL."]
      )
    }
    var request = URLRequest(url: url)
    request.httpMethod = "PUT"
    descriptor.requestHeaders.forEach { request.setValue($1, forHTTPHeaderField: $0) }
    let task = session.uploadTask(with: request, fromFile: URL(fileURLWithPath: descriptor.filePath))
    task.taskDescription = encodeDescriptor(descriptor)
    return task
  }

  private func makeFinalizeTask(descriptor: NativeTaskDescriptor) throws -> URLSessionUploadTask {
    guard let url = URL(string: descriptor.finalizeUrl) else {
      throw NSError(
        domain: "NixBackgroundUploader",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "Invalid finalize URL."]
      )
    }
    let body: [String: String] = [
      "batchId": descriptor.batchId,
      "token": descriptor.finalizeToken
    ]
    let bodyData = try JSONSerialization.data(withJSONObject: body)
    let bodyDirectory = FileManager.default.temporaryDirectory
      .appendingPathComponent("nix-finalizers", isDirectory: true)
    try FileManager.default.createDirectory(at: bodyDirectory, withIntermediateDirectories: true)
    let bodyFile = bodyDirectory.appendingPathComponent("\(descriptor.jobId)-\(descriptor.attempt).json")
    try bodyData.write(to: bodyFile, options: .atomic)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    descriptor.finalizeHeaders.forEach { request.setValue($1, forHTTPHeaderField: $0) }
    let task = session.uploadTask(with: request, fromFile: bodyFile)
    var finalizeDescriptor = descriptor
    finalizeDescriptor.kind = .finalize
    finalizeDescriptor.filePath = bodyFile.path
    finalizeDescriptor.requestUrl = descriptor.finalizeUrl
    finalizeDescriptor.requestHeaders = descriptor.finalizeHeaders
    task.taskDescription = encodeDescriptor(finalizeDescriptor)
    return task
  }

  private func scheduleRetry(_ descriptor: NativeTaskDescriptor, statusCode: Int?, message: String?) {
    guard Date().timeIntervalSince1970 * 1000 < descriptor.expiresAt else {
      fail(
        descriptor,
        state: .failed,
        statusCode: statusCode,
        code: "EXPIRED",
        message: "Upload retention window expired."
      )
      return
    }
    var next = descriptor
    next.attempt += 1
    let delays: [TimeInterval] = [5, 15, 60, 300, 900, 3600, 21600]
    let base = delays[min(max(0, next.attempt - 1), delays.count - 1)]
    let jitter = Double.random(in: 0.8 ... 1.2)
    do {
      let task = next.kind == .upload
        ? try makeUploadTask(descriptor: next)
        : try makeFinalizeTask(descriptor: next)
      task.earliestBeginDate = Date().addingTimeInterval(base * jitter)
      patchSnapshot(jobId: descriptor.jobId) {
        $0.state = .retryScheduled
        $0.attempt = next.attempt
        $0.statusCode = statusCode
        $0.errorCode = "RETRY_SCHEDULED"
        $0.errorMessage = message
        $0.updatedAt = nowMilliseconds()
      }
      // A background URLSession only honors earliestBeginDate after the task
      // is resumed. The system then owns the delayed retry even if JS exits.
      task.resume()
    } catch {
      fail(
        descriptor,
        state: .failed,
        statusCode: statusCode,
        code: "RETRY_CREATE_FAILED",
        message: error.localizedDescription
      )
    }
  }

  private func fail(
    _ descriptor: NativeTaskDescriptor,
    state: NativeUploadState,
    statusCode: Int?,
    code: String,
    message: String
  ) {
    patchSnapshot(jobId: descriptor.jobId) {
      $0.state = state
      $0.statusCode = statusCode
      $0.errorCode = code
      $0.errorMessage = message
      $0.updatedAt = nowMilliseconds()
    }
    emitState(jobId: descriptor.jobId)
    updateLiveActivity()
  }

  private func markActiveUploadsWaitingForNetwork() {
    let snapshots = loadSnapshots()
    for snapshot in snapshots.values where snapshot.state == .uploading || snapshot.state == .queued {
      patchSnapshot(jobId: snapshot.jobId) {
        $0.state = .waitingNetwork
        $0.updatedAt = nowMilliseconds()
      }
      emitState(jobId: snapshot.jobId)
    }
    updateLiveActivity()
  }

  private func pumpTasks() async {
    guard isOnline else {
      updateLiveActivity()
      return
    }
    let tasks = await allTasks()
    let running = tasks.filter {
      guard let descriptor = descriptor(for: $0), descriptor.kind == .upload else { return false }
      return $0.state == .running
    }.count
    var available = max(0, (isWiFi ? 2 : 1) - running)
    let candidates = tasks
      .filter {
        guard let descriptor = descriptor(for: $0) else { return false }
        guard $0.state == .suspended else { return false }
        let snapshot = loadSnapshots()[descriptor.jobId]
        return snapshot?.state != .paused && snapshot?.state != .cancelled
      }
      .sorted { ($0.earliestBeginDate ?? .distantPast) < ($1.earliestBeginDate ?? .distantPast) }

    for task in candidates {
      guard let descriptor = descriptor(for: task) else { continue }
      if let earliest = task.earliestBeginDate, earliest > Date() { continue }
      if descriptor.kind == .upload {
        guard available > 0 else { continue }
        available -= 1
        patchSnapshot(jobId: descriptor.jobId) {
          $0.state = .uploading
          $0.attempt = descriptor.attempt
          $0.updatedAt = nowMilliseconds()
        }
      } else {
        patchSnapshot(jobId: descriptor.jobId) {
          $0.state = .finalizing
          $0.updatedAt = nowMilliseconds()
        }
      }
      task.resume()
      emitState(jobId: descriptor.jobId)
    }
    updateLiveActivity()
  }

  public func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64,
    totalBytesExpectedToSend: Int64
  ) {
    guard let descriptor = descriptor(for: task), descriptor.kind == .upload else { return }
    let total = max(totalBytesExpectedToSend, 1)
    let progress = min(1, max(0, Double(totalBytesSent) / Double(total)))
    patchSnapshot(jobId: descriptor.jobId) {
      $0.state = .uploading
      $0.progress = progress
      $0.bytesSent = totalBytesSent
      $0.bytesTotal = totalBytesExpectedToSend
      $0.attempt = descriptor.attempt
      $0.updatedAt = nowMilliseconds()
    }
    eventSink?("onUploadProgress", [
      "jobId": descriptor.jobId,
      "batchId": descriptor.batchId,
      "progress": progress,
      "bytesSent": totalBytesSent,
      "bytesTotal": totalBytesExpectedToSend
    ])
    updateLiveActivity()
  }

  public func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive data: Data
  ) {
    stateQueue.sync {
      responseBodies[dataTask.taskIdentifier, default: Data()].append(data)
    }
  }

  public func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard let descriptor = descriptor(for: task) else { return }
    let statusCode = (task.response as? HTTPURLResponse)?.statusCode
    let responseData = stateQueue.sync { responseBodies.removeValue(forKey: task.taskIdentifier) }
    let responseBody = responseData.flatMap { String(data: $0, encoding: .utf8) }
    let currentState = loadSnapshots()[descriptor.jobId]?.state
    if currentState == .cancelled { return }

    if let error = error as NSError? {
      if error.code == NSURLErrorCancelled && currentState == .paused { return }
      if isTransient(error: error) {
        scheduleRetry(descriptor, statusCode: statusCode, message: error.localizedDescription)
      } else {
        fail(
          descriptor,
          state: .failed,
          statusCode: statusCode,
          code: "NETWORK_ERROR",
          message: error.localizedDescription
        )
      }
      Task { await pumpTasks() }
      return
    }

    guard let statusCode else {
      scheduleRetry(descriptor, statusCode: nil, message: "Missing HTTP response.")
      return
    }

    if (200 ... 299).contains(statusCode) {
      if descriptor.kind == .upload {
        do {
          let finalizer = try makeFinalizeTask(descriptor: descriptor)
          finalizer.suspend()
          patchSnapshot(jobId: descriptor.jobId) {
            $0.state = .finalizing
            $0.progress = 1
            $0.bytesSent = $0.bytesTotal
            $0.statusCode = statusCode
            $0.updatedAt = nowMilliseconds()
          }
        } catch {
          fail(
            descriptor,
            state: .failed,
            statusCode: statusCode,
            code: "FINALIZER_CREATE_FAILED",
            message: error.localizedDescription
          )
        }
      } else {
        patchSnapshot(jobId: descriptor.jobId) {
          $0.state = .completed
          $0.progress = 1
          $0.statusCode = statusCode
          $0.responseBody = responseBody
          $0.errorCode = nil
          $0.errorMessage = nil
          $0.updatedAt = nowMilliseconds()
        }
        emitState(jobId: descriptor.jobId)
        updateLiveActivity()
      }
    } else if statusCode == 401 || statusCode == 403
      || (
        descriptor.kind == .upload
        && [400, 410].contains(statusCode)
        && (responseBody?.lowercased().contains("expir") ?? false)
      ) {
      fail(
        descriptor,
        state: .waitingForAuth,
        statusCode: statusCode,
        code: statusCode == 401 || statusCode == 403 ? "AUTH_REQUIRED" : "UPLOAD_URL_EXPIRED",
        message: responseBody ?? "Upload authorization expired."
      )
    } else if statusCode == 409 {
      if descriptor.kind == .upload {
        // A prior PUT may have reached Storage before its callback was
        // delivered. Finalization verifies exact size and MIME, so this
        // reconciles the object without treating the conflict as success.
        do {
          let finalizer = try makeFinalizeTask(descriptor: descriptor)
          finalizer.suspend()
          patchSnapshot(jobId: descriptor.jobId) {
            $0.state = .finalizing
            $0.progress = 1
            $0.statusCode = statusCode
            $0.errorCode = "RECONCILING_OBJECT"
            $0.errorMessage = responseBody
            $0.updatedAt = nowMilliseconds()
          }
        } catch {
          fail(
            descriptor,
            state: .failed,
            statusCode: statusCode,
            code: "RECONCILE_REQUIRED",
            message: error.localizedDescription
          )
        }
      } else {
        fail(
          descriptor,
          state: .failed,
          statusCode: statusCode,
          code: "RECONCILE_REQUIRED",
          message: responseBody ?? "The remote object requires reconciliation."
        )
      }
    } else if statusCode == 413 {
      fail(
        descriptor,
        state: .failed,
        statusCode: statusCode,
        code: "FILE_TOO_LARGE",
        message: responseBody ?? "The uploaded file is too large."
      )
    } else if statusCode >= 500 || statusCode == 408 || statusCode == 429 {
      scheduleRetry(descriptor, statusCode: statusCode, message: responseBody)
    } else {
      fail(
        descriptor,
        state: .failed,
        statusCode: statusCode,
        code: "HTTP_\(statusCode)",
        message: responseBody ?? "Upload request failed."
      )
    }
    Task { await pumpTasks() }
  }

  public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    stateQueue.async {
      let completion = self.backgroundCompletion
      self.backgroundCompletion = nil
      DispatchQueue.main.async {
        completion?()
      }
    }
  }

  private func updateLiveActivity() {
    let snapshots = loadSnapshots().values
    let active = snapshots.filter {
      ![NativeUploadState.completed, .cancelled].contains($0.state)
    }
    let completed = snapshots.filter { $0.state == .completed }
    let failed = active.filter {
      $0.state == .failed || $0.state == .waitingForAuth || $0.state == .retryScheduled
    }
    let waiting = active.filter { $0.state == .waitingNetwork }
    let progress = active.isEmpty
      ? (completed.isEmpty ? 0 : 1)
      : active.map(\.progress).reduce(0, +) / Double(active.count)
    let phase: String
    if !failed.isEmpty {
      phase = "failed"
    } else if !waiting.isEmpty {
      phase = "waiting_network"
    } else if active.contains(where: { $0.state == .finalizing }) {
      phase = "finalizing"
    } else if active.isEmpty && !completed.isEmpty {
      phase = "completed"
    } else {
      phase = "uploading"
    }
    let props: [String: Any] = [
      "phase": phase,
      "progress": progress,
      "remainingCount": active.count,
      "updatedAt": nowMilliseconds()
    ]
    let shouldPublish = stateQueue.sync { () -> Bool in
      let currentTime = Date().timeIntervalSince1970
      let phaseChanged = phase != lastLiveActivityPhase
      let progressChanged = abs(progress - lastLiveActivityProgress) >= 0.01
      let intervalElapsed = currentTime - lastLiveActivityUpdateAt >= 1
      guard phaseChanged || (progressChanged && intervalElapsed) else { return false }
      lastLiveActivityPhase = phase
      lastLiveActivityProgress = progress
      lastLiveActivityUpdateAt = currentTime
      return true
    }
    guard shouldPublish else { return }
    guard let data = try? JSONSerialization.data(withJSONObject: props),
      let propsString = String(data: data, encoding: .utf8) else {
      return
    }
    Task {
      if phase == "completed" {
        await ExpoWidgetsLiveActivityBridge.end(
          name: liveActivityName,
          props: propsString,
          after: Date().addingTimeInterval(30)
        )
      } else {
        await ExpoWidgetsLiveActivityBridge.startOrUpdate(
          name: liveActivityName,
          props: propsString,
          url: liveActivityURL
        )
      }
    }
  }

  private func emitState(jobId: String) {
    guard let snapshot = loadSnapshots()[jobId] else { return }
    eventSink?("onUploadState", snapshot.dictionary)
  }

  private func loadSnapshots() -> [String: NativeUploadSnapshot] {
    stateQueue.sync {
      guard let defaults = UserDefaults(suiteName: appGroupIdentifier),
        let data = defaults.data(forKey: snapshotsStorageKey),
        let decoded = try? JSONDecoder().decode([String: NativeUploadSnapshot].self, from: data) else {
        return [:]
      }
      return decoded
    }
  }

  private func saveSnapshot(_ snapshot: NativeUploadSnapshot) {
    stateQueue.sync {
      guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return }
      var snapshots: [String: NativeUploadSnapshot] = [:]
      if let data = defaults.data(forKey: snapshotsStorageKey),
        let decoded = try? JSONDecoder().decode([String: NativeUploadSnapshot].self, from: data) {
        snapshots = decoded
      }
      snapshots[snapshot.jobId] = snapshot
      if let encoded = try? JSONEncoder().encode(snapshots) {
        defaults.set(encoded, forKey: snapshotsStorageKey)
      }
    }
    emitState(jobId: snapshot.jobId)
  }

  private func patchSnapshot(jobId: String, mutate: (inout NativeUploadSnapshot) -> Void) {
    var updated: NativeUploadSnapshot?
    stateQueue.sync {
      guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return }
      var snapshots: [String: NativeUploadSnapshot] = [:]
      if let data = defaults.data(forKey: snapshotsStorageKey),
        let decoded = try? JSONDecoder().decode([String: NativeUploadSnapshot].self, from: data) {
        snapshots = decoded
      }
      guard var snapshot = snapshots[jobId] else { return }
      mutate(&snapshot)
      snapshots[jobId] = snapshot
      if let encoded = try? JSONEncoder().encode(snapshots) {
        defaults.set(encoded, forKey: snapshotsStorageKey)
      }
      updated = snapshot
    }
    if let updated {
      eventSink?("onUploadState", updated.dictionary)
    }
  }

  private func removeSnapshot(jobId: String) {
    stateQueue.sync {
      guard let defaults = UserDefaults(suiteName: appGroupIdentifier),
        let data = defaults.data(forKey: snapshotsStorageKey),
        var snapshots = try? JSONDecoder().decode(
          [String: NativeUploadSnapshot].self,
          from: data
        ) else {
        return
      }
      snapshots.removeValue(forKey: jobId)
      if let encoded = try? JSONEncoder().encode(snapshots) {
        defaults.set(encoded, forKey: snapshotsStorageKey)
      }
    }
  }

  private func descriptor(for task: URLSessionTask) -> NativeTaskDescriptor? {
    guard let raw = task.taskDescription, let data = raw.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(NativeTaskDescriptor.self, from: data)
  }

  private func encodeDescriptor(_ descriptor: NativeTaskDescriptor) -> String? {
    guard let data = try? JSONEncoder().encode(descriptor) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private func fileSize(path: String) -> Int64 {
    let attributes = try? FileManager.default.attributesOfItem(atPath: path)
    return (attributes?[.size] as? NSNumber)?.int64Value ?? 0
  }

  private func sanitizePathComponent(_ value: String) -> String {
    value.replacingOccurrences(
      of: "[^A-Za-z0-9._-]",
      with: "_",
      options: .regularExpression
    )
  }

  private func isTransient(error: NSError) -> Bool {
    guard error.domain == NSURLErrorDomain else { return false }
    return [
      NSURLErrorTimedOut,
      NSURLErrorCannotFindHost,
      NSURLErrorCannotConnectToHost,
      NSURLErrorNetworkConnectionLost,
      NSURLErrorDNSLookupFailed,
      NSURLErrorNotConnectedToInternet,
      NSURLErrorInternationalRoamingOff,
      NSURLErrorCallIsActive,
      NSURLErrorDataNotAllowed
    ].contains(error.code)
  }

  private func nowMilliseconds() -> Double {
    Date().timeIntervalSince1970 * 1000
  }
}
