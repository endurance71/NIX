/**
 * Colour filters for the preview editor.
 *
 * Every filter is a single 4×5 colour matrix (rows R, G, B, A; columns r, g, b, a, bias, with the
 * bias in 0–1 units). The same 20 numbers drive the live preview (native CIColorMatrix in
 * `NixFilteredImageView` / the AVPlayer video composition) and the native bake (photo and
 * video), so the sent file matches what the sender saw. Matrices are applied to gamma-encoded
 * values and the result is clamped to 0–1.
 */

export type ColorMatrix = readonly number[];

export const MEDIA_FILTER_IDS = [
  'original',
  'vivid',
  'warm',
  'cool',
  'mono',
  'noir',
  'retro',
  'fade',
] as const;

export type MediaFilterId = (typeof MEDIA_FILTER_IDS)[number];

export const DEFAULT_MEDIA_FILTER_ID: MediaFilterId = 'original';

/** i18n keys (`preview.filters.<id>`), kept explicit so the key checker sees them. */
export const MEDIA_FILTER_LABEL_KEYS: Record<MediaFilterId, string> = {
  original: 'preview.filters.original',
  vivid: 'preview.filters.vivid',
  warm: 'preview.filters.warm',
  cool: 'preview.filters.cool',
  mono: 'preview.filters.mono',
  noir: 'preview.filters.noir',
  retro: 'preview.filters.retro',
  fade: 'preview.filters.fade',
};

// prettier-ignore
export const IDENTITY_COLOR_MATRIX: ColorMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/** Rec. 709 luma weights (the encoded video and sRGB photos share these primaries). */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** `b ∘ a`: applies `a` first, then `b`. */
export function concatColorMatrices(b: ColorMatrix, a: ColorMatrix): number[] {
  const out: number[] = new Array(20).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      let value = 0;
      for (let k = 0; k < 4; k += 1) {
        value += b[row * 5 + k] * a[k * 5 + col];
      }
      if (col === 4) value += b[row * 5 + 4];
      out[row * 5 + col] = value;
    }
  }
  return out;
}

function chain(...matrices: ColorMatrix[]): number[] {
  return matrices.reduce<number[]>(
    (acc, next) => concatColorMatrices(next, acc),
    [...IDENTITY_COLOR_MATRIX],
  );
}

export function saturationMatrix(s: number): number[] {
  const r = (1 - s) * LUMA_R;
  const g = (1 - s) * LUMA_G;
  const b = (1 - s) * LUMA_B;
  // prettier-ignore
  return [
    r + s, g, b, 0, 0,
    r, g + s, b, 0, 0,
    r, g, b + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/** Contrast around mid-grey 0.5. */
export function contrastMatrix(c: number): number[] {
  const t = 0.5 * (1 - c);
  // prettier-ignore
  return [
    c, 0, 0, 0, t,
    0, c, 0, 0, t,
    0, 0, c, 0, t,
    0, 0, 0, 1, 0,
  ];
}

/** Per-channel gain and offset (offset in 0–1 units). */
export function channelMatrix(
  gain: readonly [number, number, number],
  offset: readonly [number, number, number] = [0, 0, 0],
): number[] {
  // prettier-ignore
  return [
    gain[0], 0, 0, 0, offset[0],
    0, gain[1], 0, 0, offset[1],
    0, 0, gain[2], 0, offset[2],
    0, 0, 0, 1, 0,
  ];
}

// prettier-ignore
const SEPIA_MATRIX: ColorMatrix = [
  0.393, 0.769, 0.189, 0, 0,
  0.349, 0.686, 0.168, 0, 0,
  0.272, 0.534, 0.131, 0, 0,
  0, 0, 0, 1, 0,
];

function mix(a: ColorMatrix, b: ColorMatrix, amount: number): number[] {
  return a.map((value, index) => value * (1 - amount) + b[index] * amount);
}

const MEDIA_FILTER_MATRICES: Record<MediaFilterId, ColorMatrix> = {
  original: IDENTITY_COLOR_MATRIX,
  vivid: chain(saturationMatrix(1.35), contrastMatrix(1.08)),
  warm: chain(channelMatrix([1.06, 1.01, 0.86], [0.025, 0.01, 0]), saturationMatrix(1.05)),
  cool: chain(channelMatrix([0.9, 1, 1.08], [0, 0.01, 0.035]), saturationMatrix(0.95)),
  mono: chain(saturationMatrix(0), contrastMatrix(1.05)),
  noir: chain(saturationMatrix(0), contrastMatrix(1.4), channelMatrix([1, 1, 1], [-0.03, -0.03, -0.03])),
  retro: chain(
    mix(IDENTITY_COLOR_MATRIX, SEPIA_MATRIX, 0.55),
    contrastMatrix(0.92),
    channelMatrix([1, 0.98, 0.92], [0.05, 0.035, 0.02]),
  ),
  fade: chain(saturationMatrix(0.72), contrastMatrix(0.82), channelMatrix([1, 1, 1], [0.05, 0.05, 0.06])),
};

export function isMediaFilterId(value: unknown): value is MediaFilterId {
  return typeof value === 'string' && (MEDIA_FILTER_IDS as readonly string[]).includes(value);
}

export function normalizeMediaFilterId(value: unknown): MediaFilterId {
  return isMediaFilterId(value) ? value : DEFAULT_MEDIA_FILTER_ID;
}

export function mediaFilterMatrix(id: MediaFilterId): ColorMatrix {
  return MEDIA_FILTER_MATRICES[id];
}

/** Matrix sent to native; empty for the original (native skips the filter entirely). */
export function nativeFilterMatrix(id: MediaFilterId | null | undefined): number[] {
  const normalized = normalizeMediaFilterId(id);
  if (normalized === DEFAULT_MEDIA_FILTER_ID) return [];
  return [...MEDIA_FILTER_MATRICES[normalized]];
}

/** Next/previous filter for swipes and VoiceOver adjust; wraps around. */
export function stepMediaFilter(current: MediaFilterId, delta: number): MediaFilterId {
  const index = MEDIA_FILTER_IDS.indexOf(current);
  const count = MEDIA_FILTER_IDS.length;
  const next = (((index + Math.trunc(delta)) % count) + count) % count;
  return MEDIA_FILTER_IDS[next];
}

/** Applies a matrix to one RGBA pixel (0–1) with the native clamp. Used by tests. */
export function applyColorMatrix(
  matrix: ColorMatrix,
  pixel: readonly [number, number, number, number],
): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let row = 0; row < 4; row += 1) {
    const value =
      matrix[row * 5] * pixel[0] +
      matrix[row * 5 + 1] * pixel[1] +
      matrix[row * 5 + 2] * pixel[2] +
      matrix[row * 5 + 3] * pixel[3] +
      matrix[row * 5 + 4];
    out[row] = Math.max(0, Math.min(1, value));
  }
  return out;
}

/**
 * Horizontal swipe → filter step. Left swipe (negative dx) goes to the next filter, like
 * Snapchat. Returns 0 when the swipe is too short and too slow.
 */
export function filterStepForSwipe(translationX: number, velocityX: number): -1 | 0 | 1 {
  const DISTANCE = 56;
  const VELOCITY = 500;
  if (translationX <= -DISTANCE || velocityX <= -VELOCITY) return 1;
  if (translationX >= DISTANCE || velocityX >= VELOCITY) return -1;
  return 0;
}
