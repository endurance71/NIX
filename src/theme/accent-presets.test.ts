import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, contrastRatio, resolveOnAccentColor } from './accent-presets';

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
