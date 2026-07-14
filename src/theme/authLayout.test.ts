import { describe, expect, it } from 'vitest';
import {
  AUTH_CONTENT_MAX_WIDTH,
  AUTH_FORM_HORIZONTAL_PADDING,
  AUTH_OR_DIVIDER_GAP,
  getAuthContentWidth,
  getAuthOrDividerLineWidth,
  getAuthPrimaryButtonWidth,
} from './authLayout';

describe('getAuthContentWidth', () => {
  it('clamps to max width on wide screens (430pt)', () => {
    expect(getAuthContentWidth(430)).toBe(AUTH_CONTENT_MAX_WIDTH);
  });

  it('uses available width on standard iPhone (390pt)', () => {
    expect(getAuthContentWidth(390)).toBe(390 - AUTH_FORM_HORIZONTAL_PADDING * 2);
  });

  it('uses available width on narrow iPhone (320pt)', () => {
    expect(getAuthContentWidth(320)).toBe(320 - AUTH_FORM_HORIZONTAL_PADDING * 2);
  });
});

describe('getAuthOrDividerLineWidth', () => {
  it('returns symmetric line widths without infinite flex', () => {
    const contentWidth = getAuthContentWidth(390);
    const lineWidth = getAuthOrDividerLineWidth(contentWidth, 'or');
    const labelWidth = Math.max('or'.length * 7.5, 16);
    const total = lineWidth * 2 + labelWidth + AUTH_OR_DIVIDER_GAP * 2;
    expect(total).toBeLessThanOrEqual(contentWidth + 1);
    expect(lineWidth).toBeGreaterThan(0);
  });
});

describe('getAuthPrimaryButtonWidth', () => {
  it('keeps CTA width unchanged during loading', () => {
    const widths = [320, 390, 430].map((windowWidth) => {
      const contentWidth = getAuthContentWidth(windowWidth);
      return {
        idle: getAuthPrimaryButtonWidth(contentWidth, false),
        loading: getAuthPrimaryButtonWidth(contentWidth, true),
      };
    });

    for (const { idle, loading } of widths) {
      expect(loading).toBe(idle);
    }
  });
});
