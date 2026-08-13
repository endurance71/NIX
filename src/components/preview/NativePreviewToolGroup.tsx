import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Button, Host, HStack, Image as SwiftImage } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  buttonStyle,
  disabled as swiftDisabled,
  frame,
  glassEffect,
  opacity,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { AppIcon } from '../ui/app-icon';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';

const BUTTON_SIZE = 44;
const OUTER_PADDING = 2;

type Tool = {
  name: AppIconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
};

type NativePreviewToolGroupProps = {
  tools: Tool[];
  backgroundColor: string;
  tintColor: ColorValue;
};

function canUseLiquidGlass() {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

export function NativePreviewToolGroup({
  tools,
  backgroundColor,
  tintColor,
}: NativePreviewToolGroupProps) {
  if (Platform.OS !== 'ios') {
    return (
      <View style={[styles.fallback, { backgroundColor }]}>
        {tools.map((tool) => (
          <Pressable
            key={tool.name}
            accessibilityRole="button"
            accessibilityLabel={tool.accessibilityLabel}
            accessibilityState={{ disabled: tool.disabled }}
            disabled={tool.disabled}
            onPress={tool.onPress}
            style={[styles.fallbackButton, tool.disabled && styles.disabled]}>
            <AppIcon name={tool.name} size={APP_ICON_SIZE.xl} color={tintColor} />
          </Pressable>
        ))}
      </View>
    );
  }

  const useGlass = canUseLiquidGlass();
  return (
    <Host matchContents style={styles.host}>
      <HStack
        spacing={0}
        alignment="center"
        modifiers={[
          padding({ all: OUTER_PADDING }),
          ...(useGlass
            ? [
                glassEffect({
                  glass: { variant: 'regular', interactive: true },
                  shape: 'capsule' as const,
                }),
              ]
            : [background(backgroundColor, shapes.capsule())]),
        ]}>
        {tools.map((tool) => (
          <Button
            key={tool.name}
            onPress={tool.disabled ? undefined : tool.onPress}
            modifiers={[
              buttonStyle('plain'),
              frame({ width: BUTTON_SIZE, height: BUTTON_SIZE }),
              swiftAccessibilityLabel(tool.accessibilityLabel),
              swiftDisabled(Boolean(tool.disabled)),
              opacity(tool.disabled ? 0.35 : 1),
            ]}>
            <SwiftImage
              systemName={resolveAppIconName(tool.name) as SFSymbol}
              size={APP_ICON_SIZE.xl}
              color={tintColor}
            />
          </Button>
        ))}
      </HStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { alignSelf: 'center' },
  fallback: {
    flexDirection: 'row',
    borderRadius: (BUTTON_SIZE + OUTER_PADDING * 2) / 2,
    padding: OUTER_PADDING,
  },
  fallbackButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
});
