import WidgetKit
import SwiftUI
import AppIntents

/// Control Center / Lock Screen button for the NiX camera (iOS 18+). Runs `NixCaptureIntent`:
/// on a locked device it opens the Lock Screen camera extension, otherwise the app.
@available(iOS 18.0, *)
struct NixCameraControl: ControlWidget {
  private static var isPolish: Bool {
    Locale.preferredLanguages.first?.hasPrefix("pl") ?? false
  }

  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.damianmotylinski.nixapp.camera-control") {
      ControlWidgetButton(action: NixCaptureIntent()) {
        Label(Self.isPolish ? "Zrób NiX" : "Take a NiX", systemImage: "camera.fill")
      }
    }
    .displayName(LocalizedStringResource(String.LocalizationValue(Self.isPolish ? "Zrób NiX" : "Take a NiX")))
    .description(LocalizedStringResource(String.LocalizationValue(Self.isPolish ? "Otwiera aparat NiX, także na zablokowanym ekranie." : "Opens the NiX camera, even on the Lock Screen.")))
  }
}
