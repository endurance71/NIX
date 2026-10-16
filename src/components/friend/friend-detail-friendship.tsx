import type { TFunction } from 'i18next';
import { HStack, Text as SwiftText } from '@expo/ui/swift-ui';
import { accessibilityHidden, font, frame } from '@expo/ui/swift-ui/modifiers';
import { FRIENDSHIP_EMOJI, type FriendshipBadge } from '../../lib/friendStreaks';
import { NativeSettingsRow, NativeSettingsSection } from '../ui/native-settings';

/**
 * The row's leading glyph is the same emoji the badge shows next to the name (😊/💛/🔥/⌛),
 * not an unrelated SF Symbol (a blue heart next to 😊), sized like a settings icon.
 */
function FriendshipEmoji({ emoji }: { emoji: string }) {
  return (
    <HStack spacing={0} alignment="center" modifiers={[frame({ width: 26, alignment: 'center' }), accessibilityHidden(true)]}>
      <SwiftText modifiers={[font({ size: 20 })]}>{emoji}</SwiftText>
    </HStack>
  );
}

/**
 * Streak and best-friend status for one friend, with the emoji legend as the section footnote
 * (🔥 streak, ⌛ about to end, 😊 best friends, 💛 #1 for two weeks). Hidden when there is nothing
 * to show — including backends without the streak migration.
 */
export function FriendFriendshipSection({
  badge,
  t,
}: {
  badge: FriendshipBadge | null;
  t: TFunction;
}) {
  if (!badge || (!badge.level && badge.streakDays === 0)) return null;
  return (
    <NativeSettingsSection
      title={t('friendship.sectionTitle')}
      footer={t('friendship.legendFootnote')}>
      {badge.streakDays > 0 ? (
        <NativeSettingsRow
          title={t('friendship.streakDays', { count: badge.streakDays })}
          supportingText={badge.atRisk ? t('friendship.streakAtRiskHint') : t('friendship.streakKeepHint')}
          leading={<FriendshipEmoji emoji={badge.atRisk ? FRIENDSHIP_EMOJI.atRisk : FRIENDSHIP_EMOJI.streak} />}
          testID="friend-detail-streak"
        />
      ) : null}
      {badge.level ? (
        <NativeSettingsRow
          title={
            badge.level === 'topBestFriend'
              ? t('friendship.topBestFriendTitle')
              : t('friendship.bestFriendTitle')
          }
          supportingText={
            badge.level === 'topBestFriend'
              ? t('friendship.topBestFriendHint')
              : t('friendship.bestFriendHint')
          }
          leading={
            <FriendshipEmoji
              emoji={badge.level === 'topBestFriend' ? FRIENDSHIP_EMOJI.topBestFriend : FRIENDSHIP_EMOJI.bestFriend}
            />
          }
          testID="friend-detail-best-friend"
        />
      ) : null}
    </NativeSettingsSection>
  );
}
