import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, contrastRatio, resolveAccentForeground, resolveOnAccentColor } from './accent-presets';

describe('accent contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('keeps white on the deep presets and switches orange and teal to dark ink', () => {
    const ink = Object.fromEntries(ACCENT_PRESETS.map((preset) => [preset.id, resolveOnAccentColor(preset.light)]));
    expect(ink.blue).toBe('#FFFFFF');
    expect(ink.indigo).toBe('#FFFFFF');
    expect(ink.purple).toBe('#FFFFFF');
    expect(ink.pink).toBe('#FFFFFF');
    expect(ink.orange).toBe('#1C1C1E');
    expect(ink.teal).toBe('#1C1C1E');
  });

  it('always reaches at least 3:1 on every preset in both appearances', () => {
    for (const preset of ACCENT_PRESETS) {
      for (const accent of [preset.light, preset.dark]) {
        expect(contrastRatio(resolveOnAccentColor(accent), accent)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('accent foreground (text and glyphs on the background)', () => {
  it('darkens faint presets on white to body-text contrast and keeps the rest', () => {
    for (const preset of ACCENT_PRESETS) {
      const foreground = resolveAccentForeground(preset.light, '#FFFFFF');
      if (contrastRatio(preset.light, '#FFFFFF') >= 3) {
        expect(foreground).toBe(preset.light);
      } else {
        expect(contrastRatio(foreground, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(resolveAccentForeground('#007AFF', '#FFFFFF')).toBe('#007AFF');
    expect(resolveAccentForeground('#FF9500', '#FFFFFF')).not.toBe('#FF9500');
    expect(resolveAccentForeground('#30B0C7', '#FFFFFF')).not.toBe('#30B0C7');
  });
  it('leaves every preset unchanged in dark mode', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(resolveAccentForeground(preset.dark, '#000000')).toBe(preset.dark);
    }
  });
});
