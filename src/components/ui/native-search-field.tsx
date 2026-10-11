import { useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Host } from '@expo/ui';
import {
  Button,
  HStack,
  Image as SwiftImage,
  Text as SwiftText,
  TextField,
  useNativeState,
  type TextFieldRef,
} from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityLabel as swiftAccessibilityLabel,
  autocorrectionDisabled,
  background,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  padding,
  shapes,
  submitLabel,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';

const FIELD_HEIGHT = 44;

type NativeSearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** VoiceOver label of the clear button. */
  clearAccessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  /** Imperative handle, e.g. to dismiss the keyboard after a result is picked. */
  ref?: Ref<NativeSearchFieldHandle>;
};

export type NativeSearchFieldHandle = { blur: () => void };

/**
 * A native SwiftUI search field on a Liquid Glass capsule (magnifying glass, text field, clear
 * button while there is a query) — the iOS 26 search-field look, in place of an RN `TextInput`
 * on a gray rounded rectangle. Below iOS 26 the capsule is the system gray fill.
 */
export function NativeSearchField({
  value,
  onChangeText,
  placeholder,
  clearAccessibilityLabel,
  style,
  ref,
}: NativeSearchFieldProps) {
  const { colors, colorScheme } = useAppTheme();
  const fieldRef = useRef<TextFieldRef>(null);
  useImperativeHandle(ref, () => ({
    blur: () => {
      void fieldRef.current?.blur();
    },
  }), []);
  const text = useNativeState(value);
  const useGlass = canUseLiquidGlass();

  const clear = () => {
    void fieldRef.current?.clear();
    onChangeText('');
  };

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={colorScheme}
      ignoreSafeArea="all"
      style={[styles.host, style]}>
      <HStack
        spacing={6}
        alignment="center"
        modifiers={[
          padding({ leading: 14, trailing: value ? 6 : 14 }),
          frame({ maxWidth: Infinity, minHeight: FIELD_HEIGHT }),
          ...(useGlass
            ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' })]
            : [background(colors.secondarySystemFill, shapes.capsule())]),
        ]}>
        <SwiftImage
          systemName={resolveAppIconName('search') as SFSymbol}
          size={APP_ICON_SIZE.sm}
          color={colors.secondaryLabel}
          modifiers={[accessibilityHidden(true)]}
        />
        <TextField
          ref={fieldRef}
          text={text}
          onTextChange={onChangeText}
          modifiers={[
            font({ textStyle: 'body' }),
            foregroundStyle(colors.label),
            textInputAutocapitalization('never'),
            autocorrectionDisabled(true),
            submitLabel('search'),
            swiftAccessibilityLabel(placeholder),
          ]}>
          <TextField.Placeholder>
            <SwiftText modifiers={[foregroundStyle(colors.secondaryLabel)]}>{placeholder}</SwiftText>
          </TextField.Placeholder>
        </TextField>
        {value ? (
          <Button
            onPress={clear}
            modifiers={[
              buttonStyle('plain'),
              frame({ width: 32, height: 32 }),
              swiftAccessibilityLabel(clearAccessibilityLabel),
            ]}>
            <SwiftImage
              systemName={resolveAppIconName('clearText') as SFSymbol}
              size={APP_ICON_SIZE.md}
              color={colors.tertiaryLabel}
            />
          </Button>
        ) : null}
      </HStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { alignSelf: 'stretch' },
});
