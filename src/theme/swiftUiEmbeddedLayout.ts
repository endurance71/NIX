/**
 * React Native root inside `RNHostView` embedded in SwiftUI `List` with
 * `listStyle('insetGrouped')` does not receive the same horizontal insets as native
 * list rows. Jedna stała dla całej aplikacji — Profil, Skrzynka i inne listy RN + SwiftUI.
 */
export const SWIFT_UI_INSET_GROUPED_LIST_RN_ROW_PADDING = {
  paddingLeft: 44,
  paddingRight: 40,
} as const;
