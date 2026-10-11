/**
 * How a settings row is built natively (W1/W2 in the UI review):
 * - `toggle`: a labelled SwiftUI `Toggle` — VoiceOver focuses the switch itself and reads its
 *   title and on/off value (never a Switch nested in a row Button);
 * - `button`: a tappable row (`ListItem` → SwiftUI `Button`);
 * - `static`: plain content (no button trait), read as one element.
 */
export type NativeSettingsRowKind = 'toggle' | 'button' | 'static';

export function resolveNativeSettingsRowKind({
  switchValue,
  onPress,
}: {
  switchValue?: boolean;
  onPress?: () => void;
}): NativeSettingsRowKind {
  // An unknown value (`undefined`) shows no switch at all, so nothing pretends to be a choice.
  if (typeof switchValue === 'boolean') return 'toggle';
  return onPress ? 'button' : 'static';
}

/** Offline or without a handler the switch stays visible but disabled — the row never jumps. */
export function isNativeSettingsToggleEnabled({
  disabled,
  onSwitchValueChange,
}: {
  disabled?: boolean;
  onSwitchValueChange?: (value: boolean) => void;
}): boolean {
  return !disabled && typeof onSwitchValueChange === 'function';
}
