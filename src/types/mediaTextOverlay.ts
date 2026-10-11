/** Default vertical position (center of the visible cover frame). */
export const DEFAULT_MEDIA_TEXT_OVERLAY_Y = 0.5;

/** Preview-point font size baked into the media relative to frame height. */
export const DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE = 34;
export const MIN_MEDIA_TEXT_OVERLAY_FONT_SIZE = 14;
export const MAX_MEDIA_TEXT_OVERLAY_FONT_SIZE = 60;

/** Black text is the default for newly created stickers. */
export const DEFAULT_MEDIA_TEXT_COLOR = '#000000';

/** Default light translucent caption bar — rgba(255,255,255,0.55). */
export const DEFAULT_MEDIA_TEXT_BAR_COLOR = '#FFFFFF8C';

/** Static export uses the same fill as preview. */
export const DEFAULT_MEDIA_TEXT_BAKED_BAR_COLOR = DEFAULT_MEDIA_TEXT_BAR_COLOR;

/** Previous defaults accepted while normalizing persisted drafts. */
const LEGACY_MEDIA_TEXT_GLASS_BAR_COLOR = '#0000008C';
const LEGACY_MEDIA_TEXT_TRANSLUCENT_BAR_COLOR = '#FFFFFFCC';

/** Fully transparent bar (no fill in bake / solid preview). */
export const TRANSPARENT_MEDIA_TEXT_BAR_COLOR = '#00000000';

/**
 * Snapchat-style caption bar: edge-to-edge strip, black at 60%, regular white text at a fixed
 * size. Geometry constants are mirrored in `NixMediaOverlayModule.swift` (caption bar bake).
 */
export const MEDIA_TEXT_CAPTION_BAR_COLOR = '#00000099';
export const MEDIA_TEXT_CAPTION_BAR_TEXT_COLOR = '#FFFFFF';
export const MEDIA_TEXT_CAPTION_BAR_FONT_SIZE = 17;
export const MEDIA_TEXT_CAPTION_BAR_PADDING_H = 16;
export const MEDIA_TEXT_CAPTION_BAR_PADDING_V = 8;
/** Line box the bar keeps even while empty (one line of the fixed font). */
export const MEDIA_TEXT_CAPTION_BAR_LINE_HEIGHT_FACTOR = 1.2;

/**
 * `bar`: full-width Snapchat caption with no format options.
 * `sticker`: the formatted rounded caption (colour, font, size, alignment).
 */
export type MediaTextVariant = 'bar' | 'sticker';

export type MediaTextAlign = 'left' | 'center' | 'right';

export type MediaTextPreset = 'title' | 'heading' | 'subheading' | 'body' | 'monospace';

/** Built-in iOS system font designs (SF / New York / SF Rounded). */
export type MediaTextFontDesign = 'system' | 'serif' | 'rounded';

export type MediaTextOverlayStyle = {
  textColor: string;
  barColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  monospace: boolean;
  fontDesign: MediaTextFontDesign;
  preset: MediaTextPreset;
  align: MediaTextAlign;
};

export type MediaTextOverlay = {
  /** Drafts saved before the caption bar existed have no variant and stay stickers. */
  variant: MediaTextVariant;
  text: string;
  /**
   * Vertical position 0–1 relative to the visible cover frame.
   * 0 = top, 1 = bottom.
   */
  y: number;
  /** Logical preview points; scaled during native bake. */
  fontSize: number;
  textColor: string;
  barColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  monospace: boolean;
  fontDesign: MediaTextFontDesign;
  preset: MediaTextPreset;
  align: MediaTextAlign;
};

/** Input may omit style fields — normalize fills defaults. */
export type MediaTextOverlayInput = {
  variant?: MediaTextVariant;
  text: string;
  y: number;
  fontSize: number;
  textColor?: string;
  barColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  monospace?: boolean;
  fontDesign?: MediaTextFontDesign;
  preset?: MediaTextPreset;
  align?: MediaTextAlign;
};

export function clampOverlayY(y: number): number {
  if (!Number.isFinite(y)) return DEFAULT_MEDIA_TEXT_OVERLAY_Y;
  return Math.max(0, Math.min(1, y));
}

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!HEX_COLOR_RE.test(trimmed)) return fallback;
  return trimmed.toUpperCase();
}

export function normalizeMediaTextAlign(value: unknown): MediaTextAlign {
  if (value === 'left' || value === 'right' || value === 'center') return value;
  return 'center';
}

export function normalizeMediaTextPreset(value: unknown): MediaTextPreset {
  if (
    value === 'title' ||
    value === 'heading' ||
    value === 'subheading' ||
    value === 'body' ||
    value === 'monospace'
  ) {
    return value;
  }
  return 'title';
}

export function normalizeMediaTextVariant(value: unknown): MediaTextVariant {
  return value === 'bar' ? 'bar' : 'sticker';
}

export function normalizeMediaTextFontDesign(value: unknown): MediaTextFontDesign {
  if (value === 'serif' || value === 'rounded' || value === 'system') return value;
  return 'system';
}

