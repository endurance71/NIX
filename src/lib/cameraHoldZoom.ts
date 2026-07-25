/** Pixels of vertical drag mapped to full zoom range 0→1 (Snapchat-style hold zoom). */
export const HOLD_ZOOM_GAIN = 1 / 560;

/**
 * Apply vertical finger movement to normalized camera zoom.
 * Up (changeY < 0) increases zoom; down decreases. Result is clamped to [0, 1].
 *
 * Pure JS helper for tests / non-UI callers. Do **not** call this from RNGH/Reanimated
 * worklets — with `workletsBundleMode` a cross-file `'worklet'` callee still throws
 * "non-worklet on UI thread" and aborts Hermes (TF crash on hold-drag zoom while REC).
 * Inline the same formula inside the gesture worklet instead.
 */
export function applyHoldZoomDelta(
  current: number,
  changeY: number,
  gain: number = HOLD_ZOOM_GAIN
): number {
  return Math.max(0, Math.min(1, current - changeY * gain));
}
