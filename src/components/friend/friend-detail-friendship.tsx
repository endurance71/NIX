import type { TFunction } from 'i18next';
import type { FriendshipBadge } from '../../lib/friendStreaks';
import { NativeSettingsRow, NativeSettingsSection } from '../ui/native-settings';

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
          icon="streak"
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
          icon="bestFriend"
          testID="friend-detail-best-friend"
        />
      ) : null}
    </NativeSettingsSection>
  );
}
