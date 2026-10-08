import ExpoWidgets
import Foundation
import Network

private let appGroupIdentifier = "group.com.damianmotylinski.nixapp.uploads"
private let snapshotsStorageKey = "nix.background.upload.snapshots.v1"
private let controlsStorageKey = "nix.background.upload.controls.v1"
private let liveActivityLocaleStorageKey = "nix.background.upload.locale.v1"
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
  var putStartedAt: Double?
  var putEndedAt: Double?
  var finalizeStartedAt: Double?
  var finalizeEndedAt: Double?
  var attemptId: String? = nil
  var nextRetryAt: Double? = nil
  var locale: String? = nil

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
      "updatedAt": updatedAt,
      "putStartedAt": putStartedAt,
      "putEndedAt": putEndedAt,
      "finalizeStartedAt": finalizeStartedAt,
      "finalizeEndedAt": finalizeEndedAt,
      "attemptId": attemptId,
      "nextRetryAt": nextRetryAt,
      "locale": locale
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
  var mediaType: String
  var sizeBytes: Int64
  var attemptId: String
  var locale: String

  enum CodingKeys: String, CodingKey {
    case kind, jobId, batchId, filePath, requestUrl, requestHeaders
    case finalizeUrl, finalizeHeaders, finalizeToken, attempt, expiresAt
    case mediaType, sizeBytes, attemptId, locale
  }

  init(
    kind: NativeTaskKind,
    jobId: String,
    batchId: String,
    filePath: String,
    requestUrl: String,
    requestHeaders: [String: String],
    finalizeUrl: String,
    finalizeHeaders: [String: String],
    finalizeToken: String,
    attempt: Int,
    expiresAt: Double,
    mediaType: String,
    sizeBytes: Int64,
    attemptId: String = UUID().uuidString,
    locale: String = "en"
  ) {
    self.kind = kind
    self.jobId = jobId
    self.batchId = batchId
    self.filePath = filePath
    self.requestUrl = requestUrl
    self.requestHeaders = requestHeaders
    self.finalizeUrl = finalizeUrl
    self.finalizeHeaders = finalizeHeaders
    self.finalizeToken = finalizeToken
    self.attempt = attempt
    self.expiresAt = expiresAt
    self.mediaType = mediaType
    self.sizeBytes = sizeBytes
    self.attemptId = attemptId
    self.locale = locale
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    kind = try container.decode(NativeTaskKind.self, forKey: .kind)
    jobId = try container.decode(String.self, forKey: .jobId)
    batchId = try container.decode(String.self, forKey: .batchId)
    filePath = try container.decode(String.self, forKey: .filePath)
    requestUrl = try container.decode(String.self, forKey: .requestUrl)
    requestHeaders = try container.decode([String: String].self, forKey: .requestHeaders)
    finalizeUrl = try container.decode(String.self, forKey: .finalizeUrl)
    finalizeHeaders = try container.decode([String: String].self, forKey: .finalizeHeaders)
    finalizeToken = try container.decode(String.self, forKey: .finalizeToken)
    attempt = try container.decode(Int.self, forKey: .attempt)
    expiresAt = try container.decode(Double.self, forKey: .expiresAt)
    // Older in-flight tasks lack these fields — default to background path.
    mediaType = try container.decodeIfPresent(String.self, forKey: .mediaType) ?? "video"
    sizeBytes = try container.decodeIfPresent(Int64.self, forKey: .sizeBytes) ?? 0
    attemptId = try container.decodeIfPresent(String.self, forKey: .attemptId)
      ?? "legacy:\(jobId):\(attempt)"
    locale = try container.decodeIfPresent(String.self, forKey: .locale) ?? "en"
  }
}

// Swift 5 / nonisolated URLSession delegates: stateQueue owns all mutable state.
// URLSession itself is thread-safe. Keep this invariant until an actor-based delegate
// adapter can replace the synchronous Expo/URLSession callback boundaries.
public final class BackgroundUploadCoordinator: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate, @unchecked Sendable {
  public static let sessionIdentifier = "com.damianmotylinski.nixapp.media-upload"
  public static let shared = BackgroundUploadCoordinator()

  private var storedEventSink: ((String, [String: Any?]) -> Void)?
  public var eventSink: ((String, [String: Any?]) -> Void)? {
    get { stateQueue.sync { storedEventSink } }
    set { stateQueue.sync { storedEventSink = newValue } }
  }

