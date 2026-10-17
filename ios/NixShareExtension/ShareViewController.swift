import UIKit
import UniformTypeIdentifiers
import UserNotifications

/// "NiX" in the share sheet (Photos and other apps): copies one photo or video into the App
/// Group container and opens NiX on its preview. No UI of its own.
final class ShareViewController: UIViewController {
  private static let appGroup = "group.com.damianmotylinski.nixapp.uploads"
  private static let intakeFolder = "SharedIntake"
  private var handled = false

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !handled else { return }
    handled = true
    Task { await handleShare() }
  }

  /// Step log for diagnosing shares (`SharedIntake/share-debug.log`, read by the dev app). Debug
  /// builds only: a release build never writes it.
  private func trace(_ message: String) {
    #if DEBUG
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup) else { return }
    let folder = container.appendingPathComponent(Self.intakeFolder, isDirectory: true)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let file = folder.appendingPathComponent("share-debug.log")
    let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
    if let handle = try? FileHandle(forWritingTo: file) {
      handle.seekToEndOfFile()
      handle.write(Data(line.utf8))
      try? handle.close()
    } else {
      try? Data(line.utf8).write(to: file)
    }
    #endif
  }

  private func handleShare() async {
    let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
    let providers = items.flatMap { $0.attachments ?? [] }
    trace("start items=\(items.count) providers=\(providers.count) types=\(providers.map { $0.registeredTypeIdentifiers })")
    let video = providers.first { $0.hasItemConformingToTypeIdentifier(UTType.movie.identifier) }
    let image = providers.first { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
    guard let provider = video ?? image else {
      trace("no supported attachment")
      return finish()
    }
    let isVideo = video != nil
    do {
      let file = try await copyIntoAppGroup(provider: provider, type: isVideo ? .movie : .image)
      trace("copied \(file.lastPathComponent)")
      var components = URLComponents()
      components.scheme = "nix"
      components.host = "share-intake"
      components.queryItems = [
        URLQueryItem(name: "file", value: file.lastPathComponent),
        URLQueryItem(name: "kind", value: isVideo ? "video" : "photo"),
      ]
      if let url = components.url {
        let opened = await openContainingApp(url)
        trace("open result=\(opened)")
        // iOS may refuse to open apps from a share extension: the app also picks the file up
        // the next time it becomes active, and a notification leads there.
        if !opened { await postOpenNotification(isVideo: isVideo) }
      }
    } catch {
      trace("copy failed: \(error.localizedDescription)")
    }
    // Completing the request right away can cancel the app launch that was just requested.
    try? await Task.sleep(nanoseconds: 600_000_000)
    finish()
  }

  private func copyIntoAppGroup(provider: NSItemProvider, type: UTType) async throws -> URL {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup) else {
      throw CocoaError(.fileNoSuchFile)
    }
    let folder = container.appendingPathComponent(Self.intakeFolder, isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    // Shares that were never opened within an hour are not worth keeping.
    let cutoff = Date().addingTimeInterval(-3600)
    let existing = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.creationDateKey])) ?? []
    for url in existing {
      let created = (try? url.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
      if created < cutoff { try? FileManager.default.removeItem(at: url) }
    }
    return try await withCheckedThrowingContinuation { continuation in
      // The provided file is deleted when the handler returns, so copy it inside.
      provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, error in
        guard let url else {
          continuation.resume(throwing: error ?? CocoaError(.fileReadUnknown))
          return
        }
        let ext = url.pathExtension.isEmpty ? (type == .movie ? "mov" : "jpg") : url.pathExtension
        let destination = folder.appendingPathComponent("\(UUID().uuidString).\(ext.lowercased())")
        do {
          try FileManager.default.copyItem(at: url, to: destination)
          // `copyItem` keeps the photo's own dates (a 2009 photo stays 2009), and NiX picks up a
          // shared file only within minutes of it being shared: stamp the copy with now.
          let now = Date()
          try? FileManager.default.setAttributes(
            [.creationDate: now, .modificationDate: now], ofItemAtPath: destination.path)
          continuation.resume(returning: destination)
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  /// Asks the system to open NiX through the extension context only (the public API for
  /// extensions). When the host refuses, the caller falls back to a local notification and the app
  /// picks the shared file up on its next activation.
  private func openContainingApp(_ url: URL) async -> Bool {
    guard let context = extensionContext else { return false }
    let opened = await withCheckedContinuation { continuation in
      context.open(url) { success in continuation.resume(returning: success) }
    }
    trace("extensionContext.open=\(opened)")
    return opened
  }

  private func postOpenNotification(isVideo: Bool) async {
    let polish = Locale.preferredLanguages.first?.hasPrefix("pl") ?? false
    let content = UNMutableNotificationContent()
    content.title = "NiX"
    content.body = polish
      ? (isVideo ? "Stuknij, aby wysłać wideo w NiX." : "Stuknij, aby wysłać zdjęcie w NiX.")
      : (isVideo ? "Tap to send the video in NiX." : "Tap to send the photo in NiX.")
    content.userInfo = ["nixShareIntake": true]
    let request = UNNotificationRequest(identifier: "nix-share-intake", content: content, trigger: nil)
    try? await UNUserNotificationCenter.current().add(request)
  }

  private func finish() {
    extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
  }
}
