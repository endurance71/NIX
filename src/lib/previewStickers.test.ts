import { describe, expect, it } from 'vitest';
import {
  CURATED_STICKER_EMOJI,
  applyStickerGesture,
  canAddSticker,
  clampLiveStickerScale,
  createEmojiSticker,
  extractFirstEmoji,
  isFingerOverTrash,
  stickerTrashCenter,
  toNativeStickers,
} from './previewStickers';
import {
  MAX_EMOJI_STICKERS,
  normalizeMediaEmojiSticker,
  normalizeMediaEmojiStickers,
  normalizeStickerRotation,
  type MediaEmojiSticker,
} from '../types/mediaStickerOverlay';
import {
  hasMediaDrawingStrokes,
  normalizeMediaDrawingOverlay,
  withDrawingFilter,
  withDrawingStickers,
  withDrawingStrokes,
} from '../types/mediaDrawingOverlay';
import { hasPreviewEdits } from './previewEdits';

const sticker: MediaEmojiSticker = {
  id: 's1',
  emoji: '🔥',
  x: 0.5,
  y: 0.5,
  fontSize: 72,
  rotation: 0,
};

describe('emoji picker', () => {
  it('has ~60 unique curated emoji', () => {
    expect(CURATED_STICKER_EMOJI.length).toBe(60);
    expect(new Set(CURATED_STICKER_EMOJI).size).toBe(60);
    for (const emoji of CURATED_STICKER_EMOJI) {
      expect(extractFirstEmoji(emoji)).toBe(emoji);
    }
  });

  it('extracts whole emoji sequences from typed text', () => {
    expect(extractFirstEmoji('hej 😀 ok')).toBe('😀');
    expect(extractFirstEmoji('👍🏽')).toBe('👍🏽');
    expect(extractFirstEmoji('👨‍👩‍👧‍👦!')).toBe('👨‍👩‍👧‍👦');
    expect(extractFirstEmoji('🇵🇱')).toBe('🇵🇱');
    expect(extractFirstEmoji('❤️')).toBe('❤️');
    expect(extractFirstEmoji('abc 123')).toBeNull();
    expect(extractFirstEmoji('')).toBeNull();
  });
});

describe('sticker transforms', () => {
  it('creates new stickers near the centre, fanned out', () => {
    const first = createEmojiSticker('😀', [], 'a');
    const second = createEmojiSticker('😀', [first], 'b');
    expect(first).toMatchObject({ id: 'a', x: 0.5, fontSize: 72, rotation: 0 });
    expect(second.y).not.toBe(first.y);
  });

  it('applies pan in stage points, pinch and rotation', () => {
    const next = applyStickerGesture(
      sticker,
      { translationX: 39, translationY: -84.4, scale: 2, rotation: Math.PI / 2 },
      { width: 390, height: 844 },
    );
    expect(next.x).toBeCloseTo(0.6);
    expect(next.y).toBeCloseTo(0.4);
    expect(next.fontSize).toBe(144);
    expect(next.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('clamps position, size and wraps rotation', () => {
    const next = applyStickerGesture(
      sticker,
      { translationX: 10_000, translationY: -10_000, scale: 100, rotation: 3 * Math.PI },
      { width: 390, height: 844 },
    );
    expect(next.x).toBe(1);
    expect(next.y).toBe(0);
    expect(next.fontSize).toBe(280);
    expect(Math.abs(next.rotation)).toBeCloseTo(Math.PI);
    expect(clampLiveStickerScale(72, 0.01)).toBeCloseTo(24 / 72);
    expect(clampLiveStickerScale(72, 10)).toBeCloseTo(280 / 72);
    expect(normalizeStickerRotation(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
  });

  it('detects the finger over the trash at the bottom centre', () => {
    const trash = stickerTrashCenter({ width: 390, height: 844 }, 34);
    expect(trash).toEqual({ x: 195, y: 782 });
    expect(isFingerOverTrash(200, 790, trash.x, trash.y)).toBe(true);
    expect(isFingerOverTrash(195, 600, trash.x, trash.y)).toBe(false);
  });

  it('maps stickers for the native bake', () => {
    expect(toNativeStickers([sticker])).toEqual([
      { emoji: '🔥', x: 0.5, y: 0.5, fontSizePoints: 72, rotation: 0 },
    ]);
    expect(toNativeStickers(undefined)).toEqual([]);
  });
});

describe('sticker normalisation', () => {
  it('drops invalid stickers, dedupes ids and caps the count', () => {
    expect(normalizeMediaEmojiSticker({ emoji: '  ' })).toBeNull();
    expect(normalizeMediaEmojiSticker({ ...sticker, x: Number.NaN })?.x).toBe(0.5);
    const many = Array.from({ length: 30 }, () => sticker);
    const normalized = normalizeMediaEmojiStickers(many);
    expect(normalized).toHaveLength(MAX_EMOJI_STICKERS);
    expect(new Set(normalized.map((item) => item.id)).size).toBe(MAX_EMOJI_STICKERS);
    expect(canAddSticker(normalized)).toBe(false);
    expect(canAddSticker([sticker])).toBe(true);
  });
});

describe('drawing overlay carries filter and stickers', () => {
  it('keeps a filter-only or sticker-only overlay', () => {
    expect(normalizeMediaDrawingOverlay({ data: '', width: 0, height: 0, filter: 'noir' })).toEqual({
      data: '',
      width: 0,
      height: 0,
      filter: 'noir',
    });
    expect(withDrawingStickers(null, [sticker])?.stickers).toEqual([sticker]);
    expect(normalizeMediaDrawingOverlay({ data: '', width: 0, height: 0, filter: 'original' })).toBeNull();
  });

  it('preserves filter and stickers when the strokes change', () => {
    const base = withDrawingStickers(withDrawingFilter(null, 'warm'), [sticker]);
    const drawn = withDrawingStrokes(base, { data: 'abc', width: 390, height: 844 });
    expect(drawn).toMatchObject({ data: 'abc', filter: 'warm', stickers: [sticker] });
    expect(hasMediaDrawingStrokes(drawn)).toBe(true);
    const cleared = withDrawingStrokes(drawn, null);
    expect(cleared).toMatchObject({ data: '', width: 0, filter: 'warm' });
    expect(hasMediaDrawingStrokes(cleared)).toBe(false);
    expect(withDrawingFilter(withDrawingStrokes(null, null), 'original')).toBeNull();
  });

  it('counts a filter or a sticker as an edit worth confirming', () => {
    expect(hasPreviewEdits(null, withDrawingFilter(null, 'mono'))).toBe(true);
    expect(hasPreviewEdits(null, withDrawingStickers(null, [sticker]))).toBe(true);
  });
});
