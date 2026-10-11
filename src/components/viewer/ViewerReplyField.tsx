import { useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import { Host } from '@expo/ui';
import {
  Button,
  HStack,
  Text as SwiftText,
  TextField,
  useNativeState,
  type TextFieldRef,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  buttonStyle,
  disabled as swiftDisabled,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  lineLimit,
  padding,
  shapes,
  submitLabel,
} from '@expo/ui/swift-ui/modifiers';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { canUseLiquidGlass } from '../../lib/liquidGlass';

/** One line of body text plus the vertical padding: the 44 pt pill of the old RN field. */
const FIELD_MIN_HEIGHT = 44;
const FIELD_RADIUS = FIELD_MIN_HEIGHT / 2;
/** ≈120 pt of body text, like the RN field's `maxHeight`. */
const FIELD_MAX_LINES = 5;

export type ViewerReplyFieldRef = {
  focus: () => void;
  blur: () => void;
  clear: () => void;
};

export type ViewerReplyFieldTrailing = {
  glyph: string;
  accessibilityLabel: string;
  onPress: () => void;
};

type ViewerReplyFieldProps = {
  ref?: Ref<ViewerReplyFieldRef>;
  placeholder: string;
  accessibilityLabel: string;
  maxLength: number;
  editable: boolean;
  onChangeText?: (text: string) => void;
  /** Return key: receives the text without the line break the key would have typed. */
  onSubmit: (text: string) => void;
  onFocusChange: (focused: boolean) => void;
  /** Own NiX reaction at the end of the pill (opens the emoji row). */
  trailing?: ViewerReplyFieldTrailing | null;
  textColor: string;
  placeholderColor: string;
  /**
   * Dark wash under the glass (keeps white text legible over bright media, like the chrome
   * buttons); on its own it is the capsule below iOS 26, where `glassEffect` draws nothing.
   */
  fill: string;
};

/**
 * True when `next` is `prev` with exactly one line break typed into it (the Return key).
 * A paste of multi-line text adds more than one character, so it stays in the field.
 */
function isReturnKeystroke(prev: string, next: string): boolean {
  'worklet';
  if (next.length !== prev.length + 1) return false;
  const index = next.indexOf('\n');
  if (index < 0) return false;
  return next.slice(0, index) + next.slice(index + 1) === prev;
}

/**
 * The viewer's reply field: a native SwiftUI `TextField` on a Liquid Glass capsule.
 *
 * It grows to five lines like the RN field it replaced. A vertical SwiftUI `TextField` types a
 * line break on Return instead of submitting, so the change worklet (UI thread, before the
 * frame is drawn) takes the break back out and sends — Return still means "send" here.
 * Keyboard avoidance stays with the viewer's bottom bar (`useAnimatedKeyboard`); the host
 * ignores the keyboard safe area so SwiftUI does not shift the field a second time.
 */
export function ViewerReplyField({
  ref,
  placeholder,
  accessibilityLabel,
  maxLength,
  editable,
  onChangeText,
  onSubmit,
  onFocusChange,
  trailing,
  textColor,
  placeholderColor,
  fill,
}: ViewerReplyFieldProps) {
  const fieldRef = useRef<TextFieldRef>(null);
  const text = useNativeState('');
  const lastText = useSharedValue('');
  const useGlass = canUseLiquidGlass();

  useImperativeHandle(ref, () => ({
    focus: () => void fieldRef.current?.focus(),
    blur: () => void fieldRef.current?.blur(),
    clear: () => {
      lastText.set('');
      void fieldRef.current?.clear();
    },
  }));

  const handleTextChange = (next: string) => {
    'worklet';
    const prev = lastText.get();
    if (isReturnKeystroke(prev, next)) {
      text.set(prev);
      scheduleOnRN(onSubmit, prev);
      return;
    }
    lastText.set(next);
    if (onChangeText) scheduleOnRN(onChangeText, next);
  };

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme="dark"
      ignoreSafeArea="all"
      style={styles.host}>
      <HStack
        spacing={8}
        alignment="bottom"
        modifiers={[
          padding({ leading: 16, trailing: trailing ? 10 : 16, vertical: 11 }),
          frame({ maxWidth: Infinity, minHeight: FIELD_MIN_HEIGHT, alignment: 'leading' }),
          background(fill, shapes.roundedRectangle({ cornerRadius: FIELD_RADIUS })),
          ...(useGlass
            ? [
                glassEffect({
                  glass: { variant: 'regular', interactive: true },
                  shape: 'roundedRectangle',
                  cornerRadius: FIELD_RADIUS,
                }),
              ]
            : []),
        ]}>
        <TextField
          ref={fieldRef}
          text={text}
          axis="vertical"
          maxLength={maxLength}
          onTextChange={handleTextChange}
          onFocusChange={onFocusChange}
          modifiers={[
            font({ textStyle: 'body' }),
            foregroundStyle(textColor),
            lineLimit({ min: 1, max: FIELD_MAX_LINES }),
            submitLabel('send'),
            swiftDisabled(!editable),
            swiftAccessibilityLabel(accessibilityLabel),
          ]}>
          <TextField.Placeholder>
            <SwiftText modifiers={[foregroundStyle(placeholderColor)]}>{placeholder}</SwiftText>
          </TextField.Placeholder>
        </TextField>
        {trailing ? (
          <Button
            onPress={trailing.onPress}
            modifiers={[
              buttonStyle('plain'),
              frame({ minWidth: 28, height: 22 }),
              swiftAccessibilityLabel(trailing.accessibilityLabel),
            ]}>
            <SwiftText modifiers={[font({ size: 20 })]}>{trailing.glyph}</SwiftText>
          </Button>
        ) : null}
      </HStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
