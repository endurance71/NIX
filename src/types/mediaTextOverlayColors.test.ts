import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  TRANSPARENT_MEDIA_TEXT_BAR_COLOR,
  getContrastingTextColor,
} from './mediaTextOverlay';
import { MEDIA_TEXT_BAR_SWATCHES } from '../theme/mediaTextOverlayPalettes';

describe('getContrastingTextColor', () => {
  it('returns black for light/white bar backgrounds', () => {
    expect(getContrastingTextColor('#FFFFFF')).toBe('#000000');
    expect(getContrastingTextColor(DEFAULT_MEDIA_TEXT_BAR_COLOR)).toBe('#000000');
    expect(getContrastingTextColor('#FFFFFF8C')).toBe('#000000');
  });

  it('returns white for dark/black bar backgrounds', () => {
    expect(getContrastingTextColor('#000000')).toBe('#FFFFFF');
    expect(getContrastingTextColor('#000000E6')).toBe('#FFFFFF');
    expect(getContrastingTextColor('#1E1E1E')).toBe('#FFFFFF');
  });

  it('returns white for saturated colored bars', () => {
    expect(getContrastingTextColor('#007AFF')).toBe('#FFFFFF'); // Blue
    expect(getContrastingTextColor('#AF52DE')).toBe('#FFFFFF'); // Purple
    expect(getContrastingTextColor('#FF2D55')).toBe('#FFFFFF'); // Pink
  });

  it('returns white for transparent/clear bars for camera visibility', () => {
    expect(getContrastingTextColor(TRANSPARENT_MEDIA_TEXT_BAR_COLOR)).toBe('#FFFFFF');
    expect(getContrastingTextColor('#00000000')).toBe('#FFFFFF');
  });

  it('correctly maps all palette bar swatches', () => {
    for (const swatch of MEDIA_TEXT_BAR_SWATCHES) {
      const textColor = getContrastingTextColor(swatch.color);
      expect(['#000000', '#FFFFFF']).toContain(textColor);
      if (swatch.id === 'white') {
        expect(textColor).toBe('#000000');
      } else if (swatch.id === 'black' || swatch.id === 'blue' || swatch.id === 'purple' || swatch.id === 'pink') {
        expect(textColor).toBe('#FFFFFF');
      }
    }
  });
});
