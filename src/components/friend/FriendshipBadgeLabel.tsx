import { useTranslation } from 'react-i18next';
import { Text } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityLabel,
  fixedSize,
  font,
  foregroundStyle,
  layoutPriority,
  lineLimit,
  monospacedDigit,
} from '@expo/ui/swift-ui/modifiers';
import {
  formatFriendshipBadge,
  friendshipBadgeAccessibilityLabel,
  type FriendshipBadge,
} from '../../lib/friendStreaks';

/**
 * SwiftUI streak / best-friend glyphs („💛 🔥 12 ⌛”) for native list rows (inbox, friends list).
 * Never truncated: the name next to it gives way first. `decorative` hides it from VoiceOver when
 * the row already speaks the badge in its own combined label. `compact` is the caption size used
 * next to a name under a pinned avatar (inbox grid).
 */
export function FriendshipBadgeLabel({
  badge,
  decorative = false,
  compact = false,
}: {
  badge: FriendshipBadge | null | undefined;
  decorative?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const text = formatFriendshipBadge(badge);
  if (!text) return null;
  return (
    <Text
      modifiers={[
        font({ design: 'rounded', textStyle: compact ? 'caption' : 'subheadline', weight: 'semibold' }),
        monospacedDigit(),
        foregroundStyle({ type: 'hierarchical', style: 'primary' }),
        lineLimit(1),
        fixedSize({ horizontal: true, vertical: false }),
        layoutPriority(3),
        decorative
          ? accessibilityHidden()
          : accessibilityLabel(friendshipBadgeAccessibilityLabel(badge, t)),
      ]}>
      {text}
    </Text>
  );
}
