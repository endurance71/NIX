import { describe, expect, it } from 'vitest';
import { scannedCodeFrame, viewfinderRect } from './qrScanFrame';

describe('scannedCodeFrame', () => {
  it('pads the corner bounding box', () => {
    expect(
      scannedCodeFrame({
        cornerPoints: [
          { x: 100, y: 200 },
          { x: 200, y: 205 },
          { x: 195, y: 300 },
          { x: 98, y: 296 },
        ],
        viewWidth: 400,
        viewHeight: 800,
        padding: 10,
      }),
    ).toEqual({ x: 88, y: 190, width: 122, height: 120 });
  });

  it('falls back to bounds and clamps to the view', () => {
    expect(
      scannedCodeFrame({
        bounds: { origin: { x: 5, y: 5 }, size: { width: 50, height: 50 } },
        viewWidth: 400,
        viewHeight: 800,
        padding: 10,
      }),
    ).toEqual({ x: 0, y: 0, width: 65, height: 65 });
  });

  it('returns null without usable data', () => {
    expect(scannedCodeFrame({ cornerPoints: [], viewWidth: 400, viewHeight: 800 })).toBeNull();
    expect(
      scannedCodeFrame({ cornerPoints: [{ x: 1, y: 1 }], viewWidth: 400, viewHeight: 800 }),
    ).toBeNull();
    expect(
      scannedCodeFrame({
        cornerPoints: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
        viewWidth: 0,
        viewHeight: 800,
      }),
    ).toBeNull();
  });
});

describe('viewfinderRect', () => {
  it('is a centred square', () => {
    const rect = viewfinderRect(390, 844);
    expect(rect.width).toBe(rect.height);
    expect(rect.x).toBeCloseTo((390 - rect.width) / 2);
    expect(rect.width).toBeLessThanOrEqual(300);
  });
});
