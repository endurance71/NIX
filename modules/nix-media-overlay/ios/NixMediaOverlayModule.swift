import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins
import CoreMedia
import CoreText
import CoreVideo
import ExpoModulesCore
import PencilKit
import UIKit

private struct BakeOverlaysOptions: Record {
  /// Identifies a delivery bake for progress events and cancellation; defaults to the target path.
  @Field var bakeId: String = ""
  /// Delivery profile (PERF-23). Defaults mirror `selectVideoCompressionProfile` (balanced, H.264).
  @Field var maxDimension: Double = 1280
  @Field var videoBitrate: Double = 1_800_000
  @Field var audioBitrate: Double = 96_000
  @Field var maxFrameRate: Double = 30
  @Field var sourcePath: String = ""
  @Field var targetPath: String = ""
  @Field var text: String = ""
  @Field var normalizedY: Double = 0.5
  @Field var fontSizePoints: Double = 34
  @Field var viewportWidth: Double = 0
  @Field var viewportHeight: Double = 0
  /// `bar`: full-width Snapchat-style caption strip. Anything else: the rounded text sticker.
  @Field var variant: String = "sticker"
  @Field var textColor: String = "#000000"
  @Field var barColor: String = "#FFFFFFCC"
  @Field var bold: Bool = true
  @Field var italic: Bool = false
  @Field var underline: Bool = false
  @Field var strikethrough: Bool = false
  @Field var monospace: Bool = false
  @Field var fontDesign: String = "system"
  @Field var align: String = "center"
  @Field var drawingData: String = ""
  @Field var drawingWidth: Double = 0
  @Field var drawingHeight: Double = 0
  /// Feature level 2: 4×5 colour matrix (rows R, G, B, A; columns r, g, b, a, bias). Empty = none.
  @Field var filterMatrix: [Double] = []
  /// Feature level 2: emoji stickers, bottom to top.
  @Field var stickers: [EmojiStickerRecord] = []
}

private struct EmojiStickerRecord: Record {
  @Field var emoji: String = ""
  /// Centre, normalised 0–1 to the visible cover frame.
  @Field var x: Double = 0.5
  @Field var y: Double = 0.5
  /// Preview points; scaled to media pixels like the caption font.
  @Field var fontSizePoints: Double = 72
  /// Radians, clockwise.
  @Field var rotation: Double = 0
}

