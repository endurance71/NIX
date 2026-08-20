import { useId } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import {
  Button,
  GlassEffectContainer,
  Host,
  HStack,
  Namespace,
  Text as SwiftText,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  animation,
  Animation,
  background,
  bold,
  buttonStyle,
  disabled as swiftDisabled,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  glassEffectId,
  matchedGeometryEffect,
  monospacedDigit,
  opacity,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { LensOption } from '../../lib/cameraLenses';
import type { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const CHIP_WIDTH = 44;
const CHIP_HEIGHT = 34;
const CAPSULE_PAD = 3;

const SELECTION_SPRING = Animation.spring({ response: 0.38, dampingFraction: 0.82 });

function canUseLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

/** Compact camera-style labels: 0,5 · 1× · 2 · 5 */
function formatSwitcherLabel(option: LensOption): string {
  const factor = option.displayFactor;
  if (Math.abs(factor - 1) < 0.05) return '1×';
  if (factor < 1) {
    return factor.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
  if (Math.abs(factor - Math.round(factor)) < 0.08) {
    return String(Math.round(factor));
  }
  return factor.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

type NativeLensSwitcherProps = {
  options: LensOption[];
  activeLensId: string | null;
  onSelect: (lensOptionId: string) => void;
  disabled?: boolean;
  colors: ThemeColors;
};

/**
 * Liquid Glass capsule + sliding selection via matchedGeometryEffect (+ glassEffectId morph).
 * Animation lives on GlassEffectContainer — required for Liquid Glass transitions.
 */
export function NativeLensSwitcher({
  options,
  activeLensId,
  onSelect,
  disabled = false,
  colors,
}: NativeLensSwitcherProps) {
  const { isDark } = useAppTheme();
  const namespaceId = useId();
  const useGlass = canUseLiquidGlass();

  const selection =
    activeLensId && options.some((option) => option.id === activeLensId)
      ? activeLensId
      : (options.find((option) => option.id === '1x')?.id ?? options[0]?.id ?? '');

  const selectionIndex = Math.max(
    0,
    options.findIndex((option) => option.id === selection)
  );

  const pillOffsetX = CAPSULE_PAD + selectionIndex * CHIP_WIDTH;

  const fallbackPillStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withSpring(pillOffsetX, {
          damping: 18,
          stiffness: 220,
          mass: 0.7,
        }),
      },
    ],
  }));

  if (options.length === 0 || !selection) return null;

  const solidCapsuleFill = isDark ? colors.cameraControlBackground : '#FFFFFFB3';
  const solidSelectionFill = colors.accent;
  const capsuleHeight = CHIP_HEIGHT + CAPSULE_PAD * 2;
  const capsuleWidth = options.length * CHIP_WIDTH + CAPSULE_PAD * 2;

  if (Platform.OS !== 'ios') {
    return (
      <View
        style={[
          styles.fallbackCapsule,
          { backgroundColor: solidCapsuleFill, width: capsuleWidth },
        ]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fallbackPill,
            { backgroundColor: solidSelectionFill },
            fallbackPillStyle,
          ]}
        />
        {options.map((option) => {
          const isActive = option.id === selection;
          const label = formatSwitcherLabel(option);
          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Obiektyw ${label}`}
              accessibilityState={{ selected: isActive, disabled }}
              style={styles.fallbackChip}>
              <Text
                style={[
                  styles.fallbackLabel,
                  { color: isActive ? '#FFFFFF' : colors.label },
                  isActive && styles.fallbackLabelActive,
                ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  const chips = (
    <HStack
      spacing={0}
      alignment="center"
      modifiers={[
        padding({
          leading: CAPSULE_PAD,
          trailing: CAPSULE_PAD,
          top: CAPSULE_PAD,
          bottom: CAPSULE_PAD,
        }),
        ...(useGlass
          ? [
              glassEffect({
                glass: { variant: 'regular', interactive: true },
                shape: 'capsule' as const,
              }),
            ]
          : [background(solidCapsuleFill, shapes.capsule())]),
        animation(SELECTION_SPRING, selectionIndex),
        opacity(disabled ? 0.55 : 1),
      ]}>
      {options.map((option) => {
        const isActive = option.id === selection;
        const label = formatSwitcherLabel(option);
        return (
          <Button
            key={option.id}
            onPress={disabled ? undefined : () => onSelect(option.id)}
            modifiers={[
              buttonStyle('plain'),
              frame({ width: CHIP_WIDTH, height: CHIP_HEIGHT }),
              ...(isActive
                ? useGlass
                  ? [
                      glassEffect({
                        glass: {
                          variant: 'clear',
                          interactive: true,
                          tint: colors.accent,
                        },
                        shape: 'capsule' as const,
                      }),
                      glassEffectId('lens-selection', namespaceId),
                      matchedGeometryEffect('lens-selection-geometry', namespaceId),
                    ]
                  : [
                      background(solidSelectionFill, shapes.capsule()),
                      matchedGeometryEffect('lens-selection-geometry', namespaceId),
                    ]
                : []),
              swiftAccessibilityLabel(`Obiektyw ${label}`),
              swiftDisabled(disabled),
            ]}>
            <SwiftText
              modifiers={[
                foregroundStyle({ type: 'hierarchical', style: 'primary' }),
                font({ size: 13, weight: isActive ? 'bold' : 'semibold', design: 'rounded' }),
                monospacedDigit(),
                ...(isActive ? [bold()] : []),
              ]}>
              {label}
            </SwiftText>
          </Button>
        );
      })}
    </HStack>
  );

  return (
    <Host matchContents style={[styles.host, { width: capsuleWidth, height: capsuleHeight }]}>
      <Namespace id={namespaceId}>
        {useGlass ? (
          <GlassEffectContainer
            spacing={12}
            modifiers={[animation(SELECTION_SPRING, selectionIndex)]}>
            {chips}
          </GlassEffectContainer>
        ) : (
          chips
        )}
      </Namespace>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    alignSelf: 'center',
  },
  fallbackCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: CHIP_HEIGHT + CAPSULE_PAD * 2,
    paddingHorizontal: CAPSULE_PAD,
    borderRadius: 20,
    overflow: 'hidden',
  },
  fallbackPill: {
    position: 'absolute',
    top: CAPSULE_PAD,
    left: 0,
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
    borderRadius: CHIP_HEIGHT / 2,
  },
  fallbackChip: {
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackLabel: {
    ...typography.caption,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  fallbackLabelActive: {
    fontWeight: '700',
  },
});
