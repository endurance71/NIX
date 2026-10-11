import { describe, expect, it } from 'vitest';
import { isNativeSettingsToggleEnabled, resolveNativeSettingsRowKind } from './nativeSettingsRow';

const noop = () => {};

describe('resolveNativeSettingsRowKind', () => {
  it('renders a known switch value as a toggle, even when the row also has onPress', () => {
    expect(resolveNativeSettingsRowKind({ switchValue: false })).toBe('toggle');
    expect(resolveNativeSettingsRowKind({ switchValue: true, onPress: noop })).toBe('toggle');
  });

  it('is a button only when it has an action', () => {
    expect(resolveNativeSettingsRowKind({ onPress: noop })).toBe('button');
    expect(resolveNativeSettingsRowKind({})).toBe('static');
    expect(resolveNativeSettingsRowKind({ switchValue: undefined })).toBe('static');
  });
});

describe('isNativeSettingsToggleEnabled', () => {
  it('keeps the switch visible but disabled without a handler or when disabled', () => {
    expect(isNativeSettingsToggleEnabled({ onSwitchValueChange: noop })).toBe(true);
    expect(isNativeSettingsToggleEnabled({ onSwitchValueChange: noop, disabled: true })).toBe(false);
    expect(isNativeSettingsToggleEnabled({})).toBe(false);
  });
});
