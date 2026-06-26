/** Shared spacing for auth screens using `AuthFormLayout` + `FieldGroup`. */
export const AUTH_FORM_HORIZONTAL_PADDING = 24;

export const AUTH_CONTENT_MAX_WIDTH = 400;

export const AUTH_BRAND_ICON_SIZE = 72;

/** Outer frame around the app mark (padding included). */
export const AUTH_BRAND_FRAME_SIZE = 88;

export const AUTH_BRAND_TOP_PADDING = 16;

export const AUTH_BRAND_BOTTOM_GAP = 4;

export const AUTH_HERO_BOTTOM_GAP = 28;

export const AUTH_SECTION_GAP = 20;

export const AUTH_FIELD_GROUP_GAP = 8;

export const AUTH_ACTIONS_TOP_GAP = 12;

export const AUTH_SOCIAL_TOP_GAP = 20;

export const AUTH_SOCIAL_BUTTON_HEIGHT = 50;

export const AUTH_PRIMARY_BUTTON_MIN_HEIGHT = 52;

export const AUTH_BRAND_RADIUS = 20;

/** Estimated inner inset on both sides of FieldGroup content (platform form chrome). */
const AUTH_FIELD_GROUP_HORIZONTAL_INSET = 12;

const AUTH_CONTENT_MIN_WIDTH = 260;

/** Width for full-bleed controls inside auth forms (social buttons, etc.). */
export function getAuthContentWidth(windowWidth: number): number {
  const horizontalInset = AUTH_FORM_HORIZONTAL_PADDING * 2 + AUTH_FIELD_GROUP_HORIZONTAL_INSET;
  const raw = windowWidth - horizontalInset;
  return Math.min(AUTH_CONTENT_MAX_WIDTH, Math.max(AUTH_CONTENT_MIN_WIDTH, raw));
}