public class NixMediaOverlayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NixMediaOverlay")

    // 2: colour filters, emoji stickers, NixFilteredImageView, applyPlayerFilterAsync.
    // JS hides those tools below this level so an OTA bundle never shows a layer the bake drops.
    Constant("featureLevel") { 2 }
    // The bake draws the `variant: "bar"` caption strip. JS offers the bar only when this is true,
    // so an OTA bundle on an older binary never previews a bar that would bake as a sticker.
    Constant("supportsCaptionBar") { true }

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

    // Second view: must stay after the drawing canvas, which is the module's default view.
    View(NixFilteredImageView.self) {
      Prop("uri", "") { (view: NixFilteredImageView, uri: String) in
        view.setUri(uri)
      }
      Prop("filterMatrix", [Double]()) { (view: NixFilteredImageView, matrix: [Double]) in
        view.setFilterMatrix(matrix)
      }
      Prop("contentFit", "cover") { (view: NixFilteredImageView, fit: String) in
        view.setContentFit(fit)
      }
      OnViewDidUpdateProps { (view: NixFilteredImageView) in
        view.applyUpdatedProps()
      }
    }

    // Live preview of a colour filter on an expo-video player (any `SharedRef<AVPlayer>`).
    // Resolves false when the player has no item yet; JS re-applies after `sourceLoad`.
    AsyncFunction("applyPlayerFilterAsync") { (player: SharedRef<AVPlayer>, filterMatrix: [Double]) -> Bool in
      guard let item = player.ref.currentItem else { return false }
      if let filter = MediaColorFilter(matrix: filterMatrix) {
        item.videoComposition = AVVideoComposition(asset: item.asset) { request in
          request.finish(with: filter.apply(to: request.sourceImage), context: nil)
        }
      } else {
        item.videoComposition = nil
      }
      // A paused player only re-renders its frame through the new composition after a seek.
      if player.ref.rate == 0 {
        item.seek(to: item.currentTime(), toleranceBefore: .zero, toleranceAfter: .zero, completionHandler: nil)
      }
      return true
    }.runOnQueue(.main)

    AsyncFunction("bakeOverlaysOnImageAsync") {
      (options: BakeOverlaysOptions, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try Self.bakeTextOnImage(
            sourcePath: Self.stripFileScheme(options.sourcePath),
            targetPath: Self.stripFileScheme(options.targetPath),
            spec: Self.OverlaySpec(options: options)
          )
          promise.resolve(result)
        } catch {
          promise.reject("ERR_BAKE_IMAGE", error.localizedDescription)
        }
      }
    }

    AsyncFunction("bakeOverlaysOnVideoAsync") {
      (options: BakeOverlaysOptions, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        Self.bakeTextOnVideo(
          sourcePath: Self.stripFileScheme(options.sourcePath),
          targetPath: Self.stripFileScheme(options.targetPath),
          spec: Self.OverlaySpec(options: options)
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

    Events("onVideoBakeProgress")

    // Bakes overlays and encodes straight into the upload delivery profile (H.264, long side
    // <= maxDimension, ~videoBitrate + AAC audioBitrate), so the upload queue can skip its second
    // transcode (PERF-23). Falls back to the legacy high-quality export when the reader/writer
    // pipeline fails; the result's `profile` tells JS which one produced the file.
    AsyncFunction("bakeOverlaysOnVideoForDeliveryAsync") {
      [weak self] (options: BakeOverlaysOptions) async throws -> [String: Any] in
      let sourcePath = Self.stripFileScheme(options.sourcePath)
      let targetPath = Self.stripFileScheme(options.targetPath)
      let bakeId = options.bakeId.isEmpty ? targetPath : options.bakeId
      let spec = Self.OverlaySpec(options: options)
      let profile = DeliveryVideoProfile(
        maxDimension: CGFloat(options.maxDimension),
        videoBitrate: Int(options.videoBitrate),
        audioBitrate: Int(options.audioBitrate),
        maxFrameRate: Int(options.maxFrameRate)
      )
      let exporter = DeliveryVideoExporter(
        sourceUrl: URL(fileURLWithPath: sourcePath),
        targetUrl: URL(fileURLWithPath: targetPath),
        profile: profile,
        colorFilter: spec.colorFilter,
        makeOverlay: { displaySize, pixelScale in
          Self.renderVideoOverlayImage(displaySize: displaySize, pixelScale: pixelScale, spec: spec)
        },
        onProgress: { progress in
          self?.sendEvent("onVideoBakeProgress", ["bakeId": bakeId, "progress": progress])
        }
      )

      guard Self.activeVideoBakes.register(exporter, for: bakeId) else {
        throw Self.bakeCancelledException()
      }
      defer { Self.activeVideoBakes.unregister(exporter, for: bakeId) }

      do {
        let result = try await exporter.export()
        return [
          "uri": Self.fileUri(targetPath),
          "profile": "delivery",
          "codec": "h264",
          "width": result.width,
          "height": result.height,
          "durationMs": result.durationMs,
          "sizeBytes": Double(result.sizeBytes),
          "videoBitrate": profile.videoBitrate,
          "audioBitrate": result.hasAudio ? profile.audioBitrate : 0,
          "hasAudio": result.hasAudio,
          "frameRate": result.frameRate,
        ]
      } catch {
        if exporter.isCancelled || error is CancellationError {
          throw Self.bakeCancelledException()
        }
        let fallbackReason = error.localizedDescription
        do {
          let uri = try await Self.bakeTextOnVideoLegacy(
            sourcePath: sourcePath,
            targetPath: targetPath,
            spec: spec
          )
          return ["uri": uri, "profile": "master", "fallbackReason": fallbackReason]
        } catch {
          throw Exception(
            name: "BakeVideoFailed",
            description: error.localizedDescription,
            code: "ERR_BAKE_VIDEO"
          )
        }
      }
    }

    AsyncFunction("cancelVideoBakeAsync") { (bakeId: String) in
      Self.activeVideoBakes.cancel(bakeId)
    }
  }

  private static let activeVideoBakes = VideoBakeRegistry()

  /// Scale of the screen NiX runs on. `UIScreen.main` is deprecated under the scene life cycle, and
  /// the bakes run off the main thread, so the scale is read from the window scene once, on main.
  private static let displayScale: CGFloat = {
    let read = {
      UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.screen.scale }.max() ?? 3
    }
    return Thread.isMainThread ? read() : DispatchQueue.main.sync(execute: read)
  }()

  private static func bakeCancelledException() -> Exception {
    Exception(
      name: "BakeCancelled",
      description: "Video overlay bake was cancelled",
      code: "ERR_BAKE_CANCELLED"
    )
  }

  /// Overlay inputs shared by the delivery export and its legacy fallback.
  private struct OverlaySpec {
    let text: String
    let normalizedY: CGFloat
    let fontSizePoints: CGFloat
    let viewport: CGSize
    let style: OverlayStyle
    let drawingData: String
    let drawingSize: CGSize
    let colorFilter: MediaColorFilter?
    let stickers: [EmojiStickerSpec]

    var hasText: Bool {
      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    init(options: BakeOverlaysOptions) {
      text = options.text
      normalizedY = CGFloat(options.normalizedY)
      fontSizePoints = CGFloat(options.fontSizePoints)
      viewport = CGSize(width: options.viewportWidth, height: options.viewportHeight)
      style = OverlayStyle(
        variant: options.variant,
        textColor: options.textColor,
        barColor: options.barColor,
        bold: options.bold,
        italic: options.italic,
        underline: options.underline,
        strikethrough: options.strikethrough,
        monospace: options.monospace,
        fontDesign: options.fontDesign,
        align: options.align
      )
      drawingData = options.drawingData
      drawingSize = CGSize(width: options.drawingWidth, height: options.drawingHeight)
      colorFilter = MediaColorFilter(matrix: options.filterMatrix)
      stickers = options.stickers.compactMap { record in
        let emoji = record.emoji.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !emoji.isEmpty, record.fontSizePoints.isFinite, record.fontSizePoints > 0 else { return nil }
        return EmojiStickerSpec(
          emoji: emoji,
          x: CGFloat(record.x.isFinite ? record.x : 0.5),
          y: CGFloat(record.y.isFinite ? record.y : 0.5),
          fontSizePoints: CGFloat(record.fontSizePoints),
          rotation: CGFloat(record.rotation.isFinite ? record.rotation : 0)
        )
      }
    }
  }

  private struct EmojiStickerSpec {
    let emoji: String
    let x: CGFloat
    let y: CGFloat
    let fontSizePoints: CGFloat
    let rotation: CGFloat
  }

  private struct OverlayStyle {
    /// Full-width caption strip instead of the rounded sticker (`variant: "bar"`).
    let captionBar: Bool
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
      variant: String,
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
      self.captionBar = variant.lowercased() == "bar"
      self.textColor = Self.parseHexColor(textColor) ?? .white
      self.barColor = Self.parseHexColor(barColor) ?? UIColor.white.withAlphaComponent(0.8)
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

  // Caption strip (`variant: "bar"`). Mirrors MEDIA_TEXT_CAPTION_BAR_* in
  // src/types/mediaTextOverlay.ts; the colours and the fixed font size arrive from JS.
  private static let captionStripPaddingH: CGFloat = 16
  private static let captionStripPaddingV: CGFloat = 8
  private static let captionStripLineHeightFactor: CGFloat = 1.2

  private struct CaptionStripLayout {
    let attributed: NSAttributedString
    let barRect: CGRect
    let textRect: CGRect
  }

  /// Edge-to-edge strip across the visible frame, centred on `normalizedY`, no corner radius.
  /// The text wraps inside the horizontal padding; one line of the font is the minimum height.
  private static func captionStripLayout(
    text: String,
    normalizedY: CGFloat,
    fontSizePoints: CGFloat,
    mediaSize: CGSize,
    viewport: CGSize,
    visible: CGRect,
    style: OverlayStyle
  ) -> CaptionStripLayout {
    let y = max(0, min(1, normalizedY))
    let centerY = visible.minY + visible.height * y
    let drawnFont = mediaFontSize(
      mediaSize: mediaSize,
      viewportSize: viewport,
      fontSizePoints: fontSizePoints
    )
    let scale = drawnFont / max(fontSizePoints, 1)
    let attributed = makeAttributedText(text: text, fontSize: drawnFont, style: style)
    let paddingH = captionStripPaddingH * scale
    let paddingV = captionStripPaddingV * scale
    let maxTextWidth = visible.width - paddingH * 2
    let textBounds = attributed.boundingRect(
      with: CGSize(width: max(1, maxTextWidth), height: .greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      context: nil
    )
    let contentHeight = max(textBounds.height, drawnFont * captionStripLineHeightFactor)
    let barHeight = contentHeight + paddingV * 2
    let barRect = CGRect(
      x: visible.minX,
      y: centerY - barHeight / 2,
      width: visible.width,
      height: barHeight
    )
    let textRect = CGRect(
      x: barRect.minX + paddingH,
      y: barRect.midY - textBounds.height / 2,
      width: max(1, maxTextWidth),
      height: textBounds.height
    )
    return CaptionStripLayout(attributed: attributed, barRect: barRect, textRect: textRect)
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
    // The editor canvas is forced to light appearance; render the ink in the same trait so a
    // drawing made while the app is in dark mode does not come out with inverted colours.
    var image: UIImage?
    UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
      image = drawing.image(
        from: CGRect(origin: .zero, size: referenceSize),
        scale: outputScale
      )
    }
    return image
  }

  /// Draws emoji stickers into the current UIKit context, in media (display) coordinates.
  /// Mirrors the preview: centre at (x, y) of the visible cover frame, font scaled like the
  /// caption, rotated clockwise about the centre.
  private static func drawStickers(
    _ stickers: [EmojiStickerSpec],
    mediaSize: CGSize,
    viewport: CGSize,
    visible: CGRect
  ) {
    guard !stickers.isEmpty, let context = UIGraphicsGetCurrentContext() else { return }
    for sticker in stickers {
      let fontSize = mediaFontSize(
        mediaSize: mediaSize,
        viewportSize: viewport,
        fontSizePoints: sticker.fontSizePoints
      )
      let attributed = NSAttributedString(
        string: sticker.emoji,
        attributes: [.font: UIFont.systemFont(ofSize: fontSize)]
      )
      let size = attributed.size()
      let center = CGPoint(
        x: visible.minX + visible.width * max(0, min(1, sticker.x)),
        y: visible.minY + visible.height * max(0, min(1, sticker.y))
      )
      context.saveGState()
      context.translateBy(x: center.x, y: center.y)
      context.rotate(by: sticker.rotation)
      attributed.draw(at: CGPoint(x: -size.width / 2, y: -size.height / 2))
      context.restoreGState()
    }
  }

  /// Draws the caption bar and text into the current UIKit context, in media (display) coordinates.
  private static func drawCaption(
    text: String,
    normalizedY: CGFloat,
    fontSizePoints: CGFloat,
    mediaSize: CGSize,
    viewport: CGSize,
    visible: CGRect,
    style: OverlayStyle
  ) {
    if style.captionBar {
      let layout = captionStripLayout(
        text: text,
        normalizedY: normalizedY,
        fontSizePoints: fontSizePoints,
        mediaSize: mediaSize,
        viewport: viewport,
        visible: visible,
        style: style
      )
      style.barColor.setFill()
      UIBezierPath(rect: layout.barRect).fill()
      layout.attributed.draw(
        with: layout.textRect,
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        context: nil
      )
      return
    }
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
    let barHeight = max(textBounds.height + captionBarPaddingV * 2 * scale, 36 * scale)
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

  /// Renders drawing + caption once into a transparent image laid out in the video's display
  /// coordinates (same geometry as the legacy Core Animation bake), rasterised at `pixelScale`
  /// so it matches the encoded frame size. Returns nil when there is nothing to draw.
  private static func renderVideoOverlayImage(
    displaySize: CGSize,
    pixelScale: CGFloat,
    spec: OverlaySpec
  ) -> CGImage? {
    let visible = coverVisibleRect(mediaSize: displaySize, viewportSize: spec.viewport)
    let hasText = spec.hasText
    let drawing = drawingImage(
      data: spec.drawingData,
      referenceSize: spec.drawingSize,
      destinationSize: visible.size
    )
    guard hasText || drawing != nil || !spec.stickers.isEmpty else { return nil }

    let format = UIGraphicsImageRendererFormat.default()
    format.opaque = false
    format.scale = pixelScale
    format.preferredRange = .standard
    let renderer = UIGraphicsImageRenderer(size: displaySize, format: format)
    let image = renderer.image { _ in
      drawing?.draw(in: visible)
      drawStickers(spec.stickers, mediaSize: displaySize, viewport: spec.viewport, visible: visible)
      if hasText {
        drawCaption(
          text: spec.text,
          normalizedY: spec.normalizedY,
          fontSizePoints: spec.fontSizePoints,
          mediaSize: displaySize,
          viewport: spec.viewport,
          visible: visible,
          style: spec.style
        )
      }
    }
    return image.cgImage
  }

  /// Legacy `AVAssetExportPresetHighestQuality` bake, used as a fallback for the delivery export.
  private static func bakeTextOnVideoLegacy(
    sourcePath: String,
    targetPath: String,
    spec: OverlaySpec
  ) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.global(qos: .userInitiated).async {
        bakeTextOnVideo(
          sourcePath: sourcePath,
          targetPath: targetPath,
          spec: spec
        ) { result in
          continuation.resume(with: result)
        }
      }
    }
  }

  // MARK: - Image bake

  private static func bakeTextOnImage(
    sourcePath: String,
    targetPath: String,
    spec: OverlaySpec
  ) throws -> String {
    guard let image = UIImage(contentsOfFile: sourcePath) else {
      throw NSError(domain: "NixMediaOverlay", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Could not load image from \(sourcePath)",
      ])
    }

    let mediaSize = image.size
    let viewport = spec.viewport
    let visible = coverVisibleRect(mediaSize: mediaSize, viewportSize: viewport)
    let hasText = spec.hasText
    let drawing = drawingImage(
      data: spec.drawingData,
      referenceSize: spec.drawingSize,
      destinationSize: visible.size
    )
    // Same Core Image path as NixFilteredImageView, so the file matches the preview.
    let base: UIImage = spec.colorFilter.flatMap { filter in
      MediaColorFilter.filteredPhoto(atPath: sourcePath, filter: filter, scale: image.scale)
    } ?? image

    let format = UIGraphicsImageRendererFormat.default()
    format.opaque = true
    format.scale = image.scale
    let renderer = UIGraphicsImageRenderer(size: mediaSize, format: format)
    let rendered = renderer.image { _ in
      base.draw(in: CGRect(origin: .zero, size: mediaSize))
      drawing?.draw(in: visible)
      drawStickers(spec.stickers, mediaSize: mediaSize, viewport: viewport, visible: visible)

      if hasText {
        drawCaption(
          text: spec.text,
          normalizedY: spec.normalizedY,
          fontSizePoints: spec.fontSizePoints,
          mediaSize: mediaSize,
          viewport: viewport,
          visible: visible,
          style: spec.style
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
    spec: OverlaySpec,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    if spec.colorFilter != nil || !spec.stickers.isEmpty {
      bakeVideoWithCoreImage(sourcePath: sourcePath, targetPath: targetPath, spec: spec, completion: completion)
      return
    }
    let text = spec.text
    let normalizedY = spec.normalizedY
    let fontSizePoints = spec.fontSizePoints
    let viewportWidth = spec.viewport.width
    let viewportHeight = spec.viewport.height
    let style = spec.style
    let drawingData = spec.drawingData
    let drawingSize = spec.drawingSize
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

    if style.captionBar, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      let layout = captionStripLayout(
        text: text,
        normalizedY: normalizedY,
        fontSizePoints: fontSizePoints,
        mediaSize: renderSize,
        viewport: viewport,
        visible: visible,
        style: style
      )
      let barLayer = CALayer()
      barLayer.backgroundColor = style.barColor.cgColor
      barLayer.frame = layout.barRect
      parentLayer.addSublayer(barLayer)

      let textLayer = CATextLayer()
      textLayer.string = layout.attributed
      textLayer.alignmentMode = style.caAlign
      textLayer.contentsScale = Self.displayScale
      textLayer.isWrapped = true
      textLayer.foregroundColor = style.textColor.cgColor
      textLayer.frame = CGRect(
        x: layout.textRect.minX,
        y: layout.textRect.minY,
        width: layout.textRect.width,
        height: ceil(layout.textRect.height)
      )
      parentLayer.addSublayer(textLayer)
    } else if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
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
      let barHeight = max(textBounds.height + captionBarPaddingV * 2 * scale, 36 * scale)
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
      textLayer.contentsScale = Self.displayScale
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

  /// Highest-quality export with a colour filter and/or stickers: Core Image filters each
  /// (already oriented) frame and composites the static overlay image on top. Used for gallery
  /// saves and as the delivery fallback; the delivery export does the same per frame.
  private static func bakeVideoWithCoreImage(
    sourcePath: String,
    targetPath: String,
    spec: OverlaySpec,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    let targetUrl = URL(fileURLWithPath: targetPath)
    let asset = AVURLAsset(url: URL(fileURLWithPath: sourcePath))
    guard let videoTrack = asset.tracks(withMediaType: .video).first else {
      completion(.failure(NSError(domain: "NixMediaOverlay", code: 3, userInfo: [
        NSLocalizedDescriptionKey: "Video has no video track",
      ])))
      return
    }
    let orientedRect = CGRect(origin: .zero, size: videoTrack.naturalSize)
      .applying(videoTrack.preferredTransform)
    let displaySize = CGSize(width: abs(orientedRect.width).rounded(), height: abs(orientedRect.height).rounded())
    guard displaySize.width > 0, displaySize.height > 0 else {
      completion(.failure(NSError(domain: "NixMediaOverlay", code: 5, userInfo: [
        NSLocalizedDescriptionKey: "Invalid video render size",
      ])))
      return
    }
    let overlay: CIImage? = renderVideoOverlayImage(displaySize: displaySize, pixelScale: 1, spec: spec)
      .map { CIImage(cgImage: $0) }
    let filter = spec.colorFilter

    let videoComposition = AVMutableVideoComposition(asset: asset) { request in
      let source = request.sourceImage
      var frame = filter?.apply(to: source) ?? source
      if let overlay {
        // The composition renders at the oriented size; fit the overlay to the frame extent.
        let extent = source.extent
        let fitted = overlay
          .transformed(by: CGAffineTransform(
            scaleX: extent.width / max(1, overlay.extent.width),
            y: extent.height / max(1, overlay.extent.height)
          ))
          .transformed(by: CGAffineTransform(translationX: extent.minX, y: extent.minY))
        frame = fitted.composited(over: frame)
      }
      request.finish(with: frame.cropped(to: source.extent), context: nil)
    }

    try? FileManager.default.removeItem(at: targetUrl)
    try? FileManager.default.createDirectory(
      at: targetUrl.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    guard let exportSession = AVAssetExportSession(
      asset: asset,
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
      default:
        completion(.failure(exportSession.error ?? NSError(
          domain: "NixMediaOverlay",
          code: 7,
          userInfo: [NSLocalizedDescriptionKey: "Video export failed"]
        )))
      }
    }
  }
}

// MARK: - Colour filter (shared by preview and bake)

/// A 4×5 colour matrix applied with `CIColorMatrix` and clamped to 0–1. The matrices come from
/// `src/lib/mediaFilters.ts`; the preview (photo view, AVPlayer composition) and every bake path
/// use this one type, so the file matches what the sender saw.
struct MediaColorFilter: @unchecked Sendable {
  private let rVector: CIVector
  private let gVector: CIVector
  private let bVector: CIVector
  private let aVector: CIVector
  private let biasVector: CIVector
  let key: String

  /// Nil for an empty, malformed or identity matrix (no filtering at all).
  init?(matrix: [Double]) {
    guard matrix.count == 20, matrix.allSatisfy({ $0.isFinite }) else { return nil }
    let identity: [Double] = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]
    if zip(matrix, identity).allSatisfy({ abs($0 - $1) < 0.000_1 }) { return nil }
    func row(_ index: Int) -> CIVector {
      CIVector(
        x: CGFloat(matrix[index * 5]),
        y: CGFloat(matrix[index * 5 + 1]),
        z: CGFloat(matrix[index * 5 + 2]),
        w: CGFloat(matrix[index * 5 + 3])
      )
    }
    rVector = row(0)
    gVector = row(1)
    bVector = row(2)
    aVector = row(3)
    biasVector = CIVector(
      x: CGFloat(matrix[4]),
      y: CGFloat(matrix[9]),
      z: CGFloat(matrix[14]),
      w: CGFloat(matrix[19])
    )
    key = matrix.map { String(format: "%.4f", $0) }.joined(separator: ",")
  }

  func apply(to image: CIImage) -> CIImage {
    let matrix = CIFilter.colorMatrix()
    matrix.inputImage = image
    matrix.rVector = rVector
    matrix.gVector = gVector
    matrix.bVector = bVector
    matrix.aVector = aVector
    matrix.biasVector = biasVector
    let clamp = CIFilter.colorClamp()
    clamp.inputImage = matrix.outputImage
    clamp.minComponents = CIVector(x: 0, y: 0, z: 0, w: 0)
    clamp.maxComponents = CIVector(x: 1, y: 1, z: 1, w: 1)
    return (clamp.outputImage ?? image).cropped(to: image.extent)
  }

  /// Photos are filtered in gamma-encoded extended sRGB, like the video paths (which filter the
  /// encoded BT.709 values), so a matrix looks the same on photos and videos.
  static let photoContext = CIContext(options: [
    .workingColorSpace: CGColorSpace(name: CGColorSpace.extendedSRGB) ?? CGColorSpaceCreateDeviceRGB(),
    .cacheIntermediates: false,
  ])

  /// Renders an upright, filtered CGImage in the source's colour space.
  static func render(_ source: CIImage, filter: MediaColorFilter, colorSpace: CGColorSpace?) -> CGImage? {
    let output = filter.apply(to: source)
    let space = colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
    return photoContext.createCGImage(output, from: source.extent, format: .RGBA8, colorSpace: space)
  }

  /// Full-resolution filtered photo for the bake (EXIF orientation applied).
  static func filteredPhoto(atPath path: String, filter: MediaColorFilter, scale: CGFloat) -> UIImage? {
    guard let source = CIImage(
      contentsOf: URL(fileURLWithPath: path),
      options: [.applyOrientationProperty: true]
    ) else { return nil }
    guard let cgImage = render(source, filter: filter, colorSpace: source.colorSpace) else { return nil }
    return UIImage(cgImage: cgImage, scale: scale, orientation: .up)
  }
}

// MARK: - Filtered photo preview

/// Shows a photo through `MediaColorFilter` (downsampled to the view size). Transparent while
/// no filter is set, so the expo-image underneath shows the original. Crossfades between
/// filters; a crossfade is also the reduced-motion treatment.
final class NixFilteredImageView: ExpoView {
  /// A plain view showing the image through `layer.contents`: a `UIImageView` here was laid out
  /// and had its image, yet was never composited inside this Fabric-mounted Expo view.
  private let imageView = UIView()
  private let renderQueue = DispatchQueue(label: "pl.nix.media-overlay.filtered-image", qos: .userInitiated)
  private var uri = ""
  private var matrix: [Double] = []
  private var needsRender = false
  private var generation = 0
  private var renderedKey: String?
  /// Downsampled source, keyed by path and pixel size. Confined to `renderQueue`.
  private var sourceCache: (key: String, image: CIImage, colorSpace: CGColorSpace?)?
  /// A few rendered filters so swiping back and forth is instant. Confined to `renderQueue`.
  private var renderedCache: [(key: String, image: UIImage)] = []

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .clear
    isUserInteractionEnabled = false
    imageView.clipsToBounds = true
    imageView.backgroundColor = .clear
    imageView.isUserInteractionEnabled = false
    imageView.layer.contentsGravity = .resizeAspectFill
    addSubview(imageView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = bounds
    if needsRender { render() }
  }

  func setUri(_ next: String) {
    guard next != uri else { return }
    uri = next
    needsRender = true
  }

  func setFilterMatrix(_ next: [Double]) {
    guard next != matrix else { return }
    matrix = next
    needsRender = true
  }

  func setContentFit(_ fit: String) {
    imageView.layer.contentsGravity = fit == "contain" ? .resizeAspect : .resizeAspectFill
  }

  func applyUpdatedProps() {
    if needsRender { render() }
  }

  private func show(_ image: UIImage?) {
    let fade = CATransition()
    fade.type = .fade
    fade.duration = 0.18
    imageView.layer.add(fade, forKey: "contents")
    imageView.layer.contentsScale = image?.scale ?? traitCollection.displayScale
    imageView.layer.contents = image?.cgImage
  }

  private func render() {
    guard bounds.width > 0, bounds.height > 0 else { return }
    needsRender = false
    generation += 1
    let token = generation
    let path = Self.filePath(from: uri)
    guard !path.isEmpty, let filter = MediaColorFilter(matrix: matrix) else {
      renderedKey = nil
      show(nil)
      return
    }
    let key = "\(path)|\(filter.key)"
    guard key != renderedKey else { return }
    let scale = traitCollection.displayScale
    let maxPixels = max(bounds.width, bounds.height) * scale * 1.25
    renderQueue.async { [weak self] in
      guard let self else { return }
      let image = self.renderedImage(path: path, filter: filter, key: key, maxPixels: maxPixels, scale: scale)
      DispatchQueue.main.async {
        guard token == self.generation else { return }
        self.renderedKey = image == nil ? nil : key
        self.show(image)
      }
    }
  }

  /// `file://` URI (possibly percent-encoded) or a plain path → filesystem path.
  static func filePath(from uri: String) -> String {
    if let url = URL(string: uri), url.isFileURL { return url.path }
    return uri.hasPrefix("file://") ? String(uri.dropFirst("file://".count)) : uri
  }

  /// Runs on `renderQueue`.
  private func renderedImage(
    path: String,
    filter: MediaColorFilter,
    key: String,
    maxPixels: CGFloat,
    scale: CGFloat
  ) -> UIImage? {
    if let cached = renderedCache.first(where: { $0.key == key }) { return cached.image }
    let sourceKey = "\(path)|\(Int(maxPixels))"
    if sourceCache?.key != sourceKey {
      sourceCache = nil
      let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: Int(maxPixels.rounded(.up)),
      ]
      if let imageSource = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
         let thumbnail = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary) {
        sourceCache = (sourceKey, CIImage(cgImage: thumbnail), thumbnail.colorSpace)
      }
    }
    guard let source = sourceCache,
          let cgImage = MediaColorFilter.render(source.image, filter: filter, colorSpace: source.colorSpace) else {
      return nil
    }
    let image = UIImage(cgImage: cgImage, scale: scale, orientation: .up)
    renderedCache.removeAll { $0.key == key }
    renderedCache.append((key, image))
    if renderedCache.count > 4 { renderedCache.removeFirst() }
    return image
  }
}

