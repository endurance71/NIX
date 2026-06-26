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
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { AppIcon } from './app-icon';
import { typography } from '../../theme/typography';

type NativePreviewSendButtonProps = {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  backgroundColor: string;
  tintColor: ColorValue;
};

export function NativePreviewSendButton({
  label,
  accessibilityLabel,
  onPress,
  backgroundColor,
  tintColor,
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
          background(backgroundColor, shapes.capsule()),
          padding({ leading: 20, trailing: 16, top: 12, bottom: 12 }),
          swiftAccessibilityLabel(accessibilityLabel),
        ]}>
        <HStack spacing={4} alignment="center" modifiers={[frame({ minHeight: 24 })]}>
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