  private let delegateQueue: OperationQueue
  private let stateQueue = DispatchQueue(label: "com.damianmotylinski.nixapp.media-upload.state")
  private let pathMonitor = NWPathMonitor()
  private let pathQueue = DispatchQueue(label: "com.damianmotylinski.nixapp.media-upload.network")
  private var networkWiFi = false
  private var networkOnline = true
  private var isWiFi: Bool { stateQueue.sync { networkWiFi } }
  private var isOnline: Bool { stateQueue.sync { networkOnline } }
  private var responseBodies: [NativeUploadTaskKey: Data] = [:]
  private var pumping = false
  private var enqueuingJobs = Set<String>()
  private var backgroundCompletion: (() -> Void)?
  private var lastLiveActivityUpdateAt: TimeInterval = 0
  private var lastLiveActivityProgress: Double = -1
  private var lastLiveActivityPhase = ""
  private var lastLiveActivityLocale = ""
  private var lastLiveActivityCount = -1

  /// Large video / durable transfers that must survive app kill.
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

  /// Small image PUTs + finalize POSTs — avoid iOS background session deferral.
  /// Ephemeral config avoids cookie/connection-pool junk from prior hung PUTs.
  private lazy var foregroundSession: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.waitsForConnectivity = true
    configuration.allowsCellularAccess = true
    configuration.timeoutIntervalForRequest = 120
    configuration.timeoutIntervalForResource = 600
    configuration.httpMaximumConnectionsPerHost = 4
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.urlCache = nil
    return URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
  }()

  /// Prefer foreground URLSession below this size. Background sessions routinely
  /// defer PUTs while the app stays foreground — that left ~2.6MB videos at 0 bytes.
  /// 32MB covers typical NiX compressed clips; true large videos stay durable/background.
  private static let foregroundSizeThresholdBytes: Int64 = 32 * 1024 * 1024

  private override init() {
    delegateQueue = OperationQueue()
    delegateQueue.name = "com.damianmotylinski.nixapp.media-upload.delegate"
    delegateQueue.maxConcurrentOperationCount = 1
    super.init()
    pathMonitor.pathUpdateHandler = { [weak self] path in
      guard let self else { return }
      self.stateQueue.sync {
        self.networkOnline = path.status == .satisfied
        self.networkWiFi = path.usesInterfaceType(.wifi)
      }
      if self.isOnline {
        Task { await self.pumpTasks() }
      } else {
        self.markActiveUploadsWaitingForNetwork()
      }
    }
    pathMonitor.start(queue: pathQueue)
    _ = session
    _ = foregroundSession
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
    expiresAt: Double,
    mediaType: String,
    sizeBytes: Int64,
    locale: String,
    nextRetryAt: Double
  ) async throws -> [String: Any] {
    let acquired = stateQueue.sync { enqueuingJobs.insert(jobId).inserted }
    guard acquired else { return ["scheduled": true, "duplicate": true] }
    defer { _ = stateQueue.sync { enqueuingJobs.remove(jobId) } }
    guard fileUri.isFileURL else {
      throw NSError(
        domain: "NixBackgroundUploader",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Staged upload file does not exist."]
      )
    }
    guard FileManager.default.fileExists(atPath: fileUri.path) else {
      print("[NixBackgroundUploader] enqueue missing file path=\(fileUri.path)")
      throw NSError(
        domain: "NixBackgroundUploader",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Staged upload file does not exist."]
      )
    }
    // A scheduled retry remains attached to its durable deadline and attempt.
    if !canEnqueue(jobId: jobId, batchId: batchId) {
      return ["scheduled": false, "paused": true]
    }
    let prior = await allTasks().filter { self.descriptor(for: $0)?.jobId == jobId }
    if let existing = loadSnapshots()[jobId],
      ![NativeUploadState.failed, .waitingForAuth, .cancelled, .completed].contains(existing.state),
      prior.contains(where: {
        guard let descriptor = self.descriptor(for: $0) else { return false }
        return NativeUploadControl.isCurrent(
          snapshotAttempt: existing.attemptId, taskAttempt: descriptor.attemptId
        ) && ($0.state == .running || $0.state == .suspended)
      }) {
      await pumpTasks()
      return ["scheduled": true, "duplicate": true]
    }
    if !prior.isEmpty {
      print("[NixBackgroundUploader] enqueue cancel prior count=\(prior.count) job=\(jobId)")
      prior.forEach { $0.cancel() }
    }

    let previous = loadSnapshots()[jobId]
    // A late JS enqueue cannot undo a user's pause. Explicit resume clears it.
    if !canEnqueue(jobId: jobId, batchId: batchId) {
      return ["scheduled": false, "paused": true]
    }
    let resolvedSize = fileSize(path: fileUri.path)
    if resolvedSize <= 0 || (mediaType == "image" && resolvedSize > 4 * 1024 * 1024) {
      throw NSError(domain: "NixBackgroundUploader", code: 413,
        userInfo: [NSLocalizedDescriptionKey: "Image exceeds the 4 MiB limit."])
    }
    let retryAt = max(nextRetryAt, previous?.nextRetryAt ?? 0)
    let taskDescriptor = NativeTaskDescriptor(
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
      expiresAt: expiresAt,
      mediaType: mediaType,
      sizeBytes: resolvedSize,
      locale: locale == "pl" ? "pl" : "en"
    )
    let useForeground = prefersForeground(taskDescriptor)
    let task = try makeUploadTask(descriptor: taskDescriptor)
    print(
      "[NixBackgroundUploader] enqueue job=\(jobId) media=\(mediaType) bytes=\(resolvedSize) foreground=\(useForeground) online=\(isOnline) host=\(uploadUrl.host ?? "?")"
    )
    saveSnapshot(
      NativeUploadSnapshot(
        jobId: jobId,
        batchId: batchId,
        state: retryAt > nowMilliseconds() ? .retryScheduled : .queued,
        progress: 0,
        bytesSent: 0,
        bytesTotal: resolvedSize,
        attempt: 0,
        statusCode: nil,
        errorCode: nil,
        errorMessage: nil,
        responseBody: nil,
        updatedAt: nowMilliseconds(),
        putStartedAt: nowMilliseconds(),
        putEndedAt: nil,
        finalizeStartedAt: nil,
        finalizeEndedAt: nil,
        attemptId: taskDescriptor.attemptId,
        nextRetryAt: retryAt > 0 ? retryAt : nil,
        locale: taskDescriptor.locale
      )
    )
    if useForeground {
      // Never park foreground PUTs on the background slot limiter / isOnline
      // gate — that left UI stuck at 31% with a suspended task and no progress events.
      // waitsForConnectivity on the ephemeral session handles offline briefly.
      resumeIfAllowed(task, descriptor: taskDescriptor)
      print(
        "[NixBackgroundUploader] foreground PUT resumed job=\(jobId) task=\(task.taskIdentifier) state=\(String(describing: task.state))"
      )
      schedulePutWatchdog(task: task, descriptor: taskDescriptor)
    } else if !isOnline {
      task.suspend()
      patchSnapshot(jobId: jobId) {
        $0.state = .waitingNetwork
        $0.updatedAt = nowMilliseconds()
      }
    } else {
      // Background session still requires resume(). The old suspend→pump path
      // often left large-video tasks suspended with 0 bytes while foreground.
      resumeIfAllowed(task, descriptor: taskDescriptor)
      print(
        "[NixBackgroundUploader] background PUT resumed job=\(jobId) task=\(task.taskIdentifier) state=\(String(describing: task.state))"
      )
      schedulePutWatchdog(task: task, descriptor: taskDescriptor)
      await pumpTasks()
    }
    if retryAt > nowMilliseconds() {
      scheduleRetryWake(task: task, descriptor: taskDescriptor, retryAt: retryAt)
    }
    return ["scheduled": true, "nativeTaskId": task.taskIdentifier, "foreground": useForeground]
  }

  public func pause(jobId: String) async {
    setControl(jobId: jobId, state: .paused)
    patchSnapshot(jobId: jobId) {
      $0.state = .paused
      $0.updatedAt = nowMilliseconds()
    }
    let tasks = await allTasks()
    tasks.filter { descriptor(for: $0)?.jobId == jobId }.forEach { $0.suspend() }
    emitState(jobId: jobId)
    updateLiveActivity()
  }

  public func resume(jobId: String) async {
    let allowed = stateQueue.sync { () -> Bool in
      guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return false }
      var controls = defaults.dictionary(forKey: controlsStorageKey) as? [String: String] ?? [:]
      guard controls[jobId] != NativeUploadState.cancelled.rawValue else { return false }
      controls.removeValue(forKey: jobId)
      defaults.set(controls, forKey: controlsStorageKey)
      return true
    }
    guard allowed else { return }
    let online = isOnline
    patchSnapshot(jobId: jobId, allowPausedTransition: true) {
      guard $0.state != .cancelled && $0.state != .completed else { return }
      // A finalization response can arrive while a task is being suspended.
      // Keep the pause visible until explicit resume, then consume that response.
      $0.state = NativeUploadState(rawValue: NativeUploadControl.resumedState(
        finalized: $0.finalizeEndedAt != nil, nextRetryAt: $0.nextRetryAt,
        online: online, now: nowMilliseconds()
      )) ?? .queued
      $0.errorCode = nil
      $0.errorMessage = nil
      $0.updatedAt = nowMilliseconds()
    }
    await pumpTasks()
    emitState(jobId: jobId)
    updateLiveActivity()
  }

  public func cancel(jobId: String) async {
    setControl(jobId: jobId, state: .cancelled)
    patchSnapshot(jobId: jobId, allowPausedTransition: true) {
      $0.state = .cancelled
      $0.updatedAt = nowMilliseconds()
    }
    let tasks = await allTasks()
    tasks.filter { descriptor(for: $0)?.jobId == jobId }.forEach { $0.cancel() }
    emitState(jobId: jobId)
    updateLiveActivity()
  }

  public func reconcile() async -> [[String: Any?]] {
    let tasks = await allTasks()
    for task in tasks {
      guard let descriptor = descriptor(for: task),
        let retryAt = loadSnapshots()[descriptor.jobId]?.nextRetryAt,
        retryAt > nowMilliseconds()
      else { continue }
      scheduleRetryWake(task: task, descriptor: descriptor, retryAt: retryAt)
    }
    await pumpTasks()
    updateLiveActivity()
    // Ephemeral tasks disappear when the app process is killed. A durable
    // snapshot alone must not prevent JS from reconstructing the transfer.
    let activeAttempts = tasks.compactMap { task -> NativeTaskDescriptor? in
      guard task.state == .running || task.state == .suspended else { return nil }
      return descriptor(for: task)
    }
    return loadSnapshots().values.sorted { $0.updatedAt > $1.updatedAt }.map { snapshot in
      var value = snapshot.dictionary
      value["hasActiveTask"] = activeAttempts.contains {
        $0.jobId == snapshot.jobId && NativeUploadControl.isCurrent(
          snapshotAttempt: snapshot.attemptId, taskAttempt: $0.attemptId
        )
      }
      return value
    }
  }

  public func snapshotDictionaries() -> [[String: Any?]] {
    loadSnapshots()
      .values
      .sorted { $0.updatedAt > $1.updatedAt }
      .map(\.dictionary)
  }

  public func setLiveActivityLocale(_ locale: String) {
    guard locale == "pl" || locale == "en" else { return }
    stateQueue.sync {
      UserDefaults(suiteName: appGroupIdentifier)?.set(locale, forKey: liveActivityLocaleStorageKey)
    }
  }

  private func hasTask(jobId: String) async -> Bool {
    await allTasks().contains { descriptor(for: $0)?.jobId == jobId }
  }

  private func allTasks() async -> [URLSessionTask] {
    async let backgroundTasks: [URLSessionTask] = withCheckedContinuation { continuation in
      session.getAllTasks { continuation.resume(returning: $0) }
    }
    async let foregroundTasks: [URLSessionTask] = withCheckedContinuation { continuation in
      foregroundSession.getAllTasks { continuation.resume(returning: $0) }
    }
    return await backgroundTasks + foregroundTasks
  }

  private func prefersForeground(_ descriptor: NativeTaskDescriptor) -> Bool {
    if descriptor.kind == .finalize { return true }
    if descriptor.mediaType == "image" { return true }
    return descriptor.sizeBytes > 0 && descriptor.sizeBytes <= Self.foregroundSizeThresholdBytes
  }

  private func sessionFor(_ descriptor: NativeTaskDescriptor) -> URLSession {
    prefersForeground(descriptor) ? foregroundSession : session
  }

  private func retryDelays(for descriptor: NativeTaskDescriptor) -> [TimeInterval] {
    if prefersForeground(descriptor) {
      return [1, 3, 10, 30, 120, 600, 3600]
    }
    return [5, 15, 60, 300, 900, 3600, 21600]
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
    request.timeoutInterval = prefersForeground(descriptor) ? 120 : 60
    descriptor.requestHeaders.forEach { request.setValue($1, forHTTPHeaderField: $0) }
    let fileURL = URL(fileURLWithPath: descriptor.filePath)
    let session = sessionFor(descriptor)
    let task: URLSessionUploadTask
    // In-memory PUT for foreground uploads — avoids file-coordination stalls with
    // URLSessionUploadTask(fromFile:) under completeUntilFirstUserAuthentication.
    // Cap at threshold so we don't map huge videos into RAM.
    if prefersForeground(descriptor),
      descriptor.sizeBytes > 0,
      descriptor.sizeBytes <= Self.foregroundSizeThresholdBytes,
      let body = try? Data(contentsOf: fileURL, options: [.mappedIfSafe])
    {
      print("[NixBackgroundUploader] upload body loaded bytes=\(body.count) job=\(descriptor.jobId)")
      task = session.uploadTask(with: request, from: body)
    } else {
      task = session.uploadTask(with: request, fromFile: fileURL)
    }
    task.taskDescription = encodeDescriptor(descriptor)
    return task
  }

  private func resumeIfAllowed(_ task: URLSessionTask, descriptor: NativeTaskDescriptor) {
    let resumed = stateQueue.sync { () -> Bool in
      let controls = UserDefaults(suiteName: appGroupIdentifier)?
        .dictionary(forKey: controlsStorageKey) as? [String: String] ?? [:]
      guard controls[descriptor.jobId] == nil else { return false }
      var snapshots = loadSnapshotsUnlocked()
      var snapshot = snapshots[descriptor.jobId]
      guard NativeUploadControl.canResume(
        state: snapshot?.state.rawValue,
        snapshotAttempt: snapshot?.attemptId,
        taskAttempt: descriptor.attemptId,
        nextRetryAt: snapshot?.nextRetryAt,
        now: nowMilliseconds()
      ) else { return false }
      snapshot?.state = descriptor.kind == .finalize ? .finalizing : .uploading
      snapshot?.nextRetryAt = nil
      snapshot?.updatedAt = nowMilliseconds()
      snapshots[descriptor.jobId] = snapshot
      if let encoded = try? JSONEncoder().encode(snapshots) {
        UserDefaults(suiteName: appGroupIdentifier)?.set(encoded, forKey: snapshotsStorageKey)
      }
      task.resume()
      return true
    }
    if resumed { emitState(jobId: descriptor.jobId) }
  }

  private func scheduleRetryWake(
    task: URLSessionTask, descriptor: NativeTaskDescriptor, retryAt: Double
  ) {
    let delay = max(0, (retryAt - nowMilliseconds()) / 1000)
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + delay) { [weak self] in
      guard let self else { return }
      self.resumeIfAllowed(task, descriptor: descriptor)
      Task { await self.pumpTasks() }
    }
  }

  private func schedulePutWatchdog(task: URLSessionTask, descriptor: NativeTaskDescriptor) {
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 3) { [weak self] in
      guard let self else { return }
      // Capture the actual task and attempt, never search across sessions by ID.
      if task.state == .suspended { self.resumeIfAllowed(task, descriptor: descriptor) }
    }
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
    let bodyFile = bodyDirectory.appendingPathComponent("\(descriptor.jobId)-\(descriptor.attemptId).json")
    try bodyData.write(to: bodyFile, options: .atomic)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.timeoutInterval = 60
    descriptor.finalizeHeaders.forEach { request.setValue($1, forHTTPHeaderField: $0) }
    // Finalize is always foreground — small JSON must not wait in background scheduling.
    let task = foregroundSession.uploadTask(with: request, fromFile: bodyFile)
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
    next.attemptId = UUID().uuidString
    let delays = retryDelays(for: next)
    let base = delays[min(max(0, next.attempt - 1), delays.count - 1)]
    let jitter = Double.random(in: 0.8 ... 1.2)
    let delay = base * jitter
    let retryAt = nowMilliseconds() + delay * 1000
    do {
      let task = next.kind == .upload
        ? try makeUploadTask(descriptor: next)
        : try makeFinalizeTask(descriptor: next)
      patchSnapshot(jobId: descriptor.jobId, attemptId: descriptor.attemptId) {
        $0.state = .retryScheduled
        $0.attemptId = next.attemptId
        $0.nextRetryAt = retryAt
        $0.attempt = next.attempt
        $0.statusCode = statusCode
        $0.errorCode = "RETRY_SCHEDULED"
        $0.errorMessage = message
        $0.updatedAt = nowMilliseconds()
      }
      guard let scheduled = loadSnapshots()[descriptor.jobId],
        scheduled.attemptId == next.attemptId,
        scheduled.state != .cancelled, scheduled.state != .completed
      else { task.cancel(); return }
      if prefersForeground(next) {
        // default/ephemeral URLSession ignores earliestBeginDate — delay then resume.
        task.suspend()
        scheduleRetryWake(task: task, descriptor: next, retryAt: retryAt)
      } else {
        // Background session honors earliestBeginDate after resume.
        task.earliestBeginDate = Date(timeIntervalSince1970: retryAt / 1000)
        // Keep suspended until the durable deadline; a background URLSession
        // earliestBeginDate alone is advisory and cannot enforce a user's pause.
        scheduleRetryWake(task: task, descriptor: next, retryAt: retryAt)
      }
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
    patchSnapshot(jobId: descriptor.jobId, attemptId: descriptor.attemptId) {
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
    let acquired = stateQueue.sync { () -> Bool in
      guard !pumping else { return false }
      pumping = true
      return true
    }
    guard acquired else { return }
    defer { stateQueue.sync { pumping = false } }
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
        return NativeUploadControl.canResume(
          state: snapshot?.state.rawValue, snapshotAttempt: snapshot?.attemptId,
          taskAttempt: descriptor.attemptId, nextRetryAt: snapshot?.nextRetryAt,
          now: nowMilliseconds()
        )
      }
      .sorted { ($0.earliestBeginDate ?? .distantPast) < ($1.earliestBeginDate ?? .distantPast) }

    print("[NixBackgroundUploader] pump running=\(running) available=\(available) suspendedCandidates=\(candidates.count)")

    for task in candidates {
      guard let descriptor = descriptor(for: task) else { continue }
      if let earliest = task.earliestBeginDate, earliest > Date() { continue }
      // Foreground image/finalize always resume — don't starve behind background slots.
      let foreground = prefersForeground(descriptor)
      if descriptor.kind == .upload {
        if !foreground {
          guard available > 0 else { continue }
          available -= 1
        }
        patchSnapshot(jobId: descriptor.jobId, attemptId: descriptor.attemptId) {
          $0.state = .uploading
          $0.attempt = descriptor.attempt
          if $0.putStartedAt == nil {
            $0.putStartedAt = nowMilliseconds()
          }
          $0.updatedAt = nowMilliseconds()
        }
      } else {
        patchSnapshot(jobId: descriptor.jobId, attemptId: descriptor.attemptId) {
          $0.state = .finalizing
          if $0.finalizeStartedAt == nil {
            $0.finalizeStartedAt = nowMilliseconds()
          }
          $0.updatedAt = nowMilliseconds()
        }
      }
      resumeIfAllowed(task, descriptor: descriptor)
      print("[NixBackgroundUploader] pump resumed job=\(descriptor.jobId) kind=\(descriptor.kind.rawValue) foreground=\(foreground)")
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
    guard NativeUploadControl.isCurrent(
      snapshotAttempt: loadSnapshots()[descriptor.jobId]?.attemptId,
      taskAttempt: descriptor.attemptId
    ) else { return }
    let total = max(totalBytesExpectedToSend, 1)
    let progress = min(1, max(0, Double(totalBytesSent) / Double(total)))
    patchSnapshot(jobId: descriptor.jobId, attemptId: descriptor.attemptId) {
      $0.state = .uploading
      $0.progress = progress
      $0.bytesSent = totalBytesSent
      $0.bytesTotal = totalBytesExpectedToSend
      $0.attempt = descriptor.attempt
      $0.updatedAt = nowMilliseconds()
    }
    guard let latest = loadSnapshots()[descriptor.jobId], latest.state == .uploading,
      NativeUploadControl.isCurrent(snapshotAttempt: latest.attemptId, taskAttempt: descriptor.attemptId)
    else { return }
    eventSink?("onUploadProgress", [
      "jobId": descriptor.jobId,
      "batchId": descriptor.batchId,
      "attemptId": descriptor.attemptId,
      "updatedAt": latest.updatedAt,
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
      responseBodies[NativeUploadTaskKey(session: session, task: dataTask), default: Data()].append(data)
    }
  }

  public func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard let descriptor = descriptor(for: task) else { return }
    let statusCode = (task.response as? HTTPURLResponse)?.statusCode
    let responseData = stateQueue.sync {
      responseBodies.removeValue(forKey: NativeUploadTaskKey(session: session, task: task))
    }
    let responseBody = responseData.flatMap { String(data: $0, encoding: .utf8) }
    let currentState = loadSnapshots()[descriptor.jobId]?.state
    guard NativeUploadControl.isCurrent(
      snapshotAttempt: loadSnapshots()[descriptor.jobId]?.attemptId,
      taskAttempt: descriptor.attemptId
    ) else { return }
    let controlledState = stateQueue.sync {
      (UserDefaults(suiteName: appGroupIdentifier)?.dictionary(forKey: controlsStorageKey)
        as? [String: String])?[descriptor.jobId]
    }
    if currentState == .cancelled || controlledState == NativeUploadState.cancelled.rawValue { return }

    if let error = error as NSError? {
      if error.code == NSURLErrorCancelled {
        // pause() suspends; cancel() already patched state; re-enqueue cancels prior.
        return
      }
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
          patchSnapshot(jobId: descriptor.jobId, attemptId: descriptor.attemptId) {
            $0.state = .finalizing
            $0.progress = 1
            $0.bytesSent = $0.bytesTotal
            $0.statusCode = statusCode
            $0.putEndedAt = nowMilliseconds()
            if $0.finalizeStartedAt == nil {
              $0.finalizeStartedAt = nowMilliseconds()
            }
            $0.updatedAt = nowMilliseconds()
          }
          // The same attempt guard applies when PUT completion races with pause.
          if let finalizerDescriptor = self.descriptor(for: finalizer) {
            resumeIfAllowed(finalizer, descriptor: finalizerDescriptor)
          }
          print("[NixBackgroundUploader] finalize resumed job=\(descriptor.jobId) task=\(finalizer.taskIdentifier)")
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
        patchSnapshot(jobId: descriptor.jobId, attemptId: descriptor.attemptId) {
          $0.state = .completed
          $0.progress = 1
          $0.statusCode = statusCode
          $0.responseBody = responseBody
          $0.errorCode = nil
          $0.errorMessage = nil
          $0.finalizeEndedAt = nowMilliseconds()
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
          patchSnapshot(jobId: descriptor.jobId, attemptId: descriptor.attemptId) {
            $0.state = .finalizing
            $0.progress = 1
            $0.statusCode = statusCode
            $0.errorCode = "RECONCILING_OBJECT"
            $0.errorMessage = responseBody
            $0.updatedAt = nowMilliseconds()
          }
          if let finalizerDescriptor = self.descriptor(for: finalizer) {
            resumeIfAllowed(finalizer, descriptor: finalizerDescriptor)
          }
          print("[NixBackgroundUploader] reconcile finalize resumed job=\(descriptor.jobId)")
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
    // An empty native store does not mean the global queue is empty: jobs
    // started by the JS/TUS fallback are persisted in SQLite. Let JS own the
    // Live Activity in that case instead of overwriting it with a false 0%.
    guard !snapshots.isEmpty else { return }
    let active = snapshots.filter {
      ![NativeUploadState.completed, .cancelled].contains($0.state)
    }
    let completed = snapshots.filter { $0.state == .completed }
    guard !active.isEmpty || !completed.isEmpty else { return }
    let failed = active.filter {
      $0.state == .failed || $0.state == .waitingForAuth || $0.state == .retryScheduled
    }
    let waiting = active.filter { $0.state == .waitingNetwork }
    let paused = active.filter { $0.state == .paused }
    let progress = active.isEmpty
      ? (completed.isEmpty ? 0 : 1)
      : active.map(\.progress).reduce(0, +) / Double(active.count)
    let phase: String
    if !failed.isEmpty {
      phase = "failed"
    } else if !waiting.isEmpty {
      phase = "waiting_network"
    } else if !paused.isEmpty {
      phase = "paused"
    } else if active.contains(where: { $0.state == .finalizing }) {
      phase = "finalizing"
    } else if active.isEmpty && !completed.isEmpty {
      phase = "completed"
    } else {
      phase = "uploading"
    }
    let locale = stateQueue.sync {
      UserDefaults(suiteName: appGroupIdentifier)?.string(forKey: liveActivityLocaleStorageKey)
    } ?? snapshots.max(by: { $0.updatedAt < $1.updatedAt })?.locale ?? "en"
    let props: [String: Any] = [
      "phase": phase,
      "progress": progress,
      "remainingCount": active.count,
      "locale": locale,
      "updatedAt": nowMilliseconds()
    ]
    let shouldPublish = stateQueue.sync { () -> Bool in
      let currentTime = Date().timeIntervalSince1970
      let phaseChanged = phase != lastLiveActivityPhase
      let localeChanged = locale != lastLiveActivityLocale
      let countChanged = active.count != lastLiveActivityCount
      let progressChanged = abs(progress - lastLiveActivityProgress) >= 0.01
      let intervalElapsed = currentTime - lastLiveActivityUpdateAt >= 1
      guard phaseChanged || localeChanged || countChanged || (progressChanged && intervalElapsed) else { return false }
      lastLiveActivityPhase = phase
      lastLiveActivityLocale = locale
      lastLiveActivityCount = active.count
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
    stateQueue.sync { loadSnapshotsUnlocked() }
  }

  // Only call while stateQueue is held.
  private func loadSnapshotsUnlocked() -> [String: NativeUploadSnapshot] {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier),
      let data = defaults.data(forKey: snapshotsStorageKey),
      let decoded = try? JSONDecoder().decode([String: NativeUploadSnapshot].self, from: data) else {
      return [:]
    }
    return decoded.mapValues { stored in
      var snapshot = stored
      if snapshot.attemptId == nil {
        snapshot.attemptId = "legacy:\(snapshot.jobId):\(snapshot.attempt)"
      }
      return snapshot
    }
  }

  private func saveSnapshot(_ snapshot: NativeUploadSnapshot) {
    stateQueue.sync {
      guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return }
      var snapshots = loadSnapshotsUnlocked()
      var replacement = snapshot
      let control = (defaults.dictionary(forKey: controlsStorageKey) as? [String: String])?[snapshot.jobId]
      if let control, let state = NativeUploadState(rawValue: control) {
        replacement.state = state
      } else if let previous = snapshots[snapshot.jobId], previous.batchId == snapshot.batchId {
        replacement.state = NativeUploadState(rawValue: NativeUploadControl.preservedState(
          previous: previous.state.rawValue, proposed: replacement.state.rawValue,
          allowPausedTransition: false
        )) ?? previous.state
      }
      snapshots[snapshot.jobId] = replacement
      if let encoded = try? JSONEncoder().encode(snapshots) {
        defaults.set(encoded, forKey: snapshotsStorageKey)
      }
    }
    emitState(jobId: snapshot.jobId)
  }

  // Persist control even before enqueue has created a snapshot. This closes the
  // gap between a JS pause/cancel and a late asynchronous native enqueue call.
  private func setControl(jobId: String, state: NativeUploadState) {
    stateQueue.sync {
      guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return }
      var controls = defaults.dictionary(forKey: controlsStorageKey) as? [String: String] ?? [:]
      guard controls[jobId] != NativeUploadState.cancelled.rawValue else { return }
      if let existing = loadSnapshotsUnlocked()[jobId], existing.state == .completed { return }
      controls[jobId] = state.rawValue
      defaults.set(controls, forKey: controlsStorageKey)
    }
  }

  private func canEnqueue(jobId: String, batchId: String) -> Bool {
    stateQueue.sync {
      guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return false }
      var controls = defaults.dictionary(forKey: controlsStorageKey) as? [String: String] ?? [:]
      let previous = loadSnapshotsUnlocked()[jobId]
      guard NativeUploadControl.canEnqueue(
        control: controls[jobId], snapshotState: previous?.state.rawValue,
        previousBatch: previous?.batchId, batch: batchId
      ) else { return false }
      if controls[jobId] == NativeUploadState.cancelled.rawValue {
        // An explicit aggressive retry obtains a new server batch. A late
        // callback from the cancelled batch cannot clear its control marker.
        controls.removeValue(forKey: jobId)
        defaults.set(controls, forKey: controlsStorageKey)
      }
      return true
    }
  }

  private func patchSnapshot(
    jobId: String, attemptId: String? = nil, allowPausedTransition: Bool = false,
    mutate: (inout NativeUploadSnapshot) -> Void
  ) {
    var updated: NativeUploadSnapshot?
    stateQueue.sync {
      guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return }
      var snapshots = loadSnapshotsUnlocked()
      guard var snapshot = snapshots[jobId] else { return }
      if let attemptId,
        !NativeUploadControl.isCurrent(snapshotAttempt: snapshot.attemptId, taskAttempt: attemptId)
      { return }
      let previousState = snapshot.state
      mutate(&snapshot)
      snapshot.state = NativeUploadState(rawValue: NativeUploadControl.preservedState(
        previous: previousState.rawValue, proposed: snapshot.state.rawValue,
        allowPausedTransition: allowPausedTransition
      )) ?? previousState
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