// MARK: - Delivery-profile video export (PERF-23)

struct DeliveryVideoProfile {
  /// Longest output side in pixels (never upscales).
  let maxDimension: CGFloat
  /// Average H.264 bitrate in bits per second.
  let videoBitrate: Int
  /// AAC bitrate in bits per second.
  let audioBitrate: Int
  /// Output frame-rate cap; slower sources keep their own rate.
  let maxFrameRate: Int
}

struct DeliveryVideoExportResult {
  let width: Int
  let height: Int
  let durationMs: Double
  let sizeBytes: Int64
  let hasAudio: Bool
  let frameRate: Int
}

/// Tracks running delivery exports by bake id so JS can cancel them.
///
/// Sendable invariant: `exporters` and `pendingCancels` are only touched while holding `lock`.
final class VideoBakeRegistry: @unchecked Sendable {
  private let lock = NSLock()
  private var exporters: [String: DeliveryVideoExporter] = [:]
  /// Cancels that arrived before the export registered (JS aborted while the call was in flight).
  private var pendingCancels: Set<String> = []

  /// Returns false when the bake was cancelled before it could start.
  func register(_ exporter: DeliveryVideoExporter, for bakeId: String) -> Bool {
    lock.withLock {
      if pendingCancels.remove(bakeId) != nil { return false }
      exporters[bakeId] = exporter
      return true
    }
  }

