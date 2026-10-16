import { HStack, Image as SwiftImage, Spacer, Text as SwiftText, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  font,
  foregroundStyle,
  frame,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  monospacedDigit,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';

const CARD_RADIUS = 26;
const BUBBLE_RADIUS = 18;
const AVATAR_SIZE = 34;
const CONTROL_SIZE = 36;
const LINE_HEIGHT = 8;

function withAlpha(hex: string, alphaHex: string): string {
  if (hex.length === 7 && hex.startsWith('#')) {
    return `${hex}${alphaHex}`;
  }
  return hex;
}

/** A rounded placeholder line standing in for text, so the preview needs no copy. */
function SkeletonLine({ width, color }: { width: number; color: string }) {
  return (
    <HStack spacing={0} modifiers={[frame({ width, height: LINE_HEIGHT }), background(color, shapes.capsule())]}>
      <Spacer />
    </HStack>
  );
}

/**
 * A miniature NiX chat that shows where the accent lands: the unread badge, your own bubble,
 * the composer's camera glyph and the send button. Everything else stays on system colors, so
 * the preview reads the same in light and dark mode.
 */
export function AccentAppearancePreview() {
  const { t } = useTranslation();
  const { colors, accentPresetId } = useAppTheme();
  const presetLabel = t(`profile.accentPresets.${accentPresetId}`);
  const a11yLabel = t('profile.accentAppearancePreviewA11y', { color: presetLabel });
  const neutralLine = colors.systemFill;
  const ownLine = withAlpha(colors.onAccent, '8C');

  return (
    <VStack
      spacing={12}
      alignment="leading"
      modifiers={[
        listRowBackground('transparent'),
        listRowSeparator('hidden'),
        listRowInsets({ top: 8, leading: 0, bottom: 4, trailing: 0 }),
        padding({ all: 16 }),
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        background(colors.secondarySystemGroupedBackground, shapes.roundedRectangle({ cornerRadius: CARD_RADIUS })),
        accessibilityElement('ignore'),
        swiftAccessibilityLabel(a11yLabel),
      ]}>
      <HStack spacing={10} alignment="center">
        <HStack
          spacing={0}
          modifiers={[
            frame({ width: AVATAR_SIZE, height: AVATAR_SIZE }),
            background(colors.secondarySystemFill, shapes.circle()),
          ]}>
          <SwiftImage
            systemName={resolveAppIconName('profile') as SFSymbol}
            size={APP_ICON_SIZE.lg}
            color={colors.secondaryLabel}
          />
        </HStack>
        <VStack spacing={6} alignment="leading">
          <SkeletonLine width={96} color={colors.tertiaryLabel} />
          <SkeletonLine width={58} color={neutralLine} />
        </VStack>
        <Spacer />
        <HStack
          spacing={0}
          modifiers={[
            padding({ leading: 8, trailing: 8, top: 3, bottom: 3 }),
            background(colors.accent, shapes.capsule()),
          ]}>
          <SwiftText
            modifiers={[
              font({ size: 13, weight: 'bold', design: 'rounded' }),
              monospacedDigit(),
              foregroundStyle(colors.onAccent),
            ]}>
            2
          </SwiftText>
        </HStack>
      </HStack>

      <HStack spacing={0}>
        <VStack
          spacing={7}
          alignment="leading"
          modifiers={[
            padding({ leading: 14, trailing: 14, top: 12, bottom: 12 }),
            background(colors.chatBubbleIncoming, shapes.roundedRectangle({ cornerRadius: BUBBLE_RADIUS })),
          ]}>
          <SkeletonLine width={150} color={neutralLine} />
          <SkeletonLine width={96} color={neutralLine} />
        </VStack>
        <Spacer />
      </HStack>

      <HStack spacing={0}>
        <Spacer />
        <VStack
          spacing={7}
          alignment="trailing"
          modifiers={[
            padding({ leading: 14, trailing: 14, top: 12, bottom: 12 }),
            background(colors.accent, shapes.roundedRectangle({ cornerRadius: BUBBLE_RADIUS })),
          ]}>
          <SkeletonLine width={128} color={ownLine} />
          <SkeletonLine width={72} color={ownLine} />
        </VStack>
      </HStack>

      <HStack spacing={10} alignment="center">
        <SwiftImage
          systemName={resolveAppIconName('camera') as SFSymbol}
          size={APP_ICON_SIZE.xl}
          color={colors.accentText}
        />
        <HStack
          spacing={0}
          alignment="center"
          modifiers={[
            padding({ leading: 14, trailing: 14 }),
            frame({ maxWidth: Infinity, minHeight: CONTROL_SIZE, maxHeight: CONTROL_SIZE, alignment: 'leading' }),
            background(colors.secondarySystemFill, shapes.capsule()),
          ]}>
          <SkeletonLine width={84} color={neutralLine} />
          <Spacer />
        </HStack>
        <HStack
          spacing={0}
          modifiers={[
            frame({ width: CONTROL_SIZE, height: CONTROL_SIZE }),
            background(colors.accent, shapes.circle()),
          ]}>
          <SwiftImage
            systemName={resolveAppIconName('send') as SFSymbol}
            size={APP_ICON_SIZE.md}
            color={colors.onAccent}
          />
        </HStack>
      </HStack>
    </VStack>
  );
}
