import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
const getItem = vi.fn(async (key: string) => storage.get(key) ?? null);
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => getItem(key),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  },
}));

// eslint-disable-next-line import/first
import {
  getPreloadedAccentPresetId,
  normalizeAccentPresetId,
  preloadAccentPresetId,
  resetAccentPreloadForTests,
  saveAccentPresetId,
} from './accentPreference';
// eslint-disable-next-line import/first
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

describe('preloadAccentPresetId (PERF-6)', () => {
  beforeEach(() => {
    storage.clear();
    getItem.mockClear();
    resetAccentPreloadForTests();
  });

  it('reads storage once and exposes the result synchronously afterwards', async () => {
    storage.set('nix.accent_preset', 'purple');
    expect(getPreloadedAccentPresetId()).toBeNull();

    const first = preloadAccentPresetId();
    const second = preloadAccentPresetId();
    expect(second).toBe(first);
    await expect(first).resolves.toBe('purple');

    expect(getPreloadedAccentPresetId()).toBe('purple');
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default preset for missing or invalid values', async () => {
    storage.set('nix.accent_preset', 'neon');
    await expect(preloadAccentPresetId()).resolves.toBe(DEFAULT_ACCENT_PRESET_ID);
    expect(getPreloadedAccentPresetId()).toBe(DEFAULT_ACCENT_PRESET_ID);
  });

  it('keeps a preset saved while the first read is still pending', async () => {
    storage.set('nix.accent_preset', 'orange');
    const pending = preloadAccentPresetId();
    await saveAccentPresetId('teal');

    await expect(pending).resolves.toBe('teal');
    expect(getPreloadedAccentPresetId()).toBe('teal');
  });
});
