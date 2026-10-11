import { Stack, useLocalSearchParams } from 'expo-router';
import { FriendDetailHeader } from '../../components/friend/friend-detail-header';
import { FriendFriendshipSection } from '../../components/friend/friend-detail-friendship';
import {
  FriendPreferencesSection,
  FriendQuickActionsSection,
  FriendSafetySection,
} from '../../components/friend/friend-detail-sections';
import { NativeSettingsEmptyRow, NativeSettingsSection } from '../../components/ui/native-settings';
import { SettingsListScreen } from '../../components/ui/settings-list-screen';
import { useFriendDetailScreen } from '../../hooks/useFriendDetailScreen';

/** One friend, like a contact card: profile, quick actions, permissions and safety actions. */
export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useFriendDetailScreen(id ?? '');
  const { friend, t } = vm;
  const title = friend ? friend.display_name?.trim() || `@${friend.username}` : '';

  return (
    <>
      <Stack.Screen options={{ title }} />
      <SettingsListScreen loading={vm.loading} onRefresh={vm.handleRefresh}>
        {friend ? (
          <>
            <NativeSettingsSection>
              <FriendDetailHeader
                friend={friend}
                avatarUrl={vm.avatarUrl}
                friendshipBadge={vm.friendshipBadge}
              />
            </NativeSettingsSection>
            <FriendQuickActionsSection vm={vm} />
            <FriendFriendshipSection badge={vm.friendshipBadge} t={vm.t} />
            <FriendPreferencesSection vm={vm} />
            <FriendSafetySection vm={vm} username={friend.username} />
          </>
        ) : (
          <NativeSettingsSection
            title={vm.notFound ? t('friends.notFoundTitle') : undefined}
            footer={vm.notFound ? t('friends.notFoundDescription') : undefined}>
            {vm.offlineWithoutData ? <NativeSettingsEmptyRow text={t('root.offlineCacheMissing')} /> : null}
          </NativeSettingsSection>
        )}
      </SettingsListScreen>
    </>
  );
}
