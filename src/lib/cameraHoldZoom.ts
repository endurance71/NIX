/** Pixels of vertical drag mapped to full zoom range 0→1 (Snapchat-style hold zoom). */
export const HOLD_ZOOM_GAIN = 1 / 560;

/**
 * Apply vertical finger movement to normalized camera zoom.
 * Up (changeY < 0) increases zoom; down decreases. Result is clamped to [0, 1].
 * Marked worklet so Reanimated gesture handlers can call it on the UI thread.
 */
export function applyHoldZoomDelta(
  current: number,
  changeY: number,
  gain: number = HOLD_ZOOM_GAIN
): number {
  'worklet';
  return Math.max(0, Math.min(1, current - changeY * gain));
}
