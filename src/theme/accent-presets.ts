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
