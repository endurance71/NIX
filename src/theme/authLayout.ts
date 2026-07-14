/** Shared spacing for auth screens using `AuthFormLayout`. */
export const AUTH_FORM_HORIZONTAL_PADDING = 24;

export const AUTH_CONTENT_MAX_WIDTH = 400;

export const AUTH_LOGIN_TOP_PADDING = 32;

export const AUTH_SECONDARY_TOP_PADDING = 24;

export const AUTH_BRAND_ICON_SIZE = 72;

export const AUTH_FIELD_GROUP_CORNER_RADIUS = 14;

export const AUTH_FIELD_ROW_MIN_HEIGHT = 54;

export const AUTH_FIELD_INNER_PADDING = 16;

export const AUTH_FIELD_SEPARATOR_INSET = 16;

export const AUTH_SECTION_GAP = 20;

/** Login screen vertical rhythm — tighter than secondary auth screens. */
export const AUTH_LOGIN_HERO_GAP = 20;

export const AUTH_LOGIN_TITLE_TO_FORM_GAP = 16;

export const AUTH_LOGIN_FORM_INNER_GAP = 8;

export const AUTH_LOGIN_FORM_TO_CTA_GAP = 12;

export const AUTH_LOGIN_CTA_TO_PROMPT_GAP = 16;

export const AUTH_LOGIN_PROMPT_TO_SOCIAL_GAP = 20;

export const AUTH_ACTIONS_GAP = 12;

export const AUTH_SOCIAL_BUTTON_HEIGHT = 50;

export const AUTH_SOCIAL_BUTTON_RADIUS = 14;

export const AUTH_PRIMARY_BUTTON_HEIGHT = 52;

export const AUTH_PRIMARY_BUTTON_RADIUS = 14;

export const AUTH_OR_DIVIDER_GAP = 12;

export const AUTH_OR_DIVIDER_MIN_LINE_WIDTH = 24;

/** Approximate width of the "or" label at footnote/medium — used for line width math. */
export const AUTH_OR_DIVIDER_LABEL_CHAR_WIDTH = 7.5;

const AUTH_CONTENT_MIN_WIDTH = 260;

/** Width for full-bleed controls inside auth forms (CTA, social buttons, dividers). */
export function getAuthContentWidth(windowWidth: number): number {
  const horizontalInset = AUTH_FORM_HORIZONTAL_PADDING * 2;
  const raw = windowWidth - horizontalInset;
  return Math.min(AUTH_CONTENT_MAX_WIDTH, Math.max(AUTH_CONTENT_MIN_WIDTH, raw));
}

/** Half-line width for the auth "or" divider; avoids `maxWidth: Infinity` on separator shapes. */
export function getAuthOrDividerLineWidth(
  contentWidth: number,
  label: string,
  gap: number = AUTH_OR_DIVIDER_GAP,
): number {
  const labelWidth = Math.max(label.length * AUTH_OR_DIVIDER_LABEL_CHAR_WIDTH, 16);
  const available = contentWidth - labelWidth - gap * 2;
  return Math.max(AUTH_OR_DIVIDER_MIN_LINE_WIDTH, available / 2);
}

/** CTA width stays fixed while loading — same as idle content width. */
export function getAuthPrimaryButtonWidth(contentWidth: number, loading: boolean): number {
  void loading;
  return contentWidth;
}
