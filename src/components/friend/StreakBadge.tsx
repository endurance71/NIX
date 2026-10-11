import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useFriendshipBadge } from '../../hooks/useFriendshipBadges';
import {
  formatFriendshipBadge,
  friendshipBadgeAccessibilityLabel,
  type FriendshipBadge,
} from '../../lib/friendStreaks';
import { typography } from '../../theme/typography';

export type FriendshipBadgeText = {
  /** „💛 🔥 12 ⌛” */
  text: string;
  /** „Najlepszy przyjaciel, seria 12 dni, seria się kończy” — for a combined VoiceOver label. */
  accessibilityLabel: string;
};

/**
 * Text + spoken label of a friend's streak / best-friend badge, `null` when there is nothing to
 * show (no streak, not a best friend, or the backend has no streak migration yet). Use it to put
 * the badge into a parent's combined accessibility label (e.g. the chat header button).
 */
export function usePeerFriendshipBadgeText(
  peerId: string | null | undefined,
): FriendshipBadgeText | null {
  const { t } = useTranslation();
  const badge = useFriendshipBadge(peerId);
  const text = formatFriendshipBadge(badge);
  return text ? { text, accessibilityLabel: friendshipBadgeAccessibilityLabel(badge, t) } : null;
}

type StreakBadgeProps = {
  badge: FriendshipBadge | null | undefined;
  style?: StyleProp<TextStyle>;
  /** Cap for Dynamic Type in compact chrome (e.g. the navigation bar title). */
  maxFontSizeMultiplier?: number;
  /** Hide from VoiceOver when the parent already speaks the badge (see `usePeerFriendshipBadgeText`). */
  decorative?: boolean;
};

/**
 * React Native streak / best-friend badge („🔥 12”, „⌛” when the streak is about to end, „😊”/„💛”
 * for best friends). Renders nothing when there is no badge.
 */
export function StreakBadge({
  badge,
  style,
  maxFontSizeMultiplier,
  decorative = false,
}: StreakBadgeProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const text = formatFriendshipBadge(badge);
  if (!text) return null;
  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessibilityLabel={decorative ? undefined : friendshipBadgeAccessibilityLabel(badge, t)}
      style={[
        typography.footnote,
        { color: colors.label, fontWeight: '600', fontVariant: ['tabular-nums'], flexShrink: 0 },
        style,
      ]}>
      {text}
    </Text>
  );
}

/**
 * Drop-in badge for one friend (chat header): `<PeerStreakBadge peerId={peerId} decorative />`
 * next to the name, with `usePeerFriendshipBadgeText(peerId)?.accessibilityLabel` appended to the
 * header's combined label.
 */
export function PeerStreakBadge({
  peerId,
  ...props
}: Omit<StreakBadgeProps, 'badge'> & { peerId: string | null | undefined }) {
  const badge = useFriendshipBadge(peerId);
  return <StreakBadge badge={badge} {...props} />;
}
