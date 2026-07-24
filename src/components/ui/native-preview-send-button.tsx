import { Platform, Pressable, StyleSheet, Text } from 'react-native';
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
import { AppIcon } from './app-icon';
import { typography } from '../../theme/typography';
import type { ChromeVariant } from './native-chrome-icon-button';

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
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.fallbackButton, { backgroundColor }, pressed && styles.pressed]}>
        <Text style={[styles.fallbackText, { color: tintColor }]}>{label}</Text>
        <AppIcon name="chevronRight" size={16} color={tintColor} />
      </Pressable>
    );
  }

  return (
    <Host matchContents>
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
            frame({ minWidth: 136, height: 48 }),
            padding({ leading: 18, trailing: 14 }),
            background(backgroundColor, shapes.capsule()),
            ...(chromeVariant === 'glass'
              ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' as const })]
              : []),
          ]}>
          <SwiftText modifiers={[foregroundStyle(tintColor as string), bold()]}>{label}</SwiftText>
          <SwiftImage systemName="chevron.right" size={16} color={tintColor} />
        </HStack>
      </Button>
    </Host>
  );
}

const styles = StyleSheet.create({
  fallbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 4,
  },
  fallbackText: {
    ...typography.callout,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pressed: {
    opacity: 0.8,
  },
});
