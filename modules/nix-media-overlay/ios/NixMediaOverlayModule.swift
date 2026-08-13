import AVFoundation
import CoreText
import ExpoModulesCore
import PencilKit
import UIKit

public class NixMediaOverlayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NixMediaOverlay")

    View(NixDrawingCanvasView.self) {
      Events("onUndoStateChange")

      Prop("drawingData") { (view, drawingData: String?) in
        view.setDrawingData(drawingData)
      }
      Prop("referenceWidth", 0.0) { (view, width: Double) in
        view.setReferenceWidth(width)
      }
      Prop("referenceHeight", 0.0) { (view, height: Double) in
        view.setReferenceHeight(height)
      }
      Prop("editing", false) { (view, editing: Bool) in
        view.setEditing(editing)
      }
      OnViewDidUpdateProps { view in
        view.applyUpdatedProps()
      }

      AsyncFunction("replaceDrawing") {
        (view: NixDrawingCanvasView, data: String?, width: Double, height: Double) in
        view.replaceDrawing(data: data, width: width, height: height)
      }
      AsyncFunction("exportDrawing") { (view: NixDrawingCanvasView) in
        view.exportDrawing()
      }
      AsyncFunction("undo") { (view: NixDrawingCanvasView) in
        view.undoDrawing()
      }
      AsyncFunction("redo") { (view: NixDrawingCanvasView) in
        view.redoDrawing()
      }
    }

    AsyncFunction("bakeTextOnImageAsync") {
      (
        sourcePath: String,
        targetPath: String,
        text: String,
        normalizedY: Double,
        fontSizePoints: Double,
        viewportWidth: Double,
        viewportHeight: Double,
        textColor: String,
        barColor: String,
        bold: Bool,
        italic: Bool,
        underline: Bool,
        strikethrough: Bool,
        monospace: Bool,
        fontDesign: String,
        align: String,
        drawingData: String,
        drawingWidth: Double,
        drawingHeight: Double,
        promise: Promise
      ) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let style = Self.OverlayStyle(
            textColor: textColor,
            barColor: barColor,
            bold: bold,
            italic: italic,
            underline: underline,
            strikethrough: strikethrough,
            monospace: monospace,
            fontDesign: fontDesign,
            align: align
          )
          let result = try Self.bakeTextOnImage(
            sourcePath: Self.stripFileScheme(sourcePath),
            targetPath: Self.stripFileScheme(targetPath),
            text: text,
            normalizedY: CGFloat(normalizedY),
            fontSizePoints: CGFloat(fontSizePoints),
            viewportWidth: CGFloat(viewportWidth),
            viewportHeight: CGFloat(viewportHeight),
            style: style,
            drawingData: drawingData,
            drawingSize: CGSize(width: drawingWidth, height: drawingHeight)
          )
          promise.resolve(result)
        } catch {
          promise.reject("ERR_BAKE_IMAGE", error.localizedDescription)
        }
      }
    }

    AsyncFunction("bakeTextOnVideoAsync") {
      (
        sourcePath: String,
        targetPath: String,
        text: String,
        normalizedY: Double,
        fontSizePoints: Double,
        viewportWidth: Double,
        viewportHeight: Double,
        textColor: String,
        barColor: String,
        bold: Bool,
        italic: Bool,
        underline: Bool,
        strikethrough: Bool,
        monospace: Bool,
        fontDesign: String,
        align: String,
        drawingData: String,
        drawingWidth: Double,
        drawingHeight: Double,
        promise: Promise
      ) in
      DispatchQueue.global(qos: .userInitiated).async {
        let style = Self.OverlayStyle(
          textColor: textColor,
          barColor: barColor,
          bold: bold,
          italic: italic,
          underline: underline,
          strikethrough: strikethrough,
          monospace: monospace,
          fontDesign: fontDesign,
          align: align
        )
        Self.bakeTextOnVideo(
          sourcePath: Self.stripFileScheme(sourcePath),
          targetPath: Self.stripFileScheme(targetPath),
          text: text,
          normalizedY: CGFloat(normalizedY),
          fontSizePoints: CGFloat(fontSizePoints),
          viewportWidth: CGFloat(viewportWidth),
          viewportHeight: CGFloat(viewportHeight),
          style: style,
          drawingData: drawingData,
          drawingSize: CGSize(width: drawingWidth, height: drawingHeight)
        ) { result in
          switch result {
          case .success(let uri):
            promise.resolve(uri)
          case .failure(let error):
            promise.reject("ERR_BAKE_VIDEO", error.localizedDescription)
          }
        }
      }
    }
  }

  private struct OverlayStyle {
    let textColor: UIColor
    let barColor: UIColor
    let bold: Bool
    let italic: Bool
    let underline: Bool
    let strikethrough: Bool
    let monospace: Bool
    let fontDesign: UIFontDescriptor.SystemDesign
    let align: NSTextAlignment
    let caAlign: CATextLayerAlignmentMode

    init(
      textColor: String,
      barColor: String,
      bold: Bool,
      italic: Bool,
      underline: Bool,
      strikethrough: Bool,
      monospace: Bool,
      fontDesign: String,
      align: String
    ) {
      self.textColor = Self.parseHexColor(textColor) ?? .white
      self.barColor = Self.parseHexColor(barColor) ?? UIColor.black.withAlphaComponent(0.55)
      self.bold = bold
      self.italic = italic
      self.underline = underline
      self.strikethrough = strikethrough
      self.monospace = monospace
      switch fontDesign.lowercased() {
      case "serif":
        self.fontDesign = .serif
      case "rounded":
        self.fontDesign = .rounded
      default:
        self.fontDesign = .default
      }
      switch align.lowercased() {
      case "left":
        self.align = .left
        self.caAlign = .left
      case "right":
        self.align = .right
        self.caAlign = .right
      default:
        self.align = .center
        self.caAlign = .center
      }
    }

    private static func parseHexColor(_ hex: String) -> UIColor? {
      var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
      if cleaned.hasPrefix("#") {
        cleaned.removeFirst()
      }
      guard cleaned.count == 6 || cleaned.count == 8 else { return nil }
      var value: UInt64 = 0
      guard Scanner(string: cleaned).scanHexInt64(&value) else { return nil }
      let hasAlpha = cleaned.count == 8
      let r: CGFloat
      let g: CGFloat
      let b: CGFloat
      let a: CGFloat
      if hasAlpha {
        r = CGFloat((value & 0xFF000000) >> 24) / 255
        g = CGFloat((value & 0x00FF0000) >> 16) / 255
        b = CGFloat((value & 0x0000FF00) >> 8) / 255
        a = CGFloat(value & 0x000000FF) / 255
      } else {
        r = CGFloat((value & 0xFF0000) >> 16) / 255
        g = CGFloat((value & 0x00FF00) >> 8) / 255
        b = CGFloat(value & 0x0000FF) / 255
        a = 1
      }
      return UIColor(red: r, green: g, blue: b, alpha: a)
    }
  }

  private static func stripFileScheme(_ path: String) -> String {
    if path.hasPrefix("file://") {
      return String(path.dropFirst("file://".count))
    }
    return path
  }

  private static func fileUri(_ path: String) -> String {
    path.hasPrefix("file://") ? path : "file://" + path
  }

  // MARK: - Geometry (contentFit: cover)

  private static func coverVisibleRect(
    mediaSize: CGSize,
    viewportSize: CGSize
  ) -> CGRect {
    guard mediaSize.width > 0, mediaSize.height > 0, viewportSize.width > 0, viewportSize.height > 0 else {
      return CGRect(origin: .zero, size: mediaSize)
    }
    let mediaAspect = mediaSize.width / mediaSize.height
    let viewportAspect = viewportSize.width / viewportSize.height
    if mediaAspect > viewportAspect {
      let scale = mediaSize.height / viewportSize.height
      let visibleWidth = viewportSize.width * scale
      let left = (mediaSize.width - visibleWidth) / 2
      return CGRect(x: left, y: 0, width: visibleWidth, height: mediaSize.height)
    }
    let scale = mediaSize.width / viewportSize.width
    let visibleHeight = viewportSize.height * scale
    let top = (mediaSize.height - visibleHeight) / 2
    return CGRect(x: 0, y: top, width: mediaSize.width, height: visibleHeight)
  }

  private static func mediaFontSize(
    mediaSize: CGSize,
    viewportSize: CGSize,
    fontSizePoints: CGFloat
  ) -> CGFloat {
    guard viewportSize.height > 0, mediaSize.height > 0, mediaSize.width > 0, viewportSize.width > 0 else {
      return fontSizePoints
    }
    let mediaAspect = mediaSize.width / mediaSize.height
    let viewportAspect = viewportSize.width / viewportSize.height
    let scale = mediaAspect > viewportAspect
      ? mediaSize.height / viewportSize.height
      : mediaSize.width / viewportSize.width
    return max(1, fontSizePoints * scale)
  }

  // MARK: - Attributed text

  private static let captionBarPaddingH: CGFloat = 14
  private static let captionBarPaddingV: CGFloat = 10
  private static let captionBarCorner: CGFloat = 14

  private static func makeOverlayFont(fontSize: CGFloat, style: OverlayStyle) -> UIFont {
    if style.monospace {
      let weight: UIFont.Weight = style.bold ? .bold : .regular
      let base = UIFont.monospacedSystemFont(ofSize: fontSize, weight: weight)
      if style.italic, let descriptor = base.fontDescriptor.withSymbolicTraits(.traitItalic) {
        return UIFont(descriptor: descriptor, size: fontSize)
      }
      return base
    }

    let weight: UIFont.Weight = style.bold ? .bold : .regular
    var descriptor = UIFont.systemFont(ofSize: fontSize, weight: weight).fontDescriptor
    if let designed = descriptor.withDesign(style.fontDesign) {
      descriptor = designed
    }
    var traits = descriptor.symbolicTraits
    if style.bold { traits.insert(.traitBold) }
    if style.italic { traits.insert(.traitItalic) }
    if let withTraits = descriptor.withSymbolicTraits(traits) {
      return UIFont(descriptor: withTraits, size: fontSize)
    }
    return UIFont(descriptor: descriptor, size: fontSize)
  }

  private static func makeAttributedText(
    text: String,
    fontSize: CGFloat,
    style: OverlayStyle
  ) -> NSAttributedString {
    let font = makeOverlayFont(fontSize: fontSize, style: style)
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = style.align
    paragraph.lineBreakMode = .byWordWrapping

    var attributes: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: style.textColor,
      .paragraphStyle: paragraph,
    ]
    if style.underline {
      attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
    }
    if style.strikethrough {
      attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
    }

    return NSAttributedString(string: text, attributes: attributes)
  }

  private static func captionBarCornerRadius(scale: CGFloat) -> CGFloat {
    captionBarCorner * scale
  }

  private static func loadDrawing(_ base64: String) -> PKDrawing? {
    guard !base64.isEmpty,
          let data = Data(base64Encoded: base64),
          let drawing = try? PKDrawing(data: data),
          !drawing.strokes.isEmpty else {
      return nil
    }
    return drawing
  }

  private static func drawingImage(
    data: String,
    referenceSize: CGSize,
    destinationSize: CGSize
  ) -> UIImage? {
    guard let drawing = loadDrawing(data),
          referenceSize.width > 0,
          referenceSize.height > 0 else {
      return nil
    }
    let outputScale = max(
      1,
      max(
        destinationSize.width / referenceSize.width,
        destinationSize.height / referenceSize.height
      )
    )
    return drawing.image(
      from: CGRect(origin: .zero, size: referenceSize),
      scale: outputScale
    )
  }

  // MARK: - Image bake

  private static func bakeTextOnImage(
    sourcePath: String,
    targetPath: String,
    text: String,
    normalizedY: CGFloat,
    fontSizePoints: CGFloat,
    viewportWidth: CGFloat,
    viewportHeight: CGFloat,
    style: OverlayStyle,
    drawingData: String,
    drawingSize: CGSize
  ) throws -> String {
    guard let image = UIImage(contentsOfFile: sourcePath) else {
      throw NSError(domain: "NixMediaOverlay", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Could not load image from \(sourcePath)",
      ])
    }

    let mediaSize = image.size
    let viewport = CGSize(width: viewportWidth, height: viewportHeight)
    let visible = coverVisibleRect(mediaSize: mediaSize, viewportSize: viewport)
    let hasText = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let drawing = drawingImage(
      data: drawingData,
      referenceSize: drawingSize,
      destinationSize: visible.size
    )

    let format = UIGraphicsImageRendererFormat.default()
    format.opaque = true
    format.scale = image.scale
    let renderer = UIGraphicsImageRenderer(size: mediaSize, format: format)
    let rendered = renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: mediaSize))
      drawing?.draw(in: visible)

      if hasText {
        let y = max(0, min(1, normalizedY))
        let centerY = visible.minY + visible.height * y
        let drawnFont = mediaFontSize(
          mediaSize: mediaSize,
          viewportSize: viewport,
          fontSizePoints: fontSizePoints
        )
        let scale = drawnFont / max(fontSizePoints, 1)
        let attributed = makeAttributedText(text: text, fontSize: drawnFont, style: style)
        let barWidth = visible.width * 0.9
        let maxTextWidth = barWidth - captionBarPaddingH * 2 * scale
        let textBounds = attributed.boundingRect(
          with: CGSize(width: max(1, maxTextWidth), height: .greatestFiniteMagnitude),
          options: [.usesLineFragmentOrigin, .usesFontLeading],
          context: nil
        )
        let barHeight = max(textBounds.height + captionBarPaddingV * 2 * scale, 48 * scale)
        let barRect = CGRect(
          x: visible.midX - barWidth / 2,
          y: centerY - barHeight / 2,
          width: barWidth,
          height: barHeight
        )
        let textRect = CGRect(
          x: barRect.minX + captionBarPaddingH * scale,
          y: barRect.midY - textBounds.height / 2,
          width: barRect.width - captionBarPaddingH * 2 * scale,
          height: textBounds.height
        )
        var alpha: CGFloat = 0
        style.barColor.getRed(nil, green: nil, blue: nil, alpha: &alpha)
        if alpha > 0.01 {
          style.barColor.setFill()
          UIBezierPath(roundedRect: barRect, cornerRadius: captionBarCorner * scale).fill()
        }
        attributed.draw(
          with: textRect,
          options: [.usesLineFragmentOrigin, .usesFontLeading],
          context: nil
        )
      }
    }

    guard let data = rendered.jpegData(compressionQuality: 0.92) else {
      throw NSError(domain: "NixMediaOverlay", code: 2, userInfo: [
        NSLocalizedDescriptionKey: "Could not encode JPEG",
      ])
    }

    let targetUrl = URL(fileURLWithPath: targetPath)
    try FileManager.default.createDirectory(
      at: targetUrl.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try data.write(to: targetUrl, options: .atomic)
    return fileUri(targetPath)
  }

  // MARK: - Video bake

  private static func bakeTextOnVideo(
    sourcePath: String,
    targetPath: String,
    text: String,
    normalizedY: CGFloat,
    fontSizePoints: CGFloat,
    viewportWidth: CGFloat,
    viewportHeight: CGFloat,
    style: OverlayStyle,
    drawingData: String,
    drawingSize: CGSize,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    let sourceUrl = URL(fileURLWithPath: sourcePath)
    let targetUrl = URL(fileURLWithPath: targetPath)
    let asset = AVURLAsset(url: sourceUrl)

    guard let videoTrack = asset.tracks(withMediaType: .video).first else {
      completion(.failure(NSError(domain: "NixMediaOverlay", code: 3, userInfo: [
        NSLocalizedDescriptionKey: "Video has no video track",
      ])))
      return
    }

    let composition = AVMutableComposition()
    guard let compositionVideoTrack = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      completion(.failure(NSError(domain: "NixMediaOverlay", code: 4, userInfo: [
        NSLocalizedDescriptionKey: "Could not create composition video track",
      ])))
      return
    }

    let duration = asset.duration
    let timeRange = CMTimeRange(start: .zero, duration: duration)

    do {
      try compositionVideoTrack.insertTimeRange(timeRange, of: videoTrack, at: .zero)
      compositionVideoTrack.preferredTransform = videoTrack.preferredTransform

      if let audioTrack = asset.tracks(withMediaType: .audio).first,
         let compositionAudioTrack = composition.addMutableTrack(
          withMediaType: .audio,
          preferredTrackID: kCMPersistentTrackID_Invalid
         ) {
        try compositionAudioTrack.insertTimeRange(timeRange, of: audioTrack, at: .zero)
      }
    } catch {
      completion(.failure(error))
      return
    }

    let naturalSize = videoTrack.naturalSize
    let transform = videoTrack.preferredTransform
    let renderSize = CGSize(
      width: abs(naturalSize.applying(transform).width),
      height: abs(naturalSize.applying(transform).height)
    )
    guard renderSize.width > 0, renderSize.height > 0 else {
      completion(.failure(NSError(domain: "NixMediaOverlay", code: 5, userInfo: [
        NSLocalizedDescriptionKey: "Invalid video render size",
      ])))
      return
    }

    let viewport = CGSize(width: viewportWidth, height: viewportHeight)
    let visible = coverVisibleRect(mediaSize: renderSize, viewportSize: viewport)
    let parentLayer = CALayer()
    parentLayer.frame = CGRect(origin: .zero, size: renderSize)
    parentLayer.isGeometryFlipped = true

    let videoLayer = CALayer()
    videoLayer.frame = CGRect(origin: .zero, size: renderSize)
    parentLayer.addSublayer(videoLayer)

    if let drawing = drawingImage(
      data: drawingData,
      referenceSize: drawingSize,
      destinationSize: visible.size
    ) {
      let drawingLayer = CALayer()
      drawingLayer.frame = visible
      drawingLayer.contents = drawing.cgImage
      drawingLayer.contentsGravity = .resize
      drawingLayer.contentsScale = drawing.scale
      parentLayer.addSublayer(drawingLayer)
    }

    if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      let y = max(0, min(1, normalizedY))
      let centerY = visible.minY + visible.height * y
      let drawnFont = mediaFontSize(
        mediaSize: renderSize,
        viewportSize: viewport,
        fontSizePoints: fontSizePoints
      )
      let attributed = makeAttributedText(text: text, fontSize: drawnFont, style: style)
      let scale = drawnFont / max(fontSizePoints, 1)
      let barWidth = visible.width * 0.9
      let maxTextWidth = barWidth - captionBarPaddingH * 2 * scale
      let textBounds = attributed.boundingRect(
        with: CGSize(width: max(1, maxTextWidth), height: .greatestFiniteMagnitude),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        context: nil
      )
      let barHeight = max(textBounds.height + captionBarPaddingV * 2 * scale, 48 * scale)
      let barRect = CGRect(
        x: visible.midX - barWidth / 2,
        y: centerY - barHeight / 2,
        width: barWidth,
        height: barHeight
      )

      var barAlpha: CGFloat = 0
      style.barColor.getRed(nil, green: nil, blue: nil, alpha: &barAlpha)
      if barAlpha > 0.01 {
        let barLayer = CALayer()
        barLayer.backgroundColor = style.barColor.cgColor
        barLayer.cornerRadius = captionBarCornerRadius(scale: scale)
        barLayer.frame = barRect
        parentLayer.addSublayer(barLayer)
      }

      let textLayer = CATextLayer()
      textLayer.string = attributed
      textLayer.alignmentMode = style.caAlign
      textLayer.contentsScale = UIScreen.main.scale
      textLayer.isWrapped = true
      textLayer.foregroundColor = style.textColor.cgColor
      textLayer.frame = CGRect(
        x: barRect.minX + captionBarPaddingH * scale,
        y: barRect.midY - textBounds.height / 2,
        width: barRect.width - captionBarPaddingH * 2 * scale,
        height: ceil(textBounds.height)
      )
      parentLayer.addSublayer(textLayer)
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
      postProcessingAsVideoLayer: videoLayer,
      in: parentLayer
    )

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = timeRange
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideoTrack)
    layerInstruction.setTransform(videoTrack.preferredTransform, at: .zero)
    instruction.layerInstructions = [layerInstruction]
    videoComposition.instructions = [instruction]

    try? FileManager.default.removeItem(at: targetUrl)
    try? FileManager.default.createDirectory(
      at: targetUrl.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )

    guard let exportSession = AVAssetExportSession(
      asset: composition,
      presetName: AVAssetExportPresetHighestQuality
    ) else {
      completion(.failure(NSError(domain: "NixMediaOverlay", code: 6, userInfo: [
        NSLocalizedDescriptionKey: "Could not create export session",
      ])))
      return
    }

    exportSession.outputURL = targetUrl
    exportSession.outputFileType = .mp4
    exportSession.videoComposition = videoComposition
    exportSession.shouldOptimizeForNetworkUse = true

    exportSession.exportAsynchronously {
      switch exportSession.status {
      case .completed:
        completion(.success(fileUri(targetPath)))
      case .failed, .cancelled:
        completion(.failure(exportSession.error ?? NSError(
          domain: "NixMediaOverlay",
          code: 7,
          userInfo: [NSLocalizedDescriptionKey: "Video export failed"]
        )))
      default:
        completion(.failure(NSError(
          domain: "NixMediaOverlay",
          code: 8,
          userInfo: [NSLocalizedDescriptionKey: "Unexpected export status"]
        )))
      }
    }
  }
}
