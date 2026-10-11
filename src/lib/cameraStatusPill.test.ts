import { describe, expect, it } from 'vitest';
import { CAPTURE_STATUS_MIN_VISIBLE_MS, captureStatusVisibleMs } from './cameraStatusPill';

describe('captureStatusVisibleMs', () => {
  it('keeps short messages for about three seconds', () => {
    expect(captureStatusVisibleMs('Camera is not ready.')).toBe(CAPTURE_STATUS_MIN_VISIBLE_MS);
  });

  it('gives long messages more reading time, capped', () => {
    expect(captureStatusVisibleMs('x'.repeat(100))).toBe(CAPTURE_STATUS_MIN_VISIBLE_MS + 50 * 40);
    expect(captureStatusVisibleMs('x'.repeat(1000))).toBe(7000);
  });
});
