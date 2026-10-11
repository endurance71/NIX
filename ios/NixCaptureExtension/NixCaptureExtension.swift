import AVFoundation
import ExtensionKit
import LockedCameraCapture
import SwiftUI

/// Lock Screen camera (iOS 18): takes a photo without unlocking. Photos go to the session's
/// content directory; after unlocking, the app picks them up and opens its preview.
@main
struct NixCaptureExtension: LockedCameraCaptureExtension {
  var body: some LockedCameraCaptureExtensionScene {
    LockedCameraCaptureUIScene { session in
      NixLockedCaptureView(session: session)
    }
  }
}

private var isPolish: Bool { Locale.preferredLanguages.first?.hasPrefix("pl") ?? false }

struct NixLockedCaptureView: View {
  let session: LockedCameraCaptureSession
  @StateObject private var camera = NixLockedCamera()
  @State private var lastPhoto: UIImage?
  @State private var opening = false

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()
      NixCameraPreview(session: camera.session).ignoresSafeArea()
      VStack {
        Spacer()
        HStack(alignment: .center) {
          Group {
            if let lastPhoto {
              Button {
                openApp()
              } label: {
                Image(uiImage: lastPhoto)
                  .resizable()
                  .scaledToFill()
                  .frame(width: 56, height: 56)
                  .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                  .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(.white, lineWidth: 2))
              }
              .accessibilityLabel(isPolish ? "Otwórz w NiX" : "Open in NiX")
            } else {
              Color.clear.frame(width: 56, height: 56)
            }
          }
          Spacer()
          Button {
            camera.capture { data in
              guard let data else { return }
              save(data)
              lastPhoto = UIImage(data: data)
            }
          } label: {
            ZStack {
              Circle().stroke(.white, lineWidth: 5).frame(width: 78, height: 78)
              Circle().fill(.white).frame(width: 64, height: 64)
            }
          }
          .accessibilityLabel(isPolish ? "Zrób zdjęcie" : "Take photo")
          Spacer()
          Button {
            camera.flip()
          } label: {
            Image(systemName: "arrow.triangle.2.circlepath.camera")
              .font(.system(size: 22, weight: .semibold))
              .foregroundStyle(.white)
              .frame(width: 56, height: 56)
              .background(.ultraThinMaterial, in: Circle())
          }
          .accessibilityLabel(isPolish ? "Przełącz kamerę" : "Switch camera")
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 36)
        if lastPhoto != nil {
          Button(isPolish ? "Wyślij w NiX" : "Send in NiX") { openApp() }
            .font(.headline)
            .buttonStyle(.borderedProminent)
            .disabled(opening)
            .padding(.bottom, 24)
        }
      }
    }
    .onAppear { camera.start() }
    .onDisappear { camera.stop() }
  }

  private func save(_ data: Data) {
    let url = session.sessionContentURL.appendingPathComponent("\(UUID().uuidString).jpg")
    try? data.write(to: url, options: .atomic)
  }

  /// Asks the user to unlock and continues in the app, which imports the photos.
  private func openApp() {
    guard !opening else { return }
    opening = true
    Task {
      let activity = NSUserActivity(activityType: NSUserActivityTypeLockedCameraCapture)
      try? await session.openApplication(for: activity)
      opening = false
    }
  }
}

final class NixLockedCamera: NSObject, ObservableObject, AVCapturePhotoCaptureDelegate {
  let session = AVCaptureSession()
  private let output = AVCapturePhotoOutput()
  private let queue = DispatchQueue(label: "nix.locked-camera")
  private var position: AVCaptureDevice.Position = .back
  private var completion: ((Data?) -> Void)?

  func start() {
    queue.async {
      self.configure()
      if !self.session.isRunning { self.session.startRunning() }
    }
  }

  func stop() {
    queue.async { if self.session.isRunning { self.session.stopRunning() } }
  }

  func flip() {
    queue.async {
      self.position = self.position == .back ? .front : .back
      self.configure()
    }
  }

  private func configure() {
    session.beginConfiguration()
    session.sessionPreset = .photo
    session.inputs.forEach { session.removeInput($0) }
    if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
       let input = try? AVCaptureDeviceInput(device: device),
       session.canAddInput(input) {
      session.addInput(input)
    }
    if !session.outputs.contains(output), session.canAddOutput(output) {
      session.addOutput(output)
    }
    session.commitConfiguration()
  }

  func capture(_ done: @escaping (Data?) -> Void) {
    queue.async {
      self.completion = done
      let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
      if let connection = self.output.connection(with: .video) {
        connection.isVideoMirrored = self.position == .front
      }
      self.output.capturePhoto(with: settings, delegate: self)
    }
  }

  func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
    let data = photo.fileDataRepresentation()
    let done = completion
    completion = nil
    DispatchQueue.main.async { done?(data) }
  }
}

struct NixCameraPreview: UIViewRepresentable {
  let session: AVCaptureSession

  func makeUIView(context: Context) -> PreviewView {
    let view = PreviewView()
    view.previewLayer.session = session
    view.previewLayer.videoGravity = .resizeAspectFill
    return view
  }

  func updateUIView(_ uiView: PreviewView, context: Context) {}

  final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
  }
}
