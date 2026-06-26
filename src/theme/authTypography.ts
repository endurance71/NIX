import type { UniversalFontWeight, UniversalTextStyle } from '@expo/ui';
import type { ThemeColors } from './colors';
import { APP_FONT_FAMILY } from './typography';

type AuthTextRoleDef = {
  fontSize: number;
  lineHeight: number;
  fontWeight: UniversalFontWeight;
  fontFamily: string;
};

export const authTextRoles = {
  brandTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
  },
  screenTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
  },
  fieldLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    fontFamily: APP_FONT_FAMILY,
  },
  inlineLink: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
  },
  footerPrompt: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
  },
  footerLink: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
  },
  socialButton: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
  },
  divider: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    fontFamily: APP_FONT_FAMILY,
  },
  tagline: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    fontFamily: APP_FONT_FAMILY,
  },
  brandWordmark: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
  },
} as const satisfies Record<string, AuthTextRoleDef>;

export type AuthTextRole = keyof typeof authTextRoles;

type AuthTextColorKey =
  | 'textPrimary'
  | 'textSecondary'
  | 'textMuted'
  | 'tertiaryLabel'
  | 'error'
  | 'accent'
  | 'label';

function resolveAuthTextColorKey(role: AuthTextRole): AuthTextColorKey {
  if (role === 'error') return 'error';
  if (role === 'inlineLink' || role === 'footerLink') return 'accent';
  if (role === 'tagline' || role === 'screenSubtitle' || role === 'divider') return 'textSecondary';
  if (role === 'fieldLabel') return 'textMuted';
  if (role === 'socialButton') return 'label';
  return 'textPrimary';
}

export function authTextStyle(
  role: AuthTextRole,
  colors: ThemeColors,
  colorKey?: AuthTextColorKey
): UniversalTextStyle {
  const roleStyle = authTextRoles[role];
  return {
    fontSize: roleStyle.fontSize,
    lineHeight: roleStyle.lineHeight,
    fontWeight: roleStyle.fontWeight,
    fontFamily: roleStyle.fontFamily,
    color: colors[colorKey ?? resolveAuthTextColorKey(role)],
  };
}

/** RN `Text` styles for bridged auth controls (links, divider, brand). */
export function authRnTextStyle(
  role: AuthTextRole,
  colors: ThemeColors,
  colorKey?: AuthTextColorKey
) {
  return authTextStyle(role, colors, colorKey);
}
