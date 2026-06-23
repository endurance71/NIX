/**
 * React Native root inside `RNHostView` embedded in a native grouped list does not
 * receive the same horizontal insets as native list rows. Shared padding for
 * Profile, Inbox, and other hybrid RN + @expo/ui list screens.
 */
export const NATIVE_GROUPED_LIST_RN_ROW_PADDING = {
  paddingLeft: 44,
  paddingRight: 40,
} as const;

/** @deprecated Use NATIVE_GROUPED_LIST_RN_ROW_PADDING */
export const SWIFT_UI_INSET_GROUPED_LIST_RN_ROW_PADDING = NATIVE_GROUPED_LIST_RN_ROW_PADDING;
