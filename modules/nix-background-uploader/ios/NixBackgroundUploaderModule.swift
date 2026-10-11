import ExpoModulesCore
import ExpoWidgets
import Foundation

private let uploadLiveActivityName = "UploadStatusActivity"

private struct EnqueueOptions: Record {
  @Field var jobId: String = ""
  @Field var batchId: String = ""
  @Field var fileUri: String = ""
  @Field var uploadUrl: String = ""
  @Field var uploadHeaders: [String: String] = [:]
  @Field var finalizeUrl: String = ""
  @Field var finalizeHeaders: [String: String] = [:]
  @Field var finalizeToken: String = ""
  @Field var expiresAt: Double = 0
  @Field var mediaType: String = "video"
  @Field var sizeBytes: Double = 0
  @Field var locale: String = "en"
  @Field var nextRetryAt: Double = 0
}

public final class NixBackgroundUploaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NixBackgroundUploader")

    Events("onUploadProgress", "onUploadState")

    OnCreate {
      BackgroundUploadCoordinator.shared.eventSink = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
      #if DEBUG
      if #available(iOS 16.2, *) {
        print(
          "[NixBackgroundUploader] Live Activity status:",
          ExpoWidgetsLiveActivityBridge.status(name: uploadLiveActivityName)
        )
      }
      #endif
    }

    OnDestroy {
      BackgroundUploadCoordinator.shared.eventSink = nil
    }

    AsyncFunction("downloadPhotoToMemory") {
      (requestId: String, url: String, bearerToken: String, maxBytes: Int) in
      try await PhotoMemoryDownloader.shared.download(
        requestId: requestId, url: url, bearerToken: bearerToken, maxBytes: maxBytes
      )
    }

    AsyncFunction("cancelPhotoDownload") { (requestId: String) in
      PhotoMemoryDownloader.shared.cancel(requestId: requestId)
    }

    AsyncFunction("savePhotoToLibrary") { (base64: String, contentType: String) in
      try await PhotoMemoryDownloader.shared.saveToPhotoLibrary(
        base64: base64, contentType: contentType
      )
    }

    AsyncFunction("stageFile") { (jobId: String, sourceUri: URL, fileName: String) in
      let started = Date()
      print("[NixBackgroundUploader] stageFile start job=\(jobId) file=\(fileName)")
      let result = try BackgroundUploadCoordinator.shared.stageFile(
        jobId: jobId,
        sourceUri: sourceUri,
        fileName: fileName
      )
      let ms = Int(Date().timeIntervalSince(started) * 1000)
      print("[NixBackgroundUploader] stageFile done job=\(jobId) ms=\(ms)")
      return result
    }

    AsyncFunction("deleteStagedJob") { (jobId: String) in
      try BackgroundUploadCoordinator.shared.deleteStagedJob(jobId: jobId)
    }

    AsyncFunction("findStagedFile") { (jobId: String, role: String) in
      try BackgroundUploadCoordinator.shared.findStagedFile(jobId: jobId, role: role)
    }

    AsyncFunction("enqueue") { (options: EnqueueOptions) in
      guard
        options.sizeBytes.isFinite, options.sizeBytes >= 0, options.sizeBytes < Double(Int64.max),
        options.nextRetryAt.isFinite,
        let fileUri = URL(string: options.fileUri),
        let uploadUrl = URL(string: options.uploadUrl),
        let finalizeUrl = URL(string: options.finalizeUrl)
      else {
        throw NSError(
          domain: "NixBackgroundUploader",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Invalid upload or finalization URL."]
        )
      }
      return try await BackgroundUploadCoordinator.shared.enqueue(
        jobId: options.jobId,
        batchId: options.batchId,
        fileUri: fileUri,
        uploadUrl: uploadUrl,
        uploadHeaders: options.uploadHeaders,
        finalizeUrl: finalizeUrl,
        finalizeHeaders: options.finalizeHeaders,
        finalizeToken: options.finalizeToken,
        expiresAt: options.expiresAt,
        mediaType: options.mediaType,
        sizeBytes: Int64(options.sizeBytes),
        locale: options.locale,
        nextRetryAt: options.nextRetryAt
      )
    }

    AsyncFunction("pause") { (jobId: String) in
      await BackgroundUploadCoordinator.shared.pause(jobId: jobId)
    }

    AsyncFunction("resume") { (jobId: String) in
      await BackgroundUploadCoordinator.shared.resume(jobId: jobId)
    }

    AsyncFunction("cancel") { (jobId: String) in
      await BackgroundUploadCoordinator.shared.cancel(jobId: jobId)
    }

    AsyncFunction("listTasks") {
      BackgroundUploadCoordinator.shared.snapshotDictionaries()
    }

    AsyncFunction("reconcile") {
      await BackgroundUploadCoordinator.shared.reconcile()
    }

    // JS → native queue view for the background Live Activity writer (SEND-2). Synchronous
    // body: runs in call order on the module queue, so it lands before a following sync.
    AsyncFunction("reportLiveActivityState") { (state: String) in
      BackgroundUploadCoordinator.shared.reportLiveActivityState(state)
    }

    AsyncFunction("syncLiveActivity") { (props: String) in
      guard #available(iOS 16.2, *) else {
        return ["enabled": false, "activeCount": 0] as [String: Any]
      }
      await BackgroundUploadCoordinator.shared.syncLiveActivity(props: props)
      return ExpoWidgetsLiveActivityBridge.status(name: uploadLiveActivityName)
    }
  }
}
