import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { MESSAGE_REACTION_GLYPHS } from '../../services/messageReactionService';
import type { MessageReactionEmoji } from '../../types/database.types';

const BADGE_METRICS = {
  sm: { size: 20, glyph: 12, lineHeight: 15 },
  md: { size: 26, glyph: 15, lineHeight: 19 },
} as const;

export type NixReactionBadgeProps = {
  emoji: MessageReactionEmoji;
  /** `sm` (20 pt) for inbox rows, `md` (26 pt, default) for chat NiX chips. */
  size?: keyof typeof BADGE_METRICS;
  /**
   * `standalone` (default): the badge is its own VoiceOver element ("Reakcja: ❤️").
   * `decorative`: hidden from VoiceOver; the parent row then appends
   * `t('viewer.nixReactionBadgeA11y', { emoji: MESSAGE_REACTION_GLYPHS[emoji] })` to its label.
   */
  accessibility?: 'standalone' | 'decorative';
  /** Typically an absolute offset over the chip/row corner. */
  style?: StyleProp<ViewStyle>;
};

/** Small tapback-style emoji bubble showing the receiver's reaction to a NiX. */
export function NixReactionBadge({
  emoji,
  size = 'md',
  accessibility = 'standalone',
  style,
}: NixReactionBadgeProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const metrics = BADGE_METRICS[size];
  const glyph = MESSAGE_REACTION_GLYPHS[emoji];
  const standalone = accessibility === 'standalone';
  return (
    <View
      style={[
        {
          minWidth: metrics.size,
          height: metrics.size,
          borderRadius: metrics.size / 2,
          paddingHorizontal: 3,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.secondarySystemBackground,
          borderWidth: 1.5,
          borderColor: colors.systemBackground,
        },
        style,
      ]}
      pointerEvents="none"
      accessible={standalone}
      accessibilityRole={standalone ? 'text' : undefined}
      accessibilityLabel={standalone ? t('viewer.nixReactionBadgeA11y', { emoji: glyph }) : undefined}
      accessibilityElementsHidden={!standalone}
      importantForAccessibility={standalone ? 'yes' : 'no-hide-descendants'}>
      {/* Fixed size: the badge sits on a fixed-size chip; the glyph is not text to read. */}
      <Text
        style={{ fontSize: metrics.glyph, lineHeight: metrics.lineHeight }}
        allowFontScaling={false}>
        {glyph}
      </Text>
    </View>
  );
}
