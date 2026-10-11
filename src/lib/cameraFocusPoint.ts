/**
 * Tap-to-focus geometry. The native module converts window points with the live preview layer
 * (`captureDevicePointConverted`); this is the fallback it uses when no preview layer is found, and
 * the reference for where the focus square is drawn.
 */

/** Portrait width / height of the 1920x1080 session the camera runs (CAMERA_CAPTURE_PROFILE). */
export const CAMERA_PREVIEW_PORTRAIT_ASPECT = 1080 / 1920;

/** Side of the focus square in points. */
export const FOCUS_INDICATOR_SIZE = 80;

export type FocusViewPointInput = {
  /** Tap position inside the preview view, in points. */
  x: number;
  y: number;
  viewWidth: number;
  viewHeight: number;
  /** Preview is mirrored (front camera with `mirror`). */
  mirrored: boolean;
  /** Portrait content width / height; defaults to the 16:9 session. */
  contentAspect?: number;
};

export type DevicePoint = { x: number; y: number };

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/**
 * View point → AVCaptureDevice point of interest for a portrait UI with an aspect-fill preview.
 * Device space is the sensor's landscape-right frame: (0,0) top-left, (1,1) bottom-right with the
 * home side on the right, so portrait x/y swap and the horizontal axis flips (not when mirrored).
 */
export function viewPointToDevicePoint({
  x,
  y,
  viewWidth,
  viewHeight,
  mirrored,
  contentAspect = CAMERA_PREVIEW_PORTRAIT_ASPECT,
}: FocusViewPointInput): DevicePoint {
  if (!(viewWidth > 0) || !(viewHeight > 0) || !(contentAspect > 0)) {
    return { x: 0.5, y: 0.5 };
  }

  // Aspect fill: the content covers the view and the overflow is cropped evenly on both sides.
  const viewAspect = viewWidth / viewHeight;
  let contentWidth = viewWidth;
  let contentHeight = viewHeight;
  if (viewAspect > contentAspect) {
    contentHeight = viewWidth / contentAspect;
  } else {
    contentWidth = viewHeight * contentAspect;
  }
  const offsetX = (contentWidth - viewWidth) / 2;
  const offsetY = (contentHeight - viewHeight) / 2;

  let contentX = clamp01((x + offsetX) / contentWidth);
  const contentY = clamp01((y + offsetY) / contentHeight);
  if (mirrored) contentX = 1 - contentX;

  return { x: contentY, y: clamp01(1 - contentX) };
}

/** Top-left of the focus square so it stays centred on the tap and fully on screen. */
export function focusIndicatorOrigin(
  x: number,
  y: number,
  viewWidth: number,
  viewHeight: number,
  size = FOCUS_INDICATOR_SIZE
): { left: number; top: number } {
  const half = size / 2;
  const left = Math.min(Math.max(x - half, 0), Math.max(0, viewWidth - size));
  const top = Math.min(Math.max(y - half, 0), Math.max(0, viewHeight - size));
  return { left, top };
}
