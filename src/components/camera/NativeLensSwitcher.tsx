import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import {
  Button,
  GlassEffectContainer,
  Host,
  HStack,
  Namespace,
  Text as SwiftText,
} from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
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
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import type { LensOption } from '../../lib/cameraLenses';
import type { ThemeColors } from '../../theme/colors';

const CHIP_WIDTH = 44;
/** HIG minimum touch target; the capsule stays compact through its padding. */
const CHIP_HEIGHT = 44;
const CAPSULE_PAD = 3;

const SELECTION_SPRING = Animation.spring({ response: 0.38, dampingFraction: 0.82 });

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
  /** Live zoom of the active chip after a pinch (e.g. "1,6×"); null shows the preset label. */
  activeLabelOverride?: string | null;
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
  activeLabelOverride = null,
  onSelect,
  disabled = false,
  colors,
}: NativeLensSwitcherProps) {
  const { t } = useTranslation();
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

  if (options.length === 0 || !selection) return null;

  // Camera chrome is always dark (Host is pinned to the dark scheme below), in light mode too.
  const solidCapsuleFill = colors.cameraControlBackground;
  const solidSelectionFill = colors.accent;
  const capsuleHeight = CHIP_HEIGHT + CAPSULE_PAD * 2;
  const capsuleWidth = options.length * CHIP_WIDTH + CAPSULE_PAD * 2;

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
        const label = isActive && activeLabelOverride ? activeLabelOverride : formatSwitcherLabel(option);
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
              swiftAccessibilityLabel(t('camera.lensA11y', { label })),
              ...(isActive ? [accessibilityAddTraits(['isSelected'])] : []),
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
    <Host
      matchContents
      colorScheme="dark"
      style={[styles.host, { width: capsuleWidth, height: capsuleHeight }]}>
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
});
