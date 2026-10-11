import { useTranslation } from 'react-i18next';
import { Host } from '@expo/ui';
import { Button, HStack, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityHint as swiftAccessibilityHint,
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  buttonStyle,
  contentShape,
  disabled as swiftDisabled,
  font,
  frame,
  glassEffect,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { MessageReactionEmoji } from '../../types/database.types';
import {
  MESSAGE_REACTION_EMOJIS,
  MESSAGE_REACTION_GLYPHS,
} from '../../services/messageReactionService';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import type { ViewerEmojiMode } from '../../lib/viewerReactions';

const EMOJI_HIT = 48;
const EMOJI_GLYPH_SIZE = 30;

type ViewerEmojiRowProps = {
  /** `reaction`: a NiX reaction (tap the selected one again to remove); `text`: sent as a reply. */
  mode: ViewerEmojiMode;
  selected: MessageReactionEmoji | null;
  disabled: boolean;
  onPick: (emoji: MessageReactionEmoji) => void;
  /** Wash under the glass; the whole capsule below iOS 26. */
  fill: string;
  /** Selected reaction disc (iMessage Tapback: accent circle behind the glyph). */
  selectedFill: string;
};

/**
 * Quick-reply emoji over the reply field: native SwiftUI buttons on one Liquid Glass capsule,
 * like the Tapback bar. Each glyph is a 48 pt target with its own VoiceOver label.
 */
export function ViewerEmojiRow({ mode, selected, disabled, onPick, fill, selectedFill }: ViewerEmojiRowProps) {
  const { t } = useTranslation();
  const reactionMode = mode === 'reaction';
  return (
    <Host matchContents={{ vertical: true }} colorScheme="dark" ignoreSafeArea="all">
      <HStack
        spacing={0}
        alignment="center"
        modifiers={[
          padding({ horizontal: 6, vertical: 2 }),
          frame({ maxWidth: Infinity }),
          background(fill, shapes.capsule()),
          ...(canUseLiquidGlass()
            ? [glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' })]
            : []),
        ]}>
        {MESSAGE_REACTION_EMOJIS.map((emoji) => {
          const glyph = MESSAGE_REACTION_GLYPHS[emoji];
          const isSelected = reactionMode && selected === emoji;
          return (
            <Button
              key={emoji}
              onPress={() => onPick(emoji)}
              modifiers={[
                buttonStyle('plain'),
                swiftDisabled(disabled),
                swiftAccessibilityLabel(
                  reactionMode
                    ? t('viewer.nixReactionA11y', { emoji: glyph })
                    : t('viewer.reactionA11y', { emoji: glyph })
                ),
                ...(isSelected
                  ? [
                      swiftAccessibilityHint(t('viewer.nixReactionRemoveHint')),
                      accessibilityAddTraits(['isSelected']),
                    ]
                  : []),
              ]}>
              <SwiftText
                modifiers={[
                  font({ size: EMOJI_GLYPH_SIZE }),
                  frame({ width: EMOJI_HIT - 4, height: EMOJI_HIT - 4 }),
                  ...(isSelected ? [background(selectedFill, shapes.circle())] : []),
                  // Share the row evenly; the whole slot is the touch target.
                  frame({ maxWidth: Infinity, minHeight: EMOJI_HIT }),
                  contentShape(shapes.rectangle()),
                ]}>
                {glyph}
              </SwiftText>
            </Button>
          );
        })}
      </HStack>
    </Host>
  );
}