  func unregister(_ exporter: DeliveryVideoExporter, for bakeId: String) {
    lock.withLock {
      if exporters[bakeId] === exporter {
        exporters[bakeId] = nil
      }
    }
  }

  func cancel(_ bakeId: String) {
    let exporter: DeliveryVideoExporter? = lock.withLock {
      if let exporter = exporters[bakeId] { return exporter }
      if pendingCancels.count > 64 { pendingCancels.removeAll() }
      pendingCancels.insert(bakeId)
      return nil
    }
    exporter?.cancel()
  }
}

/// Re-encodes a video with a static overlay straight into the upload delivery profile.
///
/// Pipeline: `AVAssetReaderVideoCompositionOutput` (applies the track's preferred transform,
/// scales to the output size and converts to SDR BT.709) -> Core Image composites the
/// pre-rendered overlay on the GPU -> `AVAssetWriter` (H.264 + AAC). Audio is decoded to PCM and
/// re-encoded as AAC at the profile bitrate.
///
/// Sendable invariant: `cancelled` and `activeReader` are only accessed while holding `lock`.
/// Everything the pump touches (inputs, outputs, `PumpState`, `lastReportedProgress`) is
/// confined to the serial `queue`.
final class DeliveryVideoExporter: @unchecked Sendable {
  private let sourceUrl: URL
  private let targetUrl: URL
  private let profile: DeliveryVideoProfile
  private let colorFilter: MediaColorFilter?
  private let makeOverlay: (CGSize, CGFloat) -> CGImage?
  private let onProgress: (Double) -> Void

