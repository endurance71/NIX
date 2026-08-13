/** Default vertical position (center of the visible cover frame). */
export const DEFAULT_MEDIA_TEXT_OVERLAY_Y = 0.5;

/** Preview-point font size baked into the media relative to frame height. */
export const DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE = 34;

/** Black text is the default for newly created stickers. */
export const DEFAULT_MEDIA_TEXT_COLOR = '#000000';

/** Dark translucent caption bar — rgba(0,0,0,0.55) as #RRGGBBAA. */
export const DEFAULT_MEDIA_TEXT_BAR_COLOR = '#0000008C';

/** Fully transparent bar (no fill in bake / solid preview). */
export const TRANSPARENT_MEDIA_TEXT_BAR_COLOR = '#00000000';

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
  return normalizeHexColor(barColor, DEFAULT_MEDIA_TEXT_BAR_COLOR) === DEFAULT_MEDIA_TEXT_BAR_COLOR;
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
    text,
    y: clampOverlayY(overlay.y),
    fontSize:
      Number.isFinite(overlay.fontSize) && overlay.fontSize > 0
        ? overlay.fontSize
        : DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE,
    textColor: normalizeHexColor(overlay.textColor, defaults.textColor),
    barColor: normalizeHexColor(overlay.barColor, defaults.barColor),
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

export function createDefaultMediaTextOverlay(text = ''): MediaTextOverlay {
  return {
    text,
    y: DEFAULT_MEDIA_TEXT_OVERLAY_Y,
    fontSize: DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE,
    ...defaultMediaTextOverlayStyle(),
  };
}
