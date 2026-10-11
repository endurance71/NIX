import AppIntents

/// Opens the NiX camera from the Lock Screen / Control Center. When the device is locked the
/// system starts `NixCaptureExtension`; when unlocked it launches the app (camera tab).
/// Compiled into the app, the widget extension (the control) and the capture extension.
@available(iOS 18.0, *)
struct NixCaptureIntent: CameraCaptureIntent {
  struct AppContext: Codable, Sendable {}

  static let title: LocalizedStringResource = "NiX"
  static let description = IntentDescription("Opens the NiX camera.")

  @MainActor
  func perform() async throws -> some IntentResult {
    .result()
  }
}
