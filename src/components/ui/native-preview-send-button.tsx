import type { ColorValue } from 'react-native';
import { Button, HStack, Host, Image as SwiftImage, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  bold,
  buttonStyle,
  disabled as swiftDisabled,
  foregroundStyle,
  frame,
  glassEffect,
  lineLimit,
  opacity,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import type { ChromeVariant } from './native-chrome-icon-button';

const SEND_BUTTON_HEIGHT = 48;
const SEND_BUTTON_MIN_WIDTH = 120;
const SEND_BUTTON_MAX_WIDTH = 180;

type NativePreviewSendButtonProps = {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  backgroundColor: string;
  tintColor: ColorValue;
  /** `solid` skips Liquid Glass to avoid iOS ambient dimming over fullscreen media. */
  chromeVariant?: ChromeVariant;
  /** E.g. while a direct send is being secured; the label says why. */
  disabled?: boolean;
};

export function NativePreviewSendButton({
  label,
  accessibilityLabel,
  onPress,
  backgroundColor,
  tintColor,
  chromeVariant = 'glass',
  disabled = false,
}: NativePreviewSendButtonProps) {
  return (
    <Host
      matchContents
      style={{
        height: SEND_BUTTON_HEIGHT,
        minWidth: SEND_BUTTON_MIN_WIDTH,
        maxWidth: SEND_BUTTON_MAX_WIDTH,
        alignSelf: 'flex-end',
      }}>
      <Button
        onPress={disabled ? undefined : onPress}
        modifiers={[
          buttonStyle('plain'),
          swiftAccessibilityLabel(accessibilityLabel),
          swiftDisabled(disabled),
          opacity(disabled ? 0.6 : 1),
        ]}>
        <HStack
          spacing={6}
          alignment="center"
          modifiers={[
            frame({ minWidth: SEND_BUTTON_MIN_WIDTH, height: SEND_BUTTON_HEIGHT }),
            padding({ leading: 16, trailing: 12 }),
            background(backgroundColor, shapes.capsule()),
            ...(chromeVariant === 'glass'
              ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' as const })]
              : []),
          ]}>
          <SwiftText modifiers={[foregroundStyle(tintColor as string), bold(), lineLimit(1)]}>
            {label}
          </SwiftText>
          <SwiftImage
            systemName={resolveAppIconName('chevronRight') as SFSymbol}
            size={APP_ICON_SIZE.sm}
            color={tintColor}
          />
        </HStack>
      </Button>
    </Host>
  );
}
