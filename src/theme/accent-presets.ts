export const ACCENT_PRESET_IDS = ['blue', 'indigo', 'purple', 'pink', 'orange', 'teal'] as const;

export type AccentPresetId = (typeof ACCENT_PRESET_IDS)[number];

export type AccentPreset = {
  id: AccentPresetId;
  /** i18n key under `profile.accentPresets.*` */
  labelKey: `profile.accentPresets.${AccentPresetId}`;
  light: string;
  dark: string;
};

export const DEFAULT_ACCENT_PRESET_ID: AccentPresetId = 'blue';

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'blue', labelKey: 'profile.accentPresets.blue', light: '#007AFF', dark: '#0A84FF' },
  { id: 'indigo', labelKey: 'profile.accentPresets.indigo', light: '#5856D6', dark: '#5E5CE6' },
  { id: 'purple', labelKey: 'profile.accentPresets.purple', light: '#AF52DE', dark: '#BF5AF2' },
  { id: 'pink', labelKey: 'profile.accentPresets.pink', light: '#FF2D55', dark: '#FF375F' },
  { id: 'orange', labelKey: 'profile.accentPresets.orange', light: '#FF9500', dark: '#FF9F0A' },
  { id: 'teal', labelKey: 'profile.accentPresets.teal', light: '#30B0C7', dark: '#40C8E0' },
] as const;

const presetById = new Map<AccentPresetId, AccentPreset>(
  ACCENT_PRESETS.map((preset) => [preset.id, preset])
);

export function getAccentPreset(id: AccentPresetId): AccentPreset {
  return presetById.get(id) ?? presetById.get(DEFAULT_ACCENT_PRESET_ID)!;
}

export function resolveAccentColor(
  presetId: AccentPresetId,
  scheme: 'light' | 'dark'
): string {
  const preset = getAccentPreset(presetId);
  return scheme === 'dark' ? preset.dark : preset.light;
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '').slice(0, 6);
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const ON_ACCENT_LIGHT = '#FFFFFF';
const ON_ACCENT_DARK = '#1C1C1E';

/**
 * Text/glyph colour on an accent fill (buttons, own chat bubbles, selected chips). White unless
 * it drops below 3:1, the large-text/UI threshold iOS uses for filled buttons — orange and teal
 * get dark ink instead of unreadable white.
 */
export function resolveOnAccentColor(accent: string): string {
  return contrastRatio(ON_ACCENT_LIGHT, accent) >= 3 ? ON_ACCENT_LIGHT : ON_ACCENT_DARK;
}
