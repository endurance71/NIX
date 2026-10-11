import { describe, expect, it } from 'vitest';
import { lightColors, darkColors } from '../../theme/colors';
import {
  BUTTON_HEIGHT,
  BUTTON_RADIUS,
  isButtonInteractive,
  resolveButtonAppearance,
} from './button-appearance';

describe('resolveButtonAppearance', () => {
  it('fills primary with the accent and draws contrast-aware ink on it', () => {
    const colors = { ...lightColors, accent: '#FF9500', onAccent: '#1C1C1E' };
    expect(resolveButtonAppearance('primary', colors)).toEqual({
      backgroundColor: '#FF9500',
      foregroundColor: '#1C1C1E',
    });
  });

  it('fills destructive with the destructive color and its own ink', () => {
    expect(resolveButtonAppearance('destructive', darkColors)).toEqual({
      backgroundColor: darkColors.destructive,
      foregroundColor: darkColors.onDestructive,
    });
  });

  it('draws secondary on the system fill and tertiary as accent text', () => {
    expect(resolveButtonAppearance('secondary', lightColors)).toEqual({
      backgroundColor: lightColors.secondarySystemFill,
      foregroundColor: lightColors.label,
    });
    expect(resolveButtonAppearance('tertiary', lightColors)).toEqual({
      backgroundColor: 'transparent',
      foregroundColor: lightColors.accent,
    });
  });
});

describe('button metrics', () => {
  it('uses uniform heights and the shared button radius', () => {
    expect(BUTTON_HEIGHT).toEqual({ regular: 44, large: 52 });
    expect(BUTTON_RADIUS).toBe(14);
  });
});

describe('isButtonInteractive', () => {
  it('blocks presses while disabled or loading', () => {
    expect(isButtonInteractive(false, false)).toBe(true);
    expect(isButtonInteractive(true, false)).toBe(false);
    expect(isButtonInteractive(false, true)).toBe(false);
  });
});
