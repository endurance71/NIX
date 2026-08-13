import ExpoModulesCore
import PencilKit
import UIKit

final class NixDrawingCanvasView: ExpoView, PKCanvasViewDelegate {
  let onUndoStateChange = EventDispatcher()

  private let canvasView = PKCanvasView(frame: .zero)
  private let toolPicker = PKToolPicker()
  private var drawingData: String?
  private var referenceWidth: CGFloat = 0
  private var referenceHeight: CGFloat = 0
  private var appliedPayloadKey: String?
  private var needsDrawingApply = true
  private var previousCanvasSize: CGSize = .zero
  private var editing = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .clear

    canvasView.backgroundColor = .clear
    canvasView.isOpaque = false
    canvasView.delegate = self
    canvasView.drawingPolicy = .anyInput
    canvasView.isScrollEnabled = false
    canvasView.alwaysBounceHorizontal = false
    canvasView.alwaysBounceVertical = false
    canvasView.contentInsetAdjustmentBehavior = .never
    canvasView.tool = PKInkingTool(.pen, color: .systemRed, width: 5)
    addSubview(canvasView)
    updateInteractionState()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    canvasView.frame = bounds
    guard bounds.width > 0, bounds.height > 0 else { return }

    if needsDrawingApply {
      applyDrawingPayload(force: true)
    } else if previousCanvasSize != .zero && previousCanvasSize != bounds.size {
      let scaleX = bounds.width / previousCanvasSize.width
      let scaleY = bounds.height / previousCanvasSize.height
      canvasView.drawing = canvasView.drawing.transformed(using:
        CGAffineTransform(scaleX: scaleX, y: scaleY)
      )
      canvasView.undoManager?.removeAllActions()
      emitUndoState()
    }
    previousCanvasSize = bounds.size
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateToolPickerVisibility()
  }

  func setDrawingData(_ data: String?) {
    drawingData = data
    markDrawingPayloadDirty()
  }

  func setReferenceWidth(_ width: Double) {
    referenceWidth = CGFloat(width)
    markDrawingPayloadDirty()
  }

  func setReferenceHeight(_ height: Double) {
    referenceHeight = CGFloat(height)
    markDrawingPayloadDirty()
  }

  func applyUpdatedProps() {
    applyDrawingPayload(force: false)
  }

  func setEditing(_ next: Bool) {
    guard editing != next else { return }
    editing = next
    updateInteractionState()
    updateToolPickerVisibility()
    emitUndoState()
  }

  func replaceDrawing(data: String?, width: Double, height: Double) {
    drawingData = data
    referenceWidth = CGFloat(width)
    referenceHeight = CGFloat(height)
    appliedPayloadKey = nil
    needsDrawingApply = true
    applyDrawingPayload(force: true)
  }

  func exportDrawing() -> [String: Any]? {
    guard !canvasView.drawing.strokes.isEmpty, bounds.width > 0, bounds.height > 0 else {
      return nil
    }
    return [
      "data": canvasView.drawing.dataRepresentation().base64EncodedString(),
      "width": Double(bounds.width),
      "height": Double(bounds.height),
    ]
  }

  func undoDrawing() {
    canvasView.undoManager?.undo()
    emitUndoState()
  }

  func redoDrawing() {
    canvasView.undoManager?.redo()
    emitUndoState()
  }

  func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
    emitUndoState()
  }

  private func applyDrawingPayload(force: Bool) {
    guard force || needsDrawingApply else { return }
    guard bounds.width > 0, bounds.height > 0 else {
      needsDrawingApply = true
      return
    }

    let loaded: PKDrawing
    if let drawingData,
       let data = Data(base64Encoded: drawingData),
       let drawing = try? PKDrawing(data: data) {
      loaded = drawing
    } else {
      loaded = PKDrawing()
    }

    if referenceWidth > 0 && referenceHeight > 0 {
      let scaleX = bounds.width / referenceWidth
      let scaleY = bounds.height / referenceHeight
      canvasView.drawing = loaded.transformed(
        using: CGAffineTransform(scaleX: scaleX, y: scaleY)
      )
    } else {
      canvasView.drawing = loaded
    }

    previousCanvasSize = bounds.size
    needsDrawingApply = false
    canvasView.undoManager?.removeAllActions()
    emitUndoState()
  }

  private func markDrawingPayloadDirty() {
    let key = "\(drawingData ?? ""):\(referenceWidth):\(referenceHeight)"
    guard key != appliedPayloadKey else { return }
    appliedPayloadKey = key
    needsDrawingApply = true
  }

  private func updateInteractionState() {
    isUserInteractionEnabled = editing
    canvasView.isUserInteractionEnabled = editing
    canvasView.drawingGestureRecognizer.isEnabled = editing
  }

  private func updateToolPickerVisibility() {
    guard window != nil else { return }
    if editing {
      toolPicker.addObserver(canvasView)
      toolPicker.setVisible(true, forFirstResponder: canvasView)
      DispatchQueue.main.async { [weak self] in
        self?.canvasView.becomeFirstResponder()
      }
    } else {
      toolPicker.setVisible(false, forFirstResponder: canvasView)
      toolPicker.removeObserver(canvasView)
      canvasView.resignFirstResponder()
    }
  }

  private func emitUndoState() {
    onUndoStateChange([
      "canUndo": canvasView.undoManager?.canUndo ?? false,
      "canRedo": canvasView.undoManager?.canRedo ?? false,
    ])
  }
}
