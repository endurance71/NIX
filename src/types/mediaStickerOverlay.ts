/**
 * Emoji stickers placed on a photo or video in the preview editor.
 *
 * Position is the sticker centre, normalised 0–1 to the visible cover frame (the same frame the
 * text overlay's `y` uses). `fontSize` is in preview points and scaled to media pixels by the
 * native bake exactly like the caption font. `rotation` is in radians, clockwise.
 */
export type MediaEmojiSticker = {
  id: string;
  emoji: string;
  x: number;
  y: number;
  fontSize: number;
  rotation: number;
};

export const DEFAULT_EMOJI_STICKER_FONT_SIZE = 72;
export const MIN_EMOJI_STICKER_FONT_SIZE = 24;
export const MAX_EMOJI_STICKER_FONT_SIZE = 280;
export const MAX_EMOJI_STICKERS = 20;
/** Longest accepted grapheme (ZWJ family / flag sequences stay well under this). */
const MAX_EMOJI_LENGTH = 32;

export function clampStickerFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_EMOJI_STICKER_FONT_SIZE;
  return Math.max(MIN_EMOJI_STICKER_FONT_SIZE, Math.min(MAX_EMOJI_STICKER_FONT_SIZE, size));
}

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

/** Wraps an angle into (-π, π] so persisted values stay small. */
export function normalizeStickerRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  const twoPi = Math.PI * 2;
  let r = rotation % twoPi;
  if (r > Math.PI) r -= twoPi;
  if (r <= -Math.PI) r += twoPi;
  return r;
}

export function normalizeMediaEmojiSticker(input: unknown): MediaEmojiSticker | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<MediaEmojiSticker>;
  if (typeof value.emoji !== 'string') return null;
  const emoji = value.emoji.trim();
  if (!emoji || emoji.length > MAX_EMOJI_LENGTH) return null;
  const id = typeof value.id === 'string' && value.id ? value.id : `sticker-${emoji}`;
  return {
    id,
    emoji,
    x: clampUnit(Number(value.x), 0.5),
    y: clampUnit(Number(value.y), 0.5),
    fontSize: clampStickerFontSize(Number(value.fontSize)),
    rotation: normalizeStickerRotation(Number(value.rotation)),
  };
}

export function normalizeMediaEmojiStickers(input: unknown): MediaEmojiSticker[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: MediaEmojiSticker[] = [];
  for (const item of input) {
    const sticker = normalizeMediaEmojiSticker(item);
    if (!sticker) continue;
    let { id } = sticker;
    while (seen.has(id)) id = `${id}-dup`;
    seen.add(id);
    out.push(id === sticker.id ? sticker : { ...sticker, id });
    if (out.length >= MAX_EMOJI_STICKERS) break;
  }
  return out;
}