  private let lock = NSLock()
  private var cancelled = false
  private var activeReader: AVAssetReader?

  private let queue = DispatchQueue(label: "pl.nix.media-overlay.delivery-export", qos: .userInitiated)
  private var lastReportedProgress: Double = -1

  init(
    sourceUrl: URL,
    targetUrl: URL,
    profile: DeliveryVideoProfile,
    colorFilter: MediaColorFilter? = nil,
    makeOverlay: @escaping (CGSize, CGFloat) -> CGImage?,
    onProgress: @escaping (Double) -> Void
  ) {
    self.sourceUrl = sourceUrl
    self.targetUrl = targetUrl
    self.profile = profile
    self.colorFilter = colorFilter
    self.makeOverlay = makeOverlay
    self.onProgress = onProgress
  }

  var isCancelled: Bool {
    lock.withLock { cancelled }
  }

  /// Safe from any thread. Stops reading; the pump then cancels the writer on its own queue so
  /// `cancelWriting()` never races an append.
  func cancel() {
    let reader: AVAssetReader? = lock.withLock {
      cancelled = true
      return activeReader
    }
    if reader?.status == .reading {
      reader?.cancelReading()
    }
  }

  func export() async throws -> DeliveryVideoExportResult {
    do {
      return try await withTaskCancellationHandler {
        try await runExport()
      } onCancel: {
        cancel()
      }
    } catch {
      try? FileManager.default.removeItem(at: targetUrl)
      throw error
    }
  }

