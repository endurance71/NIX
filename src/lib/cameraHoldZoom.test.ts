import { describe, expect, it } from 'vitest';
import { HOLD_ZOOM_GAIN, applyHoldZoomDelta } from './cameraHoldZoom';

describe('applyHoldZoomDelta', () => {
  it('increases zoom when finger moves up (negative changeY)', () => {
    expect(applyHoldZoomDelta(0.2, -56, HOLD_ZOOM_GAIN)).toBeCloseTo(0.3, 5);
  });

  it('decreases zoom when finger moves down (positive changeY)', () => {
    expect(applyHoldZoomDelta(0.5, 56, HOLD_ZOOM_GAIN)).toBeCloseTo(0.4, 5);
  });

  it('clamps to 0 and 1', () => {
    expect(applyHoldZoomDelta(0.05, 200, HOLD_ZOOM_GAIN)).toBe(0);
    expect(applyHoldZoomDelta(0.95, -200, HOLD_ZOOM_GAIN)).toBe(1);
  });

  it('is a no-op when changeY is 0', () => {
    expect(applyHoldZoomDelta(0.42, 0, HOLD_ZOOM_GAIN)).toBe(0.42);
  });
});
