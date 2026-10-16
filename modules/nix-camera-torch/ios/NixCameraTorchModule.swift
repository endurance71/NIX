import AVFoundation
import AVKit
import ExpoModulesCore
import UIKit
#if canImport(LockedCameraCapture)
import LockedCameraCapture
#endif

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

    /// Front "flash": the app lights the subject with a white screen at full brightness and puts
    /// the user's brightness back afterwards.
    /// Photos taken on the Lock Screen camera (NixCaptureExtension), moved into this app's tmp
    /// directory and removed from the capture sessions. Empty before iOS 18.
    AsyncFunction("consumeLockedCapturesAsync") { () -> [String] in
      return Self.consumeLockedCaptures()
    }

    AsyncFunction("boostScreenBrightnessAsync") { () -> Bool in
      return Self.boostScreenBrightness()
    }.runOnQueue(.main)

    AsyncFunction("restoreScreenBrightnessAsync") { () -> Bool in
      return Self.restoreScreenBrightness()
    }.runOnQueue(.main)

    /// Tap-to-focus / long-press AE/AF lock on the device expo-camera is running. The point arrives
    /// in window coordinates and is converted by the live preview layer (aspect fill, rotation and
    /// mirroring included); `fallbackX/Y` is the JS-computed device point used only when no preview
    /// layer is on screen.
    AsyncFunction("setFocusPointAsync") { (options: NixFocusPointOptions) -> [String: Any] in
      return NixCameraFocus.setFocusPoint(options)
    }.runOnQueue(.main)

    /// Back to continuous AF/AE at the centre on every device this module touched, so a lock
    /// never outlives the camera screen, a lens change or a camera flip.
    AsyncFunction("resetFocusAsync") { () -> Bool in
      return NixCameraFocus.resetFocus()
    }.runOnQueue(.main)

    /// Camera Control (iPhone 16+) and the volume buttons as a shutter (iOS 17.2+). While enabled
    /// the buttons do not change the volume, so JS enables it only while the camera tab is focused.
    Events("onCaptureEvent")

    AsyncFunction("setCaptureEventsEnabledAsync") { (enabled: Bool) -> Bool in
      return self.setCaptureEventsEnabled(enabled)
    }.runOnQueue(.main)

    // Never leave the screen at full brightness behind the user's back.
    OnAppEntersBackground {
      DispatchQueue.main.async { _ = Self.restoreScreenBrightness() }
    }

    OnDestroy {
      DispatchQueue.main.async { [weak self] in
        _ = Self.restoreScreenBrightness()
        _ = self?.setCaptureEventsEnabled(false)
        _ = NixCameraFocus.resetFocus()
      }
    }
  }

  /// AVCaptureEventInteraction (iOS 17.2+), typed as Any so the module still loads on iOS 16.4.
  private var captureEventInteraction: AnyObject?

  private func setCaptureEventsEnabled(_ enabled: Bool) -> Bool {
    guard #available(iOS 17.2, *) else { return false }

    if !enabled {
      if let interaction = captureEventInteraction as? AVCaptureEventInteraction {
        interaction.isEnabled = false
      }
      return false
    }

    guard let window = NixCameraFocus.keyWindow() else { return false }
    let host: UIView = window.rootViewController?.view ?? window

    let interaction: AVCaptureEventInteraction
    if let existing = captureEventInteraction as? AVCaptureEventInteraction {
      interaction = existing
    } else {
      interaction = AVCaptureEventInteraction { [weak self] event in
        self?.emitCaptureEvent(phase: event.phase)
      }
      captureEventInteraction = interaction
    }

    // The root view can be replaced (scene reconnect, reload); keep the interaction attached.
    if interaction.view !== host {
      interaction.view?.removeInteraction(interaction)
      host.addInteraction(interaction)
    }
    interaction.isEnabled = true
    return true
  }

  @available(iOS 17.2, *)
  private func emitCaptureEvent(phase: AVCaptureEventPhase) {
    let name: String
    switch phase {
    case .began: name = "began"
    case .ended: name = "ended"
    case .cancelled: name = "cancelled"
    @unknown default: return
    }
    sendEvent("onCaptureEvent", ["phase": name])
  }

  /// Brightness the user had before the first boost; nil while nothing is boosted. Main thread only.
  nonisolated(unsafe) private static var brightnessBeforeBoost: CGFloat?

  private static func activeScreen() -> UIScreen? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return (scenes.first { $0.activationState == .foregroundActive } ?? scenes.first)?.screen
  }

  private static func boostScreenBrightness() -> Bool {
    guard let screen = activeScreen() else { return false }
    if brightnessBeforeBoost == nil {
      brightnessBeforeBoost = screen.brightness
    }
    screen.brightness = 1.0
    return true
  }

  private static func restoreScreenBrightness() -> Bool {
    guard let previous = brightnessBeforeBoost else { return false }
    brightnessBeforeBoost = nil
    guard let screen = activeScreen() else { return false }
    screen.brightness = previous
    return true
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
        "deviceType": ultra.deviceType.rawValue,
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
        "deviceType": wide.deviceType.rawValue,
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
          "deviceType": wide.deviceType.rawValue,
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
        "deviceType": tele.deviceType.rawValue,
        "zoom": 0.0,
        "displayFactor": Double(factor),
      ])
    }

    return presets
  }

  private static func consumeLockedCaptures() -> [String] {
    #if canImport(LockedCameraCapture)
    guard #available(iOS 18.0, *) else { return [] }
    let fileManager = FileManager.default
    let destination = fileManager.temporaryDirectory.appendingPathComponent("locked-captures", isDirectory: true)
    try? fileManager.createDirectory(at: destination, withIntermediateDirectories: true)
    var moved: [(url: URL, date: Date)] = []
    for directory in LockedCameraCaptureManager.shared.sessionContentURLs {
      let files = (try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])) ?? []
      for file in files where ["jpg", "jpeg", "heic"].contains(file.pathExtension.lowercased()) {
        let target = destination.appendingPathComponent(file.lastPathComponent)
        try? fileManager.removeItem(at: target)
        guard (try? fileManager.moveItem(at: file, to: target)) != nil else { continue }
        let date = (try? file.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? Date()
        moved.append((target, date))
      }
      Task { try? await LockedCameraCaptureManager.shared.invalidateSessionContent(at: directory) }
    }
    return moved.sorted { $0.date < $1.date }.map { $0.url.absoluteString }
    #else
    return []
    #endif
  }
}

