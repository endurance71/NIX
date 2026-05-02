export const APP_FONT_FAMILY = 'SF Pro Rounded';

export type TypographyRole =
  | 'largeTitle'
  | 'title2'
  | 'headline'
  | 'body'
  | 'callout'
  | 'footnote'
  | 'caption';

export const typography = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
  },
  body: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
  },
  callout: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
  },
} as const;
