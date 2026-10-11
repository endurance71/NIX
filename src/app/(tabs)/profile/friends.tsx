import { TextInput } from '@expo/ui';
import { Stack, router } from 'expo-router';
import { Alert } from 'react-native';
import { useFriendsScreen } from '../../../hooks/useFriendsScreen';
import {
  NativeSettingsActionRow,
  NativeSettingsListStatus,
  NativeSettingsRow,
  NativeSettingsSection,
  NativeSettingsSwipeActions,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { FriendshipBadgeLabel } from '../../../components/friend/FriendshipBadgeLabel';
import { IncomingInviteRow } from '../../../components/inbox/IncomingInviteRow';
import {
  isFriendRowBusy,
  isIncomingRequestBusy,
  isOutgoingRequestBusy,
} from '../../../lib/profileFriendsPresentation';

export default function FriendsScreen() {
  const vm = useFriendsScreen();
  const inviteBusy = vm.inviteBusy;

  const confirmCancelInvite = (requestId: string, username: string) => {
    Alert.alert(
      vm.t('profile.cancelInviteConfirmTitle', { username }),
      vm.t('profile.cancelInviteConfirmMessage'),
      [
        { text: vm.t('common.cancel'), style: 'cancel' },
        {
          text: vm.t('profile.cancelInvite'),
          style: 'destructive',
          onPress: () => void vm.handleCancelOutgoing(requestId),
        },
      ]
    );
  };

  const confirmRemoveFriend = (friendId: string, username: string) => {
    Alert.alert(
      vm.t('profile.removeFriendConfirmTitle', { username }),
      vm.t('profile.removeFriendConfirmMessage'),
      [
        { text: vm.t('common.cancel'), style: 'cancel' },
        {
          text: vm.t('profile.removeFriend'),
          style: 'destructive',
          onPress: () => void vm.handleRemoveFriend(friendId, username),
        },
      ]
    );
  };

  return (
    <>
      <SettingsListScreen loading={vm.loading} onRefresh={vm.handleListRefresh}>
        {/* Things waiting for the user come first. */}
        {vm.requests.length > 0 ? (
          <NativeSettingsSection title={vm.t('profile.incomingInvites', { count: vm.requests.length })}>
            {vm.requests.map((request) => {
              const avatarPath = request.requester.avatar_storage_path ?? null;
              return (
                <IncomingInviteRow
                  key={request.id}
                  request={request}
                  avatarUrl={avatarPath ? vm.avatarUrls[avatarPath] ?? null : null}
                  busy={isIncomingRequestBusy(vm.busyKeys, request.id)}
                  enabled={vm.canPerformNetworkAction}
                  description={vm.t('inbox.inviteDescription')}
                  onAccept={() => void vm.handleAccept(request.id)}
                  onReject={() => void vm.handleReject(request.id)}
                  t={vm.t}
                />
              );
            })}
          </NativeSettingsSection>
        ) : null}

        <NativeSettingsSection title={vm.t('profile.addFriend')}>
          <NativeSettingsRow
            title={vm.t('profile.scanQr')}
            icon="qrcode"
            showsChevron
            onPress={() => router.push('/friend-scan-qr')}
            testID="friends-scan-qr"
          />
          <TextInput
            key={`friend-invite-${vm.inviteInputResetKey}`}
            defaultValue={vm.searchUsername}
            placeholder={vm.t('profile.usernamePlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            editable={!inviteBusy && vm.canPerformNetworkAction}
            onChangeText={vm.setSearchUsername}
            onSubmitEditing={() => {
              if (vm.searchUsername.trim() && !inviteBusy) void vm.handleSendInvite();
            }}
            testID="friends-username-input"
          />
          <NativeSettingsActionRow
            title={inviteBusy ? vm.t('profile.sendInviteLoading') : vm.t('profile.sendInvite')}
            disabled={!vm.canPerformNetworkAction || inviteBusy || !vm.searchUsername.trim()}
            onPress={() => void vm.handleSendInvite()}
          />
        </NativeSettingsSection>

        {vm.outgoingRequests.length > 0 ? (
          <NativeSettingsSection title={vm.t('profile.outgoingInvites', { count: vm.outgoingRequests.length })}>
            {vm.outgoingRequests.map((request) => {
              const avatarPath = request.recipient.avatar_storage_path ?? null;
              const loading = isOutgoingRequestBusy(vm.busyKeys, request.id);
              return (
                <NativeSettingsSwipeActions
                  key={request.id}
                  actionLabel={vm.t('profile.cancelInvite')}
                  disabled={loading || !vm.canPerformNetworkAction}
                  onAction={() => confirmCancelInvite(request.id, request.recipient.username)}>
                  <NativeSettingsRow
                    title={request.recipient.display_name || `@${request.recipient.username}`}
                    supportingText={loading ? vm.t('common.loading') : vm.t('profile.outgoingInviteStatus')}
                    avatar={{
                      url: avatarPath ? vm.avatarUrls[avatarPath] ?? null : null,
                      storagePath: avatarPath,
                      emoji: request.recipient.avatar_emoji ?? null,
                      fallbackInitial: request.recipient.username,
                    }}
                    disabled={loading}
                    testID={`outgoing-request-${request.id}`}
                  />
                </NativeSettingsSwipeActions>
              );
            })}
          </NativeSettingsSection>
        ) : null}

        <NativeSettingsSection title={vm.t('profile.friends', { count: vm.friends.length })}>
          <NativeSettingsListStatus
            state={vm.friendsListState}
            emptyText={vm.t('profile.noFriends')}
            onRetry={vm.retryFriends}
          />
          {vm.friends.map((friend) => {
            const avatarPath = friend.avatar_storage_path ?? null;
            const busy = isFriendRowBusy(vm.busyKeys, friend.id);
            const displayName = friend.display_name?.trim();
            const friendshipBadge = vm.friendshipBadges.get(friend.id);
            return (
              <NativeSettingsSwipeActions
                key={friend.id}
                actionLabel={vm.t('profile.removeFriend')}
                disabled={busy || !vm.canPerformNetworkAction}
                onAction={() => confirmRemoveFriend(friend.id, friend.username)}>
                {/* Settings and actions for one friend live on its detail screen (chevron). */}
                <NativeSettingsRow
                  title={displayName || `@${friend.username}`}
                  supportingText={busy ? vm.t('common.loading') : displayName ? `@${friend.username}` : undefined}
                  avatar={{
                    url: avatarPath ? vm.avatarUrls[avatarPath] ?? null : null,
                    storagePath: avatarPath,
                    emoji: friend.avatar_emoji ?? null,
                    fallbackInitial: friend.username,
                  }}
                  trailing={
                    friendshipBadge ? <FriendshipBadgeLabel badge={friendshipBadge} /> : undefined
                  }
                  showsChevron
                  disabled={busy}
                  onPress={() => router.push({ pathname: '/friend/[id]', params: { id: friend.id } })}
                  accessibilityHint={vm.t('friends.openFriendHint')}
                  testID={`friend-${friend.id}`}
                />
              </NativeSettingsSwipeActions>
            );
          })}
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: vm.colors.label }}>{vm.t('profile.friendsTitle')}</Stack.Screen.Title>
    </>
  );
}
