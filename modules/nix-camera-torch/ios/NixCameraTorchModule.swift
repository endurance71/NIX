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
}
