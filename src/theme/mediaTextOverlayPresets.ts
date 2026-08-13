import type { MediaTextPreset } from '../types/mediaTextOverlay';

export type MediaTextPresetDefinition = {
  id: MediaTextPreset;
  /** i18n key under preview.* */
  labelKey: string;
  fontSize: number;
  bold: boolean;
  monospace: boolean;
  /** Preview chip typography (Notes-style self-describing labels). */
  chipFontSize: number;
  chipFontWeight: '400' | '600' | '700';
};

/** Apple Notes–style text type presets for caption stickers. */
export const MEDIA_TEXT_PRESETS: MediaTextPresetDefinition[] = [
  {
    id: 'title',
    labelKey: 'textPresetTitle',
    fontSize: 34,
    bold: true,
    monospace: false,
    chipFontSize: 24,
    chipFontWeight: '700',
  },
  {
    id: 'heading',
    labelKey: 'textPresetHeading',
    fontSize: 28,
    bold: true,
    monospace: false,
    chipFontSize: 20,
    chipFontWeight: '700',
  },
  {
    id: 'subheading',
    labelKey: 'textPresetSubheading',
    fontSize: 22,
    bold: true,
    monospace: false,
    chipFontSize: 18,
    chipFontWeight: '600',
  },
  {
    id: 'body',
    labelKey: 'textPresetBody',
    fontSize: 17,
    bold: false,
    monospace: false,
    chipFontSize: 17,
    chipFontWeight: '400',
  },
  {
    id: 'monospace',
    labelKey: 'textPresetMonospace',
    fontSize: 17,
    bold: false,
    monospace: true,
    chipFontSize: 16,
    chipFontWeight: '400',
  },
];

export function mediaTextPresetDefinition(
  preset: MediaTextPreset
): MediaTextPresetDefinition {
  return MEDIA_TEXT_PRESETS.find((item) => item.id === preset) ?? MEDIA_TEXT_PRESETS[0];
}

export function applyMediaTextPreset(preset: MediaTextPreset): {
  preset: MediaTextPreset;
  fontSize: number;
  bold: boolean;
  monospace: boolean;
} {
  const def = mediaTextPresetDefinition(preset);
  return {
    preset: def.id,
    fontSize: def.fontSize,
    bold: def.bold,
    monospace: def.monospace,
  };
}