  private func checkCancelled() throws {
    if isCancelled { throw CancellationError() }
  }

  fileprivate static func failure(_ code: Int, _ message: String) -> NSError {
    NSError(domain: "NixMediaOverlay.DeliveryExport", code: code, userInfo: [
      NSLocalizedDescriptionKey: message,
    ])
  }

  private static func evenPixels(_ value: CGFloat) -> Int {
    max(2, Int((value / 2).rounded()) * 2)
  }

  // swiftlint:disable:next function_body_length
  private func runExport() async throws -> DeliveryVideoExportResult {
    let asset = AVURLAsset(url: sourceUrl, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    let duration = try await asset.load(.duration)
    guard duration.isNumeric, duration.seconds > 0 else {
      throw Self.failure(1, "Video has an invalid duration")
    }
    guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
      throw Self.failure(2, "Video has no video track")
    }
    let (naturalSize, preferredTransform, nominalFrameRate) = try await videoTrack.load(
      .naturalSize,
      .preferredTransform,
      .nominalFrameRate
    )
    let audioTrack = try await asset.loadTracks(withMediaType: .audio).first
    let audioFormat = try await audioTrack?.load(.formatDescriptions).first
    try checkCancelled()

    // Geometry: display-oriented size (as the legacy bake), then scaled to the profile.
    let orientedRect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
    let displaySize = CGSize(width: orientedRect.width.rounded(), height: orientedRect.height.rounded())
    guard displaySize.width > 0, displaySize.height > 0 else {
      throw Self.failure(3, "Invalid video render size")
    }
    let scale = min(1, profile.maxDimension / max(displaySize.width, displaySize.height))
    let outputWidth = Self.evenPixels(displaySize.width * scale)
    let outputHeight = Self.evenPixels(displaySize.height * scale)
    let outputSize = CGSize(width: outputWidth, height: outputHeight)
    // Normalise the translation (some files ship a rotation without it), then scale.
    let layerTransform = preferredTransform
      .concatenating(CGAffineTransform(translationX: -orientedRect.minX, y: -orientedRect.minY))
      .concatenating(CGAffineTransform(
        scaleX: outputSize.width / displaySize.width,
        y: outputSize.height / displaySize.height
      ))

    let sourceFps = nominalFrameRate > 0 ? Double(nominalFrameRate).rounded() : 30
    let frameRate = Int(max(1, min(Double(max(1, profile.maxFrameRate)), sourceFps)))

    // Overlay rendered once, at output resolution, in display coordinates.
    let overlay: CIImage? = makeOverlay(displaySize, outputSize.width / displaySize.width).map { cgImage in
      CIImage(cgImage: cgImage).transformed(by: CGAffineTransform(
        scaleX: outputSize.width / CGFloat(cgImage.width),
        y: outputSize.height / CGFloat(cgImage.height)
      ))
    }

    // Reader: composition output gives oriented, scaled, SDR BT.709 BGRA frames.
    let reader = try AVAssetReader(asset: asset)
    let composition = AVMutableVideoComposition()
    composition.renderSize = outputSize
    composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(frameRate))
    composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
    composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
    composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    layerInstruction.setTransform(layerTransform, at: .zero)
    instruction.layerInstructions = [layerInstruction]
    composition.instructions = [instruction]

