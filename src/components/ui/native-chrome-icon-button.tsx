import type { ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Button, Host, Image as SwiftImage, ProgressView } from '@expo/ui/swift-ui';
import {
  accessibilityHint as swiftAccessibilityHint,
  accessibilityLabel as swiftAccessibilityLabel,
  accessibilityValue as swiftAccessibilityValue,
  background,
  buttonStyle,
  disabled as swiftDisabled,
  font,
  frame,
  glassEffect,
  opacity,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';

export type ChromeVariant = 'glass' | 'solid';

type NativeChromeIconButtonProps = {
  name: AppIconName;
  accessibilityLabel: string;
  /** State read after the label, e.g. "On" / "Off" for a toggle-like control. */
  accessibilityValue?: string;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
  /** A spinner in place of the glyph (e.g. while saving); the button is inert meanwhile. */
  busy?: boolean;
  size?: number;
  iconSize?: number;
  /** SF Symbol weight, e.g. `semibold` for the chat composer's accent glyphs. */
  iconWeight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Fill under the glass (a dark wash over media; `transparent` for pure glass). */
  backgroundColor: string;
  tintColor: ColorValue;
  /** `solid` skips Liquid Glass to avoid iOS ambient dimming over fullscreen media. */
  chromeVariant?: ChromeVariant;
  /** Pin the glass appearance (e.g. `dark` on cinema surfaces, the app theme in chat). */
  colorScheme?: 'light' | 'dark';
};

export function NativeChromeIconButton({
  name,
  accessibilityLabel,
  accessibilityValue,
  accessibilityHint,
  onPress,
  disabled,
  busy = false,
  size = 48,
  iconSize = APP_ICON_SIZE.xl,
  iconWeight,
  backgroundColor,
  tintColor,
  chromeVariant = 'glass',
  colorScheme,
}: NativeChromeIconButtonProps) {
  return (
    // A fixed-size control: SwiftUI must not inset it for the keyboard or the safe area (in the
    // chat composer, which rides the keyboard, it would jump above its row).
    <Host
      matchContents
      colorScheme={colorScheme}
      ignoreSafeArea="all"
      style={{ width: size, height: size }}>
      <Button
        onPress={disabled || busy ? undefined : onPress}
        modifiers={[
          buttonStyle('plain'),
          frame({ width: size, height: size }),
          background(backgroundColor, shapes.circle()),
          ...(chromeVariant === 'glass'
            ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'circle' as const })]
            : []),
          swiftAccessibilityLabel(accessibilityLabel),
          ...(accessibilityValue ? [swiftAccessibilityValue(accessibilityValue)] : []),
          ...(accessibilityHint ? [swiftAccessibilityHint(accessibilityHint)] : []),
          swiftDisabled(Boolean(disabled) || busy),
        ]}>
        {/* Disabled dims the glyph only: fading the glass itself looks broken. */}
        {busy ? (
          <ProgressView modifiers={[tint(tintColor as string)]} />
        ) : (
          <SwiftImage
            systemName={resolveAppIconName(name) as SFSymbol}
            size={iconSize}
            color={tintColor}
            modifiers={[
              ...(iconWeight ? [font({ size: iconSize, weight: iconWeight })] : []),
              opacity(disabled ? 0.45 : 1),
            ]}
          />
        )}
      </Button>
    </Host>
  );
}
