import { describe, expect, it, vi } from 'vitest';
import { needsUprightRotation, uprightCaptureOrientation } from './uprightCapture';

vi.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

describe('uprightCapture', () => {
  it('rotates only upside-down portrait captures', () => {
    expect(needsUprightRotation('portraitUpsideDown')).toBe(true);
    expect(needsUprightRotation('portrait')).toBe(false);
    expect(needsUprightRotation('landscapeLeft')).toBe(false);
    expect(needsUprightRotation(null)).toBe(false);
  });

  it('keeps landscape and reports a rotated capture as portrait', () => {
    expect(uprightCaptureOrientation('portraitUpsideDown')).toBe('portrait');
    expect(uprightCaptureOrientation('landscapeRight')).toBe('landscapeRight');
    expect(uprightCaptureOrientation(null)).toBeUndefined();
  });
});
