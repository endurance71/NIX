import { describe, expect, it } from 'vitest';
import {
  captionTopPxFromY,
  captionYFromTopPx,
  clampPreviewTextTopPx,
  previewTextTopAboveObstacle,
} from './mediaTextOverlayGeometry';
import {
  clampOverlayY,
  createDefaultMediaTextOverlay,
  normalizeMediaTextOverlay,
} from '../types/mediaTextOverlay';

describe('mediaTextOverlay model', () => {
  it('clamps y into 0–1', () => {
    expect(clampOverlayY(-1)).toBe(0);
    expect(clampOverlayY(2)).toBe(1);
    expect(clampOverlayY(0.42)).toBe(0.42);
  });

  it('normalizes empty text to null', () => {
    expect(normalizeMediaTextOverlay(createDefaultMediaTextOverlay('   '))).toBeNull();
  });

  it('trims and keeps valid overlay', () => {
    expect(
      normalizeMediaTextOverlay({
        text: '  hello  ',
        y: 0.25,
        fontSize: 36,
      })
    ).toEqual({
      text: 'hello',
      y: 0.25,
      fontSize: 36,
      textColor: '#000000',
      barColor: '#FFFFFF8C',
      bold: true,
      italic: false,
      underline: false,
      strikethrough: false,
      monospace: false,
      fontDesign: 'system',
      preset: 'title',
      align: 'center',
    });
  });
});

describe('mediaTextOverlayGeometry', () => {
  it('clamps preview text top into the editable band', () => {
    expect(clampPreviewTextTopPx(40, 100, 500)).toBe(100);
    expect(clampPreviewTextTopPx(640, 100, 500)).toBe(500);
    expect(clampPreviewTextTopPx(240, 100, 500)).toBe(240);
  });

  it('parks preview text above keyboard or sheet obstacle', () => {
    expect(
      previewTextTopAboveObstacle({
        windowHeight: 844,
        obstacleHeight: 336,
        minTopPx: 100,
        maxTopPx: 620,
        stickerReservePx: 118,
        gapPx: 32,
      })
    ).toBe(358);
  });

  it('does not park preview text outside max top when obstacle is gone', () => {
    expect(
      previewTextTopAboveObstacle({
        windowHeight: 844,
        obstacleHeight: 0,
        minTopPx: 100,
        maxTopPx: 620,
        stickerReservePx: 118,
        gapPx: 32,
      })
    ).toBe(620);
  });
});

describe('caption position mapping (preview ↔ native bake)', () => {
  const frame = { top: 0, height: 874 };
  it('treats y as the bar centre within the media frame, like the native bake', () => {
    // Native: centerY = visible.minY + visible.height * y
    expect(captionTopPxFromY(0.5, frame, 44) + 22).toBe(437);
    expect(captionYFromTopPx(415, frame, 44)).toBeCloseTo(0.5);
  });
  it('round-trips for a letterboxed frame', () => {
    const letterbox = { top: 230, height: 300 };
    const y = captionYFromTopPx(300, letterbox, 60);
    expect(captionTopPxFromY(y, letterbox, 60)).toBeCloseTo(300);
    expect(y).toBeCloseTo((300 + 30 - 230) / 300);
  });
  it('places the baked bar exactly where the preview bar was', () => {
    const top = 400;
    const y = captionYFromTopPx(top, frame, 44);
    expect(frame.top + frame.height * y - 22).toBeCloseTo(top);
  });
});
