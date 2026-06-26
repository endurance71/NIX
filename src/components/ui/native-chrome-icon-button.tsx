import { Platform, Pressable } from 'react-native';
import type { ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Button, Host, Image as SwiftImage } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  buttonStyle,
  disabled as swiftDisabled,
  frame,
  glassEffect,
  opacity,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { AppIcon } from './app-icon';
import { resolveAppIconName, type AppIconName } from '../../theme/app-icons';

type NativeChromeIconButtonProps = {
  name: AppIconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  iconSize?: number;
  backgroundColor: string;
  tintColor: ColorValue;
};

export function NativeChromeIconButton({
  name,
  accessibilityLabel,
  onPress,
  disabled,
  size = 48,
  iconSize = 22,
  backgroundColor,
  tintColor,
}: NativeChromeIconButtonProps) {
  if (Platform.OS !== 'ios') {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        hitSlop={15}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: disabled ? 0.45 : 1,
        }}>
        <AppIcon name={name} size={iconSize} color={tintColor} />
      </Pressable>
    );
  }

  return (
    <Host matchContents>
      <Button
        onPress={disabled ? undefined : onPress}
        modifiers={[
          buttonStyle('plain'),
          frame({ width: size, height: size }),
          background(backgroundColor, shapes.circle()),
          glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'circle' }),
          swiftAccessibilityLabel(accessibilityLabel),
          swiftDisabled(Boolean(disabled)),
          opacity(disabled ? 0.45 : 1),
        ]}>
        <SwiftImage systemName={resolveAppIconName(name) as SFSymbol} size={iconSize} color={tintColor} />
      </Button>
    </Host>
  );
}
