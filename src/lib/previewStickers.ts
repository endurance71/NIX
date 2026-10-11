import {
  DEFAULT_EMOJI_STICKER_FONT_SIZE,
  MAX_EMOJI_STICKERS,
  clampStickerFontSize,
  normalizeStickerRotation,
  type MediaEmojiSticker,
} from '../types/mediaStickerOverlay';

/** Curated picker grid (6 rows of 10). Any other emoji can be typed in the sheet's field. */
export const CURATED_STICKER_EMOJI: readonly string[] = [
  '😂', '😍', '🥰', '😎', '🤩', '😭', '🥹', '😅', '😜', '🤔',
  '😴', '🤯', '🥳', '😇', '😈', '🤠', '🙈', '👀', '💀', '👻',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '💯', '✨',
  '🔥', '⭐', '🌈', '☀️', '🌙', '⚡', '🎉', '🎂', '🎁', '🎈',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '✌️', '🤞', '👋',
  '🐶', '🐱', '🦄', '🐸', '🍕', '🍔', '🍦', '☕', '⚽', '🚀',
];

// Emoji presentation sequences: a pictograph with optional VS16 / skin-tone / tag modifiers,
// joined by ZWJ; regional-indicator flag pairs; keycaps. Explicit code point ranges instead of
// `\p{Extended_Pictographic}`: Hermes does not reliably support binary property escapes.
const PICTOGRAPH =
  '[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2300}-\\u{23FF}\\u{2B00}-\\u{2BFF}' +
  '\\u{2190}-\\u{21FF}\\u{25A0}-\\u{25FF}\\u{2900}-\\u{297F}\\u{3030}\\u{303D}\\u{3297}' +
  '\\u{3299}\\u{00A9}\\u{00AE}\\u{203C}\\u{2049}\\u{2122}\\u{2139}\\u{24C2}]';
const MODIFIER = '[\\u{FE0F}\\u{1F3FB}-\\u{1F3FF}\\u{E0020}-\\u{E007F}]';
const REGIONAL_INDICATOR = '[\\u{1F1E6}-\\u{1F1FF}]';
const EMOJI_RE = new RegExp(
  `(?:${REGIONAL_INDICATOR}{2}|[#*0-9]\\u{FE0F}?\\u{20E3}|` +
    `${PICTOGRAPH}${MODIFIER}*(?:\\u{200D}${PICTOGRAPH}${MODIFIER}*)*)`,
  'u',
);

/** First emoji (whole grapheme sequence) in free text, or null. */
export function extractFirstEmoji(text: string): string | null {
  if (!text) return null;
  const match = EMOJI_RE.exec(text);
  return match ? match[0] : null;
}

export function canAddSticker(stickers: readonly MediaEmojiSticker[]): boolean {
  return stickers.length < MAX_EMOJI_STICKERS;
}

/**
 * New sticker near the middle of the frame; consecutive stickers fan out a little so they
 * do not stack exactly on top of each other.
 */
export function createEmojiSticker(
  emoji: string,
  existing: readonly MediaEmojiSticker[],
  id: string,
): MediaEmojiSticker {
  const offsets = [0, -0.08, 0.08, -0.16, 0.16];
  const offset = offsets[existing.length % offsets.length];
  return {
    id,
    emoji,
    x: 0.5 + offset * 0.6,
    y: 0.42 + offset,
    fontSize: DEFAULT_EMOJI_STICKER_FONT_SIZE,
    rotation: 0,
  };
}

export type StickerGestureDelta = {
  /** Pan translation in stage points. */
  translationX: number;
  translationY: number;
  /** Pinch scale factor (1 = unchanged). */
  scale: number;
  /** Rotation delta in radians. */
  rotation: number;
};

/** Applies a finished pan/pinch/rotate to a sticker in a stage of the given size. */
export function applyStickerGesture(
  sticker: MediaEmojiSticker,
  delta: StickerGestureDelta,
  stage: { width: number; height: number },
): MediaEmojiSticker {
  const width = Math.max(1, stage.width);
  const height = Math.max(1, stage.height);
  const scale = Number.isFinite(delta.scale) && delta.scale > 0 ? delta.scale : 1;
  return {
    ...sticker,
    x: Math.max(0, Math.min(1, sticker.x + delta.translationX / width)),
    y: Math.max(0, Math.min(1, sticker.y + delta.translationY / height)),
    fontSize: clampStickerFontSize(sticker.fontSize * scale),
    rotation: normalizeStickerRotation(sticker.rotation + (delta.rotation || 0)),
  };
}

/** Live pinch scale clamped so the font stays within the persisted bounds. */
export function clampLiveStickerScale(fontSize: number, scale: number): number {
  'worklet';
  const min = 24 / fontSize;
  const max = 280 / fontSize;
  return Math.max(min, Math.min(max, scale));
}

export const STICKER_TRASH_RADIUS = 44;

/** Trash zone centre in window coordinates: bottom centre, inside the bottom controls band. */
export function stickerTrashCenter(window: { width: number; height: number }, bottomInset: number) {
  return { x: window.width / 2, y: window.height - bottomInset - 28 };
}

/** True when the finger (window coordinates) is over the trash zone. */
export function isFingerOverTrash(
  fingerX: number,
  fingerY: number,
  trashX: number,
  trashY: number,
  radius?: number,
): boolean {
  'worklet';
  // Not a default parameter: worklets capture constants used in the body, but not in default
  // parameters (the UI thread threw "Property 'STICKER_TRASH_RADIUS' doesn't exist").
  const r = radius ?? STICKER_TRASH_RADIUS;
  const dx = fingerX - trashX;
  const dy = fingerY - trashY;
  return dx * dx + dy * dy <= r * r;
}

export type NativeEmojiSticker = {
  emoji: string;
  x: number;
  y: number;
  fontSizePoints: number;
  rotation: number;
};

export function toNativeStickers(stickers: readonly MediaEmojiSticker[] | undefined): NativeEmojiSticker[] {
  return (stickers ?? []).map((sticker) => ({
    emoji: sticker.emoji,
    x: sticker.x,
    y: sticker.y,
    fontSizePoints: sticker.fontSize,
    rotation: sticker.rotation,
  }));
}
