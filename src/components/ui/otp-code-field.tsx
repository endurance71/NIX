import { use, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { TextInput, type TextInputRef } from '@expo/ui';
import { HStack, Text, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  background,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  opacity,
  shapes,
  strokeBorder,
} from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { OTP_CODE_LENGTH, sanitizeOtpCode } from '../../lib/otpCode';
import { AuthContentWidthContext } from './auth-content-width';

const BOX_HEIGHT = 56;
const BOX_SPACING = 8;
const BOX_CORNER_RADIUS = 12;
const MAX_BOX_WIDTH = 64;
// An inset-grouped list row: 20 pt list margin and 16 pt row padding on each side.
const LIST_ROW_HORIZONTAL_INSET = 72;

type OtpCodeFieldProps = {
  value: string;
  onChange: (code: string) => void;
  /** Called once all digits are in, e.g. to submit without a tap. */
  onComplete?: (code: string) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  autoFocus?: boolean;
  testID?: string;
};

/**
 * One digit per box. A single native field sits invisibly on top of the boxes and takes every
 * tap, so iOS still offers the code from Mail above the keyboard ("one-time-code") and pasting a
 * whole code fills all boxes at once.
 */
export function OtpCodeField({
  value,
  onChange,
  onComplete,
  accessibilityLabel,
  disabled = false,
  autoFocus = false,
  testID,
}: OtpCodeFieldProps) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(autoFocus);
  const inputRef = useRef<TextInputRef>(null);
  // The field keeps its own text; when the screen resets the code (e.g. after a wrong one), empty
  // it too so the boxes and the field agree.
  useEffect(() => {
    if (value === '') inputRef.current?.clear();
  }, [value]);
  const activeIndex = Math.min(value.length, OTP_CODE_LENGTH - 1);
  // SwiftUI does not stretch an empty box, so every box gets a fixed width: the auth column
  // inside an auth layout, otherwise a list row.
  const { width: windowWidth } = useWindowDimensions();
  const columnWidth = use(AuthContentWidthContext)?.contentWidth ?? windowWidth - LIST_ROW_HORIZONTAL_INSET;
  const boxWidth = Math.min(
    MAX_BOX_WIDTH,
    Math.floor((columnWidth - BOX_SPACING * (OTP_CODE_LENGTH - 1)) / OTP_CODE_LENGTH)
  );
  const rowWidth = boxWidth * OTP_CODE_LENGTH + BOX_SPACING * (OTP_CODE_LENGTH - 1);

  return (
    <ZStack modifiers={[frame({ width: rowWidth, height: BOX_HEIGHT })]}>
      <HStack spacing={BOX_SPACING} modifiers={[accessibilityHidden(true)]}>
        {Array.from({ length: OTP_CODE_LENGTH }, (_, index) => {
          const active = focused && !disabled && index === activeIndex;
          return (
            <ZStack
              key={index}
              modifiers={[
                frame({ width: boxWidth, height: BOX_HEIGHT }),
                background(colors.secondarySystemFill, shapes.roundedRectangle({ cornerRadius: BOX_CORNER_RADIUS })),
                strokeBorder({
                  content: active ? colors.accent : colors.separator,
                  style: { lineWidth: active ? 2 : 1 },
                  shape: 'roundedRectangle',
                  cornerRadius: BOX_CORNER_RADIUS,
                }),
              ]}>
              <Text
                modifiers={[
                  font({ design: 'rounded', size: 26, weight: 'semibold' }),
                  monospacedDigit(),
                  foregroundStyle(colors.label),
                ]}>
                {value[index] ?? ''}
              </Text>
            </ZStack>
          );
        })}
      </HStack>
      <TextInput
        ref={inputRef}
        defaultValue={value}
        maxLength={OTP_CODE_LENGTH}
        onChangeText={(text) => {
          const code = sanitizeOtpCode(text);
          // Clearing after a reset echoes the same empty value; skip it so the screen's error stays.
          if (code === value) return;
          onChange(code);
          if (code.length === OTP_CODE_LENGTH) onComplete?.(code);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        autoCorrect={false}
        caretHidden
        autoFocus={autoFocus}
        editable={!disabled}
        placeholder={accessibilityLabel}
        // Only the boxes show the digits; the field stays tappable but its own text is invisible.
        textStyle={{ color: 'transparent' }}
        placeholderTextColor="transparent"
        selectionColor="transparent"
        modifiers={[frame({ width: rowWidth, height: BOX_HEIGHT }), opacity(0.011)]}
        testID={testID}
      />
    </ZStack>
  );
}
