import { Platform } from 'react-native';
import { HStack, Image as SwiftImage, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  clipShape,
  frame,
  glassEffect,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';

const PREVIEW_HEIGHT = 200;
const CORNER_RADIUS = 26;

const PREVIEW_ICONS = ['trash', 'folder', 'arrow.uturn.backward'] as const satisfies readonly SFSymbol[];

function withAlpha(hex: string, alphaHex: string): string {
  if (hex.length === 7 && hex.startsWith('#')) {
    return `${hex}${alphaHex}`;
  }
  return hex;
}

export function AccentAppearancePreview() {
  const { t } = useTranslation();
  const { colors, accentPresetId } = useAppTheme();
  const accent = colors.accent;
  const presetLabel = t(`profile.accentPresets.${accentPresetId}`);
  const a11yLabel = t('profile.accentAppearancePreviewA11y', { color: presetLabel });

  return (
    <VStack
      alignment="center"
      modifiers={[
        listRowBackground('transparent'),
        listRowSeparator('hidden'),
        listRowInsets({ top: 8, leading: 0, bottom: 4, trailing: 0 }),
        frame({ maxWidth: Infinity, alignment: 'center' }),
        swiftAccessibilityLabel(a11yLabel),
      ]}>
      <ZStack
        alignment="center"
        modifiers={[
          frame({ maxWidth: Infinity, height: PREVIEW_HEIGHT }),
          background(colors.tertiarySystemBackground, shapes.roundedRectangle({ cornerRadius: CORNER_RADIUS })),
          clipShape('roundedRectangle', CORNER_RADIUS),
        ]}>
        <VStack
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity }),
            background(withAlpha(accent, '28'), shapes.roundedRectangle({ cornerRadius: CORNER_RADIUS })),
          ]}>
          {null}
        </VStack>
        <VStack
          modifiers={[
            frame({ width: 220, height: 140 }),
            background(withAlpha(accent, '40'), shapes.roundedRectangle({ cornerRadius: 48 })),
          ]}>
          {null}
        </VStack>
        <HStack
          spacing={28}
          alignment="center"
          modifiers={[
            padding({ leading: 28, trailing: 28, top: 16, bottom: 16 }),
            background(colors.cameraControlBackground, shapes.capsule()),
            ...(Platform.OS === 'ios'
              ? [glassEffect({ glass: { variant: 'regular', interactive: false }, shape: 'capsule' as const })]
              : []),
          ]}>
          {PREVIEW_ICONS.map((systemName) => (
            <SwiftImage key={systemName} systemName={systemName} size={22} color={accent} />
          ))}
        </HStack>
      </ZStack>
    </VStack>
  );
}
