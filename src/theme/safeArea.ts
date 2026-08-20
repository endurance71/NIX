export const SCREEN_HORIZONTAL_GUTTER = 20;
export const SHEET_TOP_PADDING = 24;
export const SHEET_BOTTOM_MIN_PADDING = 16;
/** Clears floating icon-only NativeTabs under camera chrome (gallery / flip / lens). */
export const NATIVE_TAB_BAR_CAMERA_OFFSET = 52;
export const NATIVE_TAB_BAR_CONTENT_OFFSET = 132;
/** Gap below status bar / Dynamic Island for fullscreen media chrome (preview / viewer). */
export const MEDIA_CHROME_TOP_GAP = 16;
/** Gap above home indicator for fullscreen media chrome. */
export const MEDIA_CHROME_BOTTOM_GAP = 20;
/** Horizontal inset for fullscreen media chrome (plus safe-area left/right). */
export const MEDIA_CHROME_HORIZONTAL = SCREEN_HORIZONTAL_GUTTER;
/** iOS stack nav bar height (excluding status bar / safe area top). */
export const STACK_NAV_BAR_HEIGHT = 44;

export type ScreenInsetPolicy = 'fullscreen' | 'stackHeader' | 'tabStackList' | 'cameraTab' | 'sheet' | 'mediaChrome';

export type EdgeInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export function mergeInsets(base: EdgeInsets, extra: Partial<EdgeInsets>): EdgeInsets {
  return {
    top: base.top + (extra.top ?? 0),
    bottom: base.bottom + (extra.bottom ?? 0),
    left: base.left + (extra.left ?? 0),
    right: base.right + (extra.right ?? 0),
  };
}
