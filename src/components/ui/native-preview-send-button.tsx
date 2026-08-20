import { Platform, StyleSheet, Text } from 'react-native';
import type { ColorValue } from 'react-native';
import { Button, HStack, Host, Image as SwiftImage, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  bold,
  buttonStyle,
  foregroundStyle,
  frame,
  glassEffect,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { AppIcon } from './app-icon';
import { PressableScale } from './pressable-scale';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { typography } from '../../theme/typography';
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
};

export function NativePreviewSendButton({
  label,
  accessibilityLabel,
  onPress,
  backgroundColor,
  tintColor,
  chromeVariant = 'glass',
}: NativePreviewSendButtonProps) {
  if (Platform.OS !== 'ios') {
    return (
      <PressableScale
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.fallbackButton, { backgroundColor }]}>
        <Text style={[styles.fallbackText, { color: tintColor }]}>{label}</Text>
        <AppIcon name="chevronRight" size={APP_ICON_SIZE.sm} color={tintColor} />
      </PressableScale>
    );
  }

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
        onPress={onPress}
        modifiers={[
          buttonStyle('plain'),
          swiftAccessibilityLabel(accessibilityLabel),
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
          <SwiftText modifiers={[foregroundStyle(tintColor as string), bold()]}>{label}</SwiftText>
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

const styles = StyleSheet.create({
  fallbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 4,
    minHeight: SEND_BUTTON_HEIGHT,
    maxWidth: SEND_BUTTON_MAX_WIDTH,
  },
  fallbackText: {
    ...typography.callout,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
