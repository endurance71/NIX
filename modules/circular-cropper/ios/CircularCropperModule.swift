import ExpoModulesCore
import UIKit

public class CircularCropperModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CircularCropper")

    AsyncFunction("cropToCircle") { (sourcePath: String, targetPath: String, promise: Promise) in
      // Run on a background thread
      DispatchQueue.global(qos: .userInitiated).async {
        guard let image = UIImage(contentsOfFile: sourcePath) else {
          promise.reject("ERR_LOAD_IMAGE", "Could not load image from \(sourcePath)")
          return
        }

        let size = image.size
        let minEdge = min(size.width, size.height)
        
        // Center-crop to a square first
        let cropRect = CGRect(
          x: (size.width - minEdge) / 2,
          y: (size.height - minEdge) / 2,
          width: minEdge,
          height: minEdge
        )
        
        // Note: CGImage's cropping works with pixel dimensions, which UIImage might have scaled.
        // To be robust across different image scales (e.g. @2x, @3x), we handle scale conversion.
        let scale = image.scale
        let scaledCropRect = CGRect(
          x: cropRect.origin.x * scale,
          y: cropRect.origin.y * scale,
          width: cropRect.size.width * scale,
          height: cropRect.size.height * scale
        )
        
        var cgImage: CGImage? = image.cgImage
        
        // Fallback for CIImage-backed UIImages (e.g., filtered or processed images)
        if cgImage == nil, let ciImage = image.ciImage {
          let context = CIContext()
          cgImage = context.createCGImage(ciImage, from: ciImage.extent)
        }
        
        guard let sourceCgImage = cgImage else {
          promise.reject("ERR_GET_CGIMAGE", "Could not retrieve CGImage from source image")
          return
        }
        
        guard let croppedCgImage = sourceCgImage.cropping(to: scaledCropRect) else {
          promise.reject("ERR_CROP_IMAGE", "Could not crop image to square")
          return
        }
        
        let croppedImage = UIImage(cgImage: croppedCgImage, scale: scale, orientation: image.imageOrientation)
        
        // Draw the circular image in a transparent context using modern UIGraphicsImageRenderer
        let rendererFormat = UIGraphicsImageRendererFormat.default()
        rendererFormat.opaque = false
        rendererFormat.scale = scale
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: minEdge, height: minEdge), format: rendererFormat)
        
        let circleImage = renderer.image { rendererContext in
          let rect = CGRect(x: 0, y: 0, width: minEdge, height: minEdge)
          let cgContext = rendererContext.cgContext
          cgContext.addEllipse(in: rect)
          cgContext.clip()
          
          croppedImage.draw(in: rect)
        }
        
        guard let data = circleImage.pngData() else {
          promise.reject("ERR_PNG_DATA", "Could not convert image to PNG data")
          return
        }
        
        let targetUrl = URL(fileURLWithPath: targetPath)
        do {
          try data.write(to: targetUrl)
          // Return the target path prefixed with file:// so it's a valid URI for React Native
          promise.resolve("file://" + targetPath)
        } catch {
          promise.reject("ERR_WRITE_FILE", "Could not write circular image to \(targetPath): \(error.localizedDescription)")
        }
      }
    }
  }
}
