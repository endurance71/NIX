import { describe, expect, it } from 'vitest';
import {
  AUTH_CONTENT_MAX_WIDTH,
  AUTH_FIELD_LABELED_ROW_MIN_HEIGHT,
  AUTH_FIELD_ROW_MIN_HEIGHT,
  AUTH_FORM_HORIZONTAL_PADDING,
  AUTH_LOGIN_CTA_TO_PROMPT_GAP,
  AUTH_LOGIN_FIELD_LABEL_GAP,
  AUTH_LOGIN_FIELD_STACK_GAP,
  AUTH_LOGIN_FORGOT_TO_ACTIONS_GAP,
  AUTH_LOGIN_FORM_TO_ACTIONS_GAP,
  AUTH_LOGIN_FORM_TO_CTA_GAP,
  AUTH_LOGIN_FORM_TO_FORGOT_GAP,
  AUTH_LOGIN_HERO_INTERNAL_GAP,
  AUTH_LOGIN_HERO_TO_FORM_GAP,
  AUTH_LOGIN_LOGO_CORNER_RADIUS,
  AUTH_LOGIN_LOGO_SIZE,
  AUTH_LOGIN_PROMPT_TO_SOCIAL_GAP,
  AUTH_LOGIN_WELCOME_TO_TAGLINE_GAP,
  AUTH_OR_DIVIDER_GAP,
  getAuthContentWidth,
  getAuthElevatedSurfaceColor,
  getAuthOrDividerLineWidth,
  getAuthPrimaryButtonWidth,
} from './authLayout';

describe('getAuthContentWidth', () => {
  it('clamps to max width on wide screens (448pt)', () => {
    expect(getAuthContentWidth(448)).toBe(AUTH_CONTENT_MAX_WIDTH);
  });

  it('uses available width on large iPhone (430pt)', () => {
    expect(getAuthContentWidth(430)).toBe(430 - AUTH_FORM_HORIZONTAL_PADDING * 2);
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

describe('login spacing tokens', () => {
  it('defines a descending visual rhythm from hero to social', () => {
    expect(AUTH_LOGIN_HERO_TO_FORM_GAP).toBeGreaterThan(AUTH_LOGIN_FORGOT_TO_ACTIONS_GAP);
    expect(AUTH_LOGIN_FORGOT_TO_ACTIONS_GAP).toBeGreaterThanOrEqual(AUTH_LOGIN_CTA_TO_PROMPT_GAP);
    expect(AUTH_LOGIN_PROMPT_TO_SOCIAL_GAP).toBeGreaterThan(AUTH_LOGIN_CTA_TO_PROMPT_GAP);
  });

  it('exposes v3 login hero and form rhythm tokens', () => {
    expect(AUTH_LOGIN_LOGO_SIZE).toBe(88);
    expect(AUTH_LOGIN_LOGO_CORNER_RADIUS).toBe(20);
    expect(AUTH_LOGIN_HERO_INTERNAL_GAP).toBe(AUTH_LOGIN_WELCOME_TO_TAGLINE_GAP);
    expect(AUTH_LOGIN_FIELD_LABEL_GAP).toBe(6);
    expect(AUTH_LOGIN_FIELD_STACK_GAP).toBe(16);
    expect(AUTH_LOGIN_HERO_TO_FORM_GAP).toBe(24);
    expect(AUTH_LOGIN_FORM_TO_FORGOT_GAP).toBe(12);
    expect(AUTH_LOGIN_FORGOT_TO_ACTIONS_GAP).toBe(12);
    expect(AUTH_LOGIN_FORM_TO_ACTIONS_GAP).toBe(AUTH_LOGIN_FORM_TO_CTA_GAP);
    expect(AUTH_FIELD_LABELED_ROW_MIN_HEIGHT).toBeGreaterThan(AUTH_FIELD_ROW_MIN_HEIGHT);
  });

  it('returns elevated surface color for dark and light auth cards', () => {
    expect(
      getAuthElevatedSurfaceColor(
        { systemBackground: '#FFFFFF', secondarySystemBackground: '#F2F2F7' },
        false,
      ),
    ).toBe('#FFFFFF');
    expect(
      getAuthElevatedSurfaceColor(
        { systemBackground: '#000000', secondarySystemBackground: '#1C1C1E' },
        true,
      ),
    ).toBe('#1C1C1E');
  });
});
