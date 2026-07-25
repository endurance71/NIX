import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, HStack, Host, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  bold,
  buttonStyle,
  disabled as swiftDisabled,
  foregroundStyle,
  frame,
  glassEffect,
  monospacedDigit,
  opacity,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { LensOption } from '../../lib/cameraLenses';
import type { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { ChromeVariant } from '../ui/native-chrome-icon-button';

const CHIP_SIZE = 36;

function canUseLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

type NativeLensSwitcherProps = {
  options: LensOption[];
  activeLensId: string | null;
  onSelect: (lensOptionId: string) => void;
  disabled?: boolean;
  colors: ThemeColors;
  /**
   * `glass` (default) uses Liquid Glass on the capsule when the API is available.
   * `solid` skips glass — use if ambient dimming appears over the live preview.
   */
  chromeVariant?: ChromeVariant;
};

export function NativeLensSwitcher({
  options,
  activeLensId,
  onSelect,
  disabled = false,
  colors,
  chromeVariant = 'glass',
}: NativeLensSwitcherProps) {
  const useGlass = chromeVariant === 'glass' && canUseLiquidGlass();
  const tint = colors.cameraControlTint;
  const accent = colors.accent;
  const accentFill = `${colors.accent}33`;
  const capsuleBackground = colors.cameraControlBackground;

  if (Platform.OS !== 'ios') {
    return (
      <View style={[styles.fallbackCapsule, { backgroundColor: capsuleBackground }]}>
        {options.map((option) => {
          const isActive = option.id === activeLensId;
          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Obiektyw ${option.label}`}
              accessibilityState={{ selected: isActive, disabled }}
              style={[styles.fallbackChip, isActive && { backgroundColor: accentFill }]}>
              <Text
                style={[
                  styles.fallbackLabel,
                  { color: isActive ? accent : tint },
                  isActive && styles.fallbackLabelActive,
                ]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <Host matchContents>
      <HStack
        spacing={4}
        alignment="center"
        modifiers={[
          padding({ leading: 6, trailing: 6, top: 4, bottom: 4 }),
          background(capsuleBackground, shapes.capsule()),
          ...(useGlass
            ? [
                glassEffect({
                  glass: { variant: 'regular', interactive: true },
                  shape: 'capsule' as const,
                }),
              ]
            : []),
          opacity(disabled ? 0.55 : 1),
        ]}>
        {options.map((option) => {
          const isActive = option.id === activeLensId;
          return (
            <Button
              key={option.id}
              onPress={disabled ? undefined : () => onSelect(option.id)}
              modifiers={[
                buttonStyle('plain'),
                frame({ width: CHIP_SIZE, height: CHIP_SIZE }),
                ...(isActive ? [background(accentFill, shapes.circle())] : []),
                swiftAccessibilityLabel(`Obiektyw ${option.label}`),
                swiftDisabled(disabled),
              ]}>
              <SwiftText
                modifiers={[
                  foregroundStyle(isActive ? accent : tint),
                  monospacedDigit(),
                  ...(isActive ? [bold()] : []),
                ]}>
                {option.label}
              </SwiftText>
            </Button>
          );
        })}
      </HStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  fallbackCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 22,
  },
  fallbackChip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  fallbackLabelActive: {
    fontWeight: '700',
  },
});
