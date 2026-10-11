// iOS has no installed family named "SF Pro Rounded"; RN maps `ui-rounded` to the system font's
// rounded design (UIFontDescriptorSystemDesignRounded), which is what this name was meant to be.
export const APP_FONT_FAMILY = 'ui-rounded';

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
  /** HIG Title 3 (20/25); semibold like the app's other headings. */
  title3: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600',
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
  /** HIG Subheadline (15/20): secondary rows, sheet descriptions, compact labels. */
  subheadline: {
    fontSize: 15,
    lineHeight: 20,
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