struct NixFocusPointOptions: Record {
  /// Tap location in window (root view) points.
  @Field var windowX: Double = 0
  @Field var windowY: Double = 0
  /// JS-computed device point of interest (0–1), used only without a live preview layer.
  @Field var fallbackX: Double = 0.5
  @Field var fallbackY: Double = 0.5
  /// "back" | "front" and the expo-camera `selectedLens` (the lens deviceType), for the fallback device.
  @Field var facing: String = "back"
  @Field var lensName: String?
  /// true = focus/expose once at the point, then hold (AE/AF lock).
  @Field var lock: Bool = false
}

/// Kept in this file on purpose: a new Swift file in the pod would need `pod install`.
enum NixCameraFocus {
  /// Devices whose focus/exposure this module changed; reset when leaving the camera.
  nonisolated(unsafe) private static var touchedDeviceIds = Set<String>()

  /// Same device types expo-camera's DeviceDiscovery uses, so lens names resolve to the same device.
  private static var discoveryDeviceTypes: [AVCaptureDevice.DeviceType] {
    var types: [AVCaptureDevice.DeviceType] = [
      .builtInWideAngleCamera,
      .builtInTelephotoCamera,
      .builtInUltraWideCamera,
      .builtInTrueDepthCamera,
      .builtInTripleCamera,
      .builtInDualCamera,
      .builtInDualWideCamera,
    ]
    if #available(iOS 15.4, *) {
      types.append(.builtInLiDARDepthCamera)
    }
    return types
  }

  static func keyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    return scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
  }

  /// The on-screen expo-camera preview (its view's backing layer) with a running session.
  private static func livePreviewLayer(in root: UIView) -> AVCaptureVideoPreviewLayer? {
    var stack: [UIView] = [root]
    while let view = stack.popLast() {
      if !view.isHidden, view.window != nil,
         let layer = view.layer as? AVCaptureVideoPreviewLayer,
         layer.bounds.width > 0, layer.bounds.height > 0,
         layer.session?.isRunning == true {
        return layer
      }
      stack.append(contentsOf: view.subviews)
    }
    return nil
  }

  private static func videoDevice(of session: AVCaptureSession?) -> AVCaptureDevice? {
    guard let session else { return nil }
    return session.inputs
      .compactMap { $0 as? AVCaptureDeviceInput }
      .first { $0.device.hasMediaType(.video) }?
      .device
  }

  /// Mirrors expo-camera `updateDevice`: the lens chosen by deviceType, else the wide camera.
  /// localizedName still matches for a bundle older than SDK 58 talking to this binary.
  private static func fallbackDevice(facing: String, lensName: String?) -> AVCaptureDevice? {
    let position: AVCaptureDevice.Position = facing == "front" ? .front : .back
    if let lensName {
      let discovery = AVCaptureDevice.DiscoverySession(
        deviceTypes: discoveryDeviceTypes, mediaType: .video, position: position)
      if let match = discovery.devices.first(where: { $0.deviceType.rawValue == lensName || $0.localizedName == lensName }) {
        return match
      }
    }
    return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
  }

  private static func clamp01(_ value: CGFloat) -> CGFloat {
    return min(max(value, 0), 1)
  }

  static func setFocusPoint(_ options: NixFocusPointOptions) -> [String: Any] {
    var device: AVCaptureDevice?
    var point = CGPoint(x: clamp01(options.fallbackX), y: clamp01(options.fallbackY))
    var converted = false

    if let window = keyWindow(), let layer = livePreviewLayer(in: window) {
      let windowPoint = CGPoint(x: options.windowX, y: options.windowY)
      let layerPoint = layer.convert(windowPoint, from: window.layer)
      let devicePoint = layer.captureDevicePointConverted(fromLayerPoint: layerPoint)
      if devicePoint.x.isFinite, devicePoint.y.isFinite {
        point = CGPoint(x: clamp01(devicePoint.x), y: clamp01(devicePoint.y))
        converted = true
      }
      device = videoDevice(of: layer.session)
    }

    if device == nil {
      device = fallbackDevice(facing: options.facing, lensName: options.lensName)
    }

    guard let device else {
      return ["applied": false, "focusSupported": false, "exposureSupported": false]
    }

    let focusMode: AVCaptureDevice.FocusMode = options.lock ? .autoFocus : .continuousAutoFocus
    let exposureMode: AVCaptureDevice.ExposureMode =
      options.lock ? .autoExpose : .continuousAutoExposure
    let focusSupported = device.isFocusPointOfInterestSupported && device.isFocusModeSupported(focusMode)
    let exposureSupported =
      device.isExposurePointOfInterestSupported && device.isExposureModeSupported(exposureMode)

    do {
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }
      // A point of interest only takes effect once the mode is (re)applied after it.
      if focusSupported {
        device.focusPointOfInterest = point
        device.focusMode = focusMode
      }
      if exposureSupported {
        device.exposurePointOfInterest = point
        device.exposureMode = exposureMode
      }
      device.isSubjectAreaChangeMonitoringEnabled = false
      touchedDeviceIds.insert(device.uniqueID)
    } catch {
      return ["applied": false, "focusSupported": focusSupported, "exposureSupported": exposureSupported]
    }

    return [
      "applied": focusSupported || exposureSupported,
      "focusSupported": focusSupported,
      "exposureSupported": exposureSupported,
      "convertedByPreview": converted,
      "deviceX": Double(point.x),
      "deviceY": Double(point.y),
    ]
  }

  static func resetFocus() -> Bool {
    guard !touchedDeviceIds.isEmpty else { return false }
    let ids = touchedDeviceIds
    touchedDeviceIds.removeAll()
    let center = CGPoint(x: 0.5, y: 0.5)
    var resetAny = false
    for id in ids {
      guard let device = AVCaptureDevice(uniqueID: id) else { continue }
      do {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        if device.isFocusPointOfInterestSupported, device.isFocusModeSupported(.continuousAutoFocus) {
          device.focusPointOfInterest = center
          device.focusMode = .continuousAutoFocus
        }
        if device.isExposurePointOfInterestSupported,
           device.isExposureModeSupported(.continuousAutoExposure) {
          device.exposurePointOfInterest = center
          device.exposureMode = .continuousAutoExposure
        }
        resetAny = true
      } catch {
        continue
      }
    }
    return resetAny
  }
}
