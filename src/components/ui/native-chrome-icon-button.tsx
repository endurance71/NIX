import type { ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Button, Host, Image as SwiftImage } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  accessibilityValue as swiftAccessibilityValue,
  background,
  buttonStyle,
  disabled as swiftDisabled,
  frame,
  glassEffect,
  opacity,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';

export type ChromeVariant = 'glass' | 'solid';

type NativeChromeIconButtonProps = {
  name: AppIconName;
  accessibilityLabel: string;
  /** State read after the label, e.g. "On" / "Off" for a toggle-like control. */
  accessibilityValue?: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  iconSize?: number;
  backgroundColor: string;
  tintColor: ColorValue;
  /** `solid` skips Liquid Glass to avoid iOS ambient dimming over fullscreen media. */
  chromeVariant?: ChromeVariant;
};

export function NativeChromeIconButton({
  name,
  accessibilityLabel,
  accessibilityValue,
  onPress,
  disabled,
  size = 48,
  iconSize = APP_ICON_SIZE.xl,
  backgroundColor,
  tintColor,
  chromeVariant = 'glass',
}: NativeChromeIconButtonProps) {
  return (
    <Host matchContents style={{ width: size, height: size }}>
      <Button
        onPress={disabled ? undefined : onPress}
        modifiers={[
          buttonStyle('plain'),
          frame({ width: size, height: size }),
          background(backgroundColor, shapes.circle()),
          ...(chromeVariant === 'glass'
            ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'circle' as const })]
            : []),
          swiftAccessibilityLabel(accessibilityLabel),
          ...(accessibilityValue ? [swiftAccessibilityValue(accessibilityValue)] : []),
          swiftDisabled(Boolean(disabled)),
          opacity(disabled ? 0.45 : 1),
        ]}>
        <SwiftImage systemName={resolveAppIconName(name) as SFSymbol} size={iconSize} color={tintColor} />
      </Button>
    </Host>
  );
}
