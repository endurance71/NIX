import AVFoundation
import ExpoModulesCore

public class NixCameraTorchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NixCameraTorch")

    AsyncFunction("setTorchEnabledAsync") { (enabled: Bool) -> [String: Bool] in
      return Self.setTorchEnabled(enabled)
    }

    AsyncFunction("getTorchStatusAsync") { () -> [String: Bool] in
      return Self.getTorchStatus()
    }

    /// Apple-like rear lens chips: 0.5 / 1× / 2 (wide crop) / tele (3 or 5…).
    AsyncFunction("getBackLensPresetsAsync") { () -> [[String: Any]] in
      return Self.backLensPresets()
    }
  }

  private static func backWideCamera() -> AVCaptureDevice? {
    return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
  }

  private static func getTorchStatus() -> [String: Bool] {
    guard let device = backWideCamera(), device.hasTorch, device.isTorchModeSupported(.on) else {
      return ["available": false, "enabled": false]
    }

    return ["available": true, "enabled": device.torchMode == .on]
  }

  private static func setTorchEnabled(_ enabled: Bool) -> [String: Bool] {
    guard let device = backWideCamera(), device.hasTorch, device.isTorchModeSupported(.on) else {
      return ["available": false, "enabled": false]
    }

    do {
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      if enabled {
        try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
      } else {
        device.torchMode = .off
      }

      return ["available": true, "enabled": device.torchMode == .on]
    } catch {
      return ["available": true, "enabled": device.torchMode == .on]
    }
  }

  /// Matches expo-camera `updateZoom`: factor = 1 * pow(maxZoom, zoomNormalized).
  private static func expoNormalizedZoom(targetFactor: CGFloat, on device: AVCaptureDevice) -> Double {
    let minZoom: CGFloat = 1.0
    let maxZoom = device.activeFormat.videoMaxZoomFactor
    guard maxZoom > minZoom else { return 0 }
    let clamped = min(max(targetFactor, minZoom), maxZoom)
    let zoom = log(clamped / minZoom) / log(maxZoom / minZoom)
    return Double(max(0, min(1, zoom)))
  }

  private static func displayZoomMultiplier(for device: AVCaptureDevice) -> CGFloat {
    if #available(iOS 18.0, *) {
      return device.displayVideoZoomFactorMultiplier
    }
    let hasUltra =
      AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) != nil
    return hasUltra ? 0.5 : 1.0
  }

  private static func teleDisplayFactor(tele: AVCaptureDevice) -> CGFloat {
    if let triple = AVCaptureDevice.default(.builtInTripleCamera, for: .video, position: .back) {
      let overs = triple.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat(truncating: $0) }
      let multiplier = displayZoomMultiplier(for: triple)
      if let last = overs.last {
        return last * multiplier
      }
    }

    if let dual = AVCaptureDevice.default(.builtInDualCamera, for: .video, position: .back) {
      let overs = dual.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat(truncating: $0) }
      let multiplier = displayZoomMultiplier(for: dual)
      if let last = overs.last {
        return last * multiplier
      }
    }

    if let wide = backWideCamera() {
      let wideFov = wide.activeFormat.videoFieldOfView
      let teleFov = tele.activeFormat.videoFieldOfView
      if teleFov > 0.1 {
        return CGFloat(wideFov / teleFov)
      }
    }

    return 2.0
  }

  private static func formatDisplayLabel(_ factor: CGFloat) -> String {
    if abs(factor - 1) < 0.05 {
      return "1×"
    }
    if factor < 1 {
      let formatted = String(format: "%.1f", Double(factor))
      return formatted.replacingOccurrences(of: ".", with: Locale.current.decimalSeparator ?? ".")
    }
    let rounded = factor.rounded()
    if abs(factor - rounded) < 0.08 {
      return String(Int(rounded))
    }
    let formatted = String(format: "%.1f", Double(factor))
    return formatted.replacingOccurrences(of: ".", with: Locale.current.decimalSeparator ?? ".")
  }

  private static func backLensPresets() -> [[String: Any]] {
    let ultra = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back)
    let wide = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
    let tele = AVCaptureDevice.default(.builtInTelephotoCamera, for: .video, position: .back)

    var presets: [[String: Any]] = []

    if let ultra {
      presets.append([
        "id": "0.5",
        "kind": "ultraWide",
        "label": formatDisplayLabel(0.5),
        "localizedName": ultra.localizedName,
        "zoom": 0.0,
        "displayFactor": 0.5,
      ])
    }

    if let wide {
      presets.append([
        "id": "1x",
        "kind": "wide",
        "label": formatDisplayLabel(1.0),
        "localizedName": wide.localizedName,
        "zoom": 0.0,
        "displayFactor": 1.0,
      ])

      // Virtual 2× crop on the main wide sensor (Apple Camera style).
      if ultra != nil || tele != nil {
        presets.append([
          "id": "2x",
          "kind": "wideCrop2x",
          "label": formatDisplayLabel(2.0),
          "localizedName": wide.localizedName,
          "zoom": expoNormalizedZoom(targetFactor: 2.0, on: wide),
          "displayFactor": 2.0,
        ])
      }
    }

    if let tele {
      let factor = teleDisplayFactor(tele: tele)
      presets.append([
        "id": "tele",
        "kind": "telephoto",
        "label": formatDisplayLabel(factor),
        "localizedName": tele.localizedName,
        "zoom": 0.0,
        "displayFactor": Double(factor),
      ])
    }

    return presets
  }
}
