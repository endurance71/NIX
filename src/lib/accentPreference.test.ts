import { describe, expect, it } from 'vitest';
import { normalizeAccentPresetId } from './accentPreference';
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_PRESET_ID,
  getAccentPreset,
  resolveAccentColor,
} from '../theme/accent-presets';

describe('accentPresets', () => {
  it('exposes six presets including default blue', () => {
    expect(ACCENT_PRESETS).toHaveLength(6);
    expect(DEFAULT_ACCENT_PRESET_ID).toBe('blue');
    expect(getAccentPreset('blue').id).toBe('blue');
  });

  it('resolves distinct light and dark accent colors', () => {
    for (const preset of ACCENT_PRESETS) {
      const light = resolveAccentColor(preset.id, 'light');
      const dark = resolveAccentColor(preset.id, 'dark');
      expect(light).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(dark).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(light).toBe(preset.light);
      expect(dark).toBe(preset.dark);
    }
  });

  it('falls back to blue for unknown preset ids via getAccentPreset', () => {
    expect(getAccentPreset('blue').light).toBe('#007AFF');
  });
});

describe('normalizeAccentPresetId', () => {
  it('accepts known preset ids', () => {
    expect(normalizeAccentPresetId('purple')).toBe('purple');
    expect(normalizeAccentPresetId('teal')).toBe('teal');
  });

  it('falls back to default for invalid values', () => {
    expect(normalizeAccentPresetId(undefined)).toBe(DEFAULT_ACCENT_PRESET_ID);
    expect(normalizeAccentPresetId('')).toBe(DEFAULT_ACCENT_PRESET_ID);
    expect(normalizeAccentPresetId('neon')).toBe(DEFAULT_ACCENT_PRESET_ID);
    expect(normalizeAccentPresetId(12)).toBe(DEFAULT_ACCENT_PRESET_ID);
  });
});
