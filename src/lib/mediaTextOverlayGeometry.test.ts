import { describe, expect, it } from 'vitest';
import {
  clampPreviewTextTopPx,
  mapCoverFontSizeToMedia,
  mapCoverNormalizedYToMediaY,
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
      barColor: '#0000008C',
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
  it('maps y across full height when media is wider than viewport (horizontal crop)', () => {
    // 16:9 media in 9:16 viewport → cover uses full media height
    const y = mapCoverNormalizedYToMediaY({
      mediaWidth: 1920,
      mediaHeight: 1080,
      viewportWidth: 390,
      viewportHeight: 844,
      normalizedY: 0.5,
    });
    expect(y).toBeCloseTo(540, 5);
  });

  it('maps y into the vertically cropped visible band when media is taller', () => {
    // 9:16 media in a slightly shorter viewport aspect (square-ish) → vertical crop
    const mediaWidth = 1080;
    const mediaHeight = 1920;
    const viewportWidth = 390;
    const viewportHeight = 390;
    const y = mapCoverNormalizedYToMediaY({
      mediaWidth,
      mediaHeight,
      viewportWidth,
      viewportHeight,
      normalizedY: 0,
    });
    const scale = mediaWidth / viewportWidth;
    const visibleHeight = viewportHeight * scale;
    const visibleTop = (mediaHeight - visibleHeight) / 2;
    expect(y).toBeCloseTo(visibleTop, 5);
  });

  it('scales font size with cover scale', () => {
    const font = mapCoverFontSizeToMedia({
      mediaWidth: 1080,
      mediaHeight: 1920,
      viewportWidth: 390,
      viewportHeight: 844,
      fontSizePoints: 36,
    });
    expect(font).toBeGreaterThan(36);
  });

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