export function defaultMediaTextOverlayStyle(): MediaTextOverlayStyle {
  return {
    textColor: DEFAULT_MEDIA_TEXT_COLOR,
    barColor: DEFAULT_MEDIA_TEXT_BAR_COLOR,
    bold: true,
    italic: false,
    underline: false,
    strikethrough: false,
    monospace: false,
    fontDesign: 'system',
    preset: 'title',
    align: 'center',
  };
}

export function isDefaultBarColor(barColor: string): boolean {
  const normalized = normalizeHexColor(barColor, DEFAULT_MEDIA_TEXT_BAR_COLOR);
  return (
    normalized === DEFAULT_MEDIA_TEXT_BAR_COLOR ||
    normalized === LEGACY_MEDIA_TEXT_GLASS_BAR_COLOR ||
    normalized === LEGACY_MEDIA_TEXT_TRANSLUCENT_BAR_COLOR
  );
}

export function resolveMediaTextBarColor(barColor: string): string {
  return isDefaultBarColor(barColor)
    ? DEFAULT_MEDIA_TEXT_BAKED_BAR_COLOR
    : normalizeHexColor(barColor, DEFAULT_MEDIA_TEXT_BAKED_BAR_COLOR);
}

/**
 * Computes optimal high-contrast text color ('#FFFFFF' or '#000000') for a given bar background color.
 */
export function getContrastingTextColor(barColor: string): string {
  const upper = barColor.toUpperCase();
  if (
    upper === TRANSPARENT_MEDIA_TEXT_BAR_COLOR ||
    upper === '#00000000' ||
    upper === 'TRANSPARENT'
  ) {
    return '#FFFFFF';
  }

  let hex = barColor.trim().replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((x) => x + x).join('');
  }
  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const toLinear = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const luminance =
      0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

    return luminance > 0.45 ? '#000000' : '#FFFFFF';
  }

  return '#000000';
}

export function normalizeMediaTextOverlay(
  overlay: MediaTextOverlayInput | null | undefined
): MediaTextOverlay | null {
  if (!overlay) return null;
  const text = overlay.text.trim();
  if (!text) return null;
  const defaults = defaultMediaTextOverlayStyle();
  const preset = normalizeMediaTextPreset(overlay.preset);
  return {
    variant: normalizeMediaTextVariant(overlay.variant),
    text,
    y: clampOverlayY(overlay.y),
    fontSize:
      Number.isFinite(overlay.fontSize) && overlay.fontSize > 0
        ? overlay.fontSize
        : DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE,
    textColor: normalizeHexColor(overlay.textColor, defaults.textColor),
    barColor: resolveMediaTextBarColor(overlay.barColor ?? defaults.barColor),
    bold: typeof overlay.bold === 'boolean' ? overlay.bold : defaults.bold,
    italic: typeof overlay.italic === 'boolean' ? overlay.italic : defaults.italic,
    underline: typeof overlay.underline === 'boolean' ? overlay.underline : defaults.underline,
    strikethrough:
      typeof overlay.strikethrough === 'boolean' ? overlay.strikethrough : defaults.strikethrough,
    monospace: typeof overlay.monospace === 'boolean' ? overlay.monospace : defaults.monospace,
    fontDesign: normalizeMediaTextFontDesign(overlay.fontDesign),
    preset,
    align: normalizeMediaTextAlign(overlay.align),
  };
}

export function createDefaultMediaTextOverlay(
  text = '',
  variant: MediaTextVariant = 'sticker'
): MediaTextOverlay {
  return {
    variant,
    text,
    y: DEFAULT_MEDIA_TEXT_OVERLAY_Y,
    fontSize: DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE,
    ...defaultMediaTextOverlayStyle(),
  };
}

/** What the preview draws and the bake receives; style fields that affect the drawn text. */
export type MediaTextRenderStyle = Omit<MediaTextOverlayStyle, 'preset'> & { fontSize: number };

/**
 * The style actually drawn for an overlay. A caption bar ignores the sticker format (which is
 * kept on the overlay, so switching back to a sticker restores it) and uses its fixed look.
 */
export function resolveMediaTextRenderStyle(
  overlay: Pick<MediaTextOverlay, 'variant' | 'fontSize' | keyof MediaTextOverlayStyle>
): MediaTextRenderStyle {
  if (overlay.variant === 'bar') {
    return {
      fontSize: MEDIA_TEXT_CAPTION_BAR_FONT_SIZE,
      textColor: MEDIA_TEXT_CAPTION_BAR_TEXT_COLOR,
      barColor: MEDIA_TEXT_CAPTION_BAR_COLOR,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      monospace: false,
      fontDesign: 'system',
      align: 'center',
    };
  }
  return {
    fontSize: overlay.fontSize,
    textColor: overlay.textColor,
    barColor: overlay.barColor,
    bold: overlay.bold,
    italic: overlay.italic,
    underline: overlay.underline,
    strikethrough: overlay.strikethrough,
    monospace: overlay.monospace,
    fontDesign: overlay.fontDesign,
    align: overlay.align,
  };
}