    let pixelAttributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ]
    let videoOutput = AVAssetReaderVideoCompositionOutput(
      videoTracks: [videoTrack],
      videoSettings: pixelAttributes
    )
    videoOutput.videoComposition = composition
    videoOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(videoOutput) else {
      throw Self.failure(4, "Cannot read video frames")
    }
    reader.add(videoOutput)

    // Writer.
    try? FileManager.default.removeItem(at: targetUrl)
    try FileManager.default.createDirectory(
      at: targetUrl.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    let writer = try AVAssetWriter(outputURL: targetUrl, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: outputWidth,
      AVVideoHeightKey: outputHeight,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: profile.videoBitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
        AVVideoExpectedSourceFrameRateKey: frameRate,
        AVVideoMaxKeyFrameIntervalKey: frameRate * 2,
        AVVideoMaxKeyFrameIntervalDurationKey: 2,
      ] as [String: Any],
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
    ]
    // `AVAssetWriterInput` raises an Objective-C exception on unsupported settings; check first.
    guard writer.canApply(outputSettings: videoSettings, forMediaType: .video) else {
      throw Self.failure(5, "Unsupported video encoder settings")
    }
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    videoInput.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: videoInput,
      sourcePixelBufferAttributes: pixelAttributes.merging([
        kCVPixelBufferWidthKey as String: outputWidth,
        kCVPixelBufferHeightKey as String: outputHeight,
      ]) { current, _ in current }
    )
    guard writer.canAdd(videoInput) else {
      throw Self.failure(6, "Cannot add video encoder")
    }
    writer.add(videoInput)

    var audioPipe: (output: AVAssetReaderTrackOutput, input: AVAssetWriterInput)?
    if let audioTrack {
      var sampleRate: Double = 48_000
      var channels = 2
      if let audioFormat,
         let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(audioFormat)?.pointee {
        if asbd.mSampleRate == 44_100 { sampleRate = 44_100 }
        if asbd.mChannelsPerFrame == 1 { channels = 1 }
      }
      var layout = AudioChannelLayout()
      layout.mChannelLayoutTag = channels == 1 ? kAudioChannelLayoutTag_Mono : kAudioChannelLayoutTag_Stereo
      let layoutData = Data(bytes: &layout, count: MemoryLayout<AudioChannelLayout>.size)

      // Decode (and down-mix multichannel / spatial audio) to interleaved 16-bit PCM.
      let pcmSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
        AVChannelLayoutKey: layoutData,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false,
      ]
      let aacSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
        AVChannelLayoutKey: layoutData,
        AVEncoderBitRateKey: profile.audioBitrate,
      ]
      let audioOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: pcmSettings)
      audioOutput.alwaysCopiesSampleData = false
      guard reader.canAdd(audioOutput),
            writer.canApply(outputSettings: aacSettings, forMediaType: .audio) else {
        throw Self.failure(7, "Unsupported audio settings")
      }
      reader.add(audioOutput)
      let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: aacSettings)
      audioInput.expectsMediaDataInRealTime = false
      guard writer.canAdd(audioInput) else {
        throw Self.failure(8, "Cannot add audio encoder")
      }
      writer.add(audioInput)
      audioPipe = (audioOutput, audioInput)
    }

    let shouldStart: Bool = lock.withLock {
      guard !cancelled else { return false }
      activeReader = reader
      return true
    }
    guard shouldStart else { throw CancellationError() }
    defer { lock.withLock { activeReader = nil } }

    guard reader.startReading() else {
      throw reader.error ?? Self.failure(9, "Could not start reading video")
    }
    guard writer.startWriting() else {
      reader.cancelReading()
      throw writer.error ?? Self.failure(10, "Could not start writing video")
    }
    writer.startSession(atSourceTime: .zero)

    let ciContext = CIContext(options: [
      .workingColorSpace: NSNull(),
      .outputColorSpace: NSNull(),
      .cacheIntermediates: false,
    ])
    let durationSeconds = duration.seconds
    let colorFilter = self.colorFilter

    try await pump(
      reader: reader,
      writer: writer,
      videoOutput: videoOutput,
      adaptor: adaptor,
      audioPipe: audioPipe
    ) { [self] sample in
      let time = CMSampleBufferGetPresentationTimeStamp(sample)
      guard let source = CMSampleBufferGetImageBuffer(sample) else { return }
      var frame = source
      if overlay != nil || colorFilter != nil {
        guard let pool = adaptor.pixelBufferPool else {
          throw Self.failure(11, "Encoder pixel buffer pool unavailable")
        }
        var composed: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &composed)
        guard status == kCVReturnSuccess, let composed else {
          throw Self.failure(12, "Could not allocate frame buffer (\(status))")
        }
        // Filter the (encoded BT.709) frame first, then the overlay on top, unfiltered.
        var image = CIImage(cvPixelBuffer: source)
        if let colorFilter { image = colorFilter.apply(to: image) }
        if let overlay { image = overlay.composited(over: image) }
        ciContext.render(
          image,
          to: composed,
          bounds: CGRect(origin: .zero, size: outputSize),
          colorSpace: nil
        )
        frame = composed
      }
      guard adaptor.append(frame, withPresentationTime: time) else {
        throw writer.error ?? Self.failure(13, "Could not append video frame")
      }
      if time.isNumeric {
        reportProgress(min(0.99, max(0, time.seconds / durationSeconds)))
      }
    }

    onProgress(1)
    let attributes = try? FileManager.default.attributesOfItem(atPath: targetUrl.path)
    let sizeBytes = (attributes?[.size] as? NSNumber)?.int64Value ?? 0
    return DeliveryVideoExportResult(
      width: outputWidth,
      height: outputHeight,
      durationMs: duration.seconds * 1000,
      sizeBytes: sizeBytes,
      hasAudio: audioPipe != nil,
      frameRate: frameRate
    )
  }

  /// Must be called on `queue`. Throttled to ~2% steps.
  private func reportProgress(_ progress: Double) {
    guard progress - lastReportedProgress >= 0.02 else { return }
    lastReportedProgress = progress
    onProgress(progress)
  }

  /// Feeds both writer inputs from the reader on the serial `queue`, then finishes or cancels the
  /// writer there. Resumes once the file is complete (or throws on failure / cancellation).
  private func pump(
    reader: AVAssetReader,
    writer: AVAssetWriter,
    videoOutput: AVAssetReaderOutput,
    adaptor: AVAssetWriterInputPixelBufferAdaptor,
    audioPipe: (output: AVAssetReaderTrackOutput, input: AVAssetWriterInput)?,
    appendVideo: @escaping (CMSampleBuffer) throws -> Void
  ) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      let context = PumpContext(
        exporter: self,
        reader: reader,
        writer: writer,
        videoOutput: videoOutput,
        videoInput: adaptor.assetWriterInput,
        audioOutput: audioPipe?.output,
        audioInput: audioPipe?.input,
        appendVideo: appendVideo,
        continuation: continuation
      )
      context.start(on: queue)
    }
  }

  /// State of one reader -> writer pump.
  ///
  /// Sendable invariant: after `start(on:)` every member is only touched from blocks running on
  /// the exporter's serial queue (both `requestMediaDataWhenReady` callbacks use it), except
  /// `reader.cancelReading()`, which AVFoundation allows from any thread.
  private final class PumpContext: @unchecked Sendable {
    private let exporter: DeliveryVideoExporter
    private let reader: AVAssetReader
    private let writer: AVAssetWriter
    private let videoOutput: AVAssetReaderOutput
    private let videoInput: AVAssetWriterInput
    private let audioOutput: AVAssetReaderOutput?
    private let audioInput: AVAssetWriterInput?
    private let appendVideo: (CMSampleBuffer) throws -> Void
    private let continuation: CheckedContinuation<Void, Error>

    private var pending: Int
    private var failure: Error?
    private var videoDone = false
    private var audioDone = false

    init(
      exporter: DeliveryVideoExporter,
      reader: AVAssetReader,
      writer: AVAssetWriter,
      videoOutput: AVAssetReaderOutput,
      videoInput: AVAssetWriterInput,
      audioOutput: AVAssetReaderOutput?,
      audioInput: AVAssetWriterInput?,
      appendVideo: @escaping (CMSampleBuffer) throws -> Void,
      continuation: CheckedContinuation<Void, Error>
    ) {
      self.exporter = exporter
      self.reader = reader
      self.writer = writer
      self.videoOutput = videoOutput
      self.videoInput = videoInput
      self.audioOutput = audioOutput
      self.audioInput = audioInput
      self.appendVideo = appendVideo
      self.continuation = continuation
      self.pending = audioInput == nil ? 1 : 2
    }

    func start(on queue: DispatchQueue) {
      videoInput.requestMediaDataWhenReady(on: queue) { [self] in
        pumpVideo()
      }
      if let audioInput {
        audioInput.requestMediaDataWhenReady(on: queue) { [self] in
          pumpAudio()
        }
      }
    }

    private var canRead: Bool {
      !exporter.isCancelled && failure == nil && reader.status == .reading
    }

    private func pumpVideo() {
      guard !videoDone else { return }
      while videoInput.isReadyForMoreMediaData {
        guard canRead, let sample = videoOutput.copyNextSampleBuffer() else {
          finishVideo()
          return
        }
        do {
          try appendVideo(sample)
        } catch {
          fail(error)
          finishVideo()
          return
        }
      }
      // A failed writer stops asking for data; finish instead of waiting forever.
      if writer.status == .failed {
        fail(writer.error ?? DeliveryVideoExporter.failure(17, "Video encoder failed"))
        finishVideo()
      }
    }

    private func pumpAudio() {
      guard !audioDone, let audioInput, let audioOutput else { return }
      while audioInput.isReadyForMoreMediaData {
        guard canRead, let sample = audioOutput.copyNextSampleBuffer() else {
          finishAudio()
          return
        }
        if !audioInput.append(sample) {
          fail(writer.error ?? DeliveryVideoExporter.failure(16, "Could not append audio"))
          finishAudio()
          return
        }
      }
      if writer.status == .failed {
        fail(writer.error ?? DeliveryVideoExporter.failure(18, "Audio encoder failed"))
        finishAudio()
      }
    }

    private func fail(_ error: Error) {
      if failure == nil { failure = error }
      if reader.status == .reading { reader.cancelReading() }
    }

    private func finishVideo() {
      videoDone = true
      finishInput(videoInput)
    }

    private func finishAudio() {
      guard let audioInput else { return }
      audioDone = true
      finishInput(audioInput)
    }

    /// Each input finishes exactly once; the last one completes the export.
    private func finishInput(_ input: AVAssetWriterInput) {
      if writer.status == .writing { input.markAsFinished() }
      pending -= 1
      if pending == 0 { finishAll() }
    }

    private func finishAll() {
      let cancelled = exporter.isCancelled
      if cancelled || failure != nil || reader.status == .failed || writer.status == .failed {
        let error: Error = cancelled
          ? CancellationError()
          : failure ?? reader.error ?? writer.error
            ?? DeliveryVideoExporter.failure(14, "Video export failed")
        if reader.status == .reading { reader.cancelReading() }
        if writer.status == .writing { writer.cancelWriting() }
        continuation.resume(throwing: error)
        return
      }
      writer.finishWriting { [self] in
        if writer.status == .completed {
          continuation.resume()
        } else {
          continuation.resume(
            throwing: writer.error ?? DeliveryVideoExporter.failure(15, "Video writing failed")
          )
        }
      }
    }
  }
}
