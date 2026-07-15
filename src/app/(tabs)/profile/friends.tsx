import { Button, FieldGroup, RNHostView, Text, TextInput } from '@expo/ui';
import { HStack } from '@expo/ui/swift-ui';
import { Stack, router } from 'expo-router';
import { Alert } from 'react-native';
import { useFriendsScreen } from '../../../hooks/useFriendsScreen';
import {
  NativeSettingsActionRow,
  NativeSettingsEmptyRow,
  NativeSettingsRow,
  NativeSettingsSection,
  NativeSettingsSwipeActions,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import {
  isFriendRowBusy,
  isOutgoingRequestBusy,
} from '../../../lib/profileFriendsPresentation';

export default function FriendsScreen() {
  const vm = useFriendsScreen();
  const inviteBusy = vm.actionLoadingId === 'invite';

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
            editable={!inviteBusy}
            onChangeText={vm.setSearchUsername}
            onSubmitEditing={() => {
              if (vm.searchUsername.trim() && !inviteBusy) void vm.handleSendInvite();
            }}
            testID="friends-username-input"
          />
          <NativeSettingsActionRow
            title={inviteBusy ? vm.t('profile.sendInviteLoading') : vm.t('profile.sendInvite')}
            disabled={inviteBusy || !vm.searchUsername.trim()}
            onPress={() => void vm.handleSendInvite()}
          />
        </NativeSettingsSection>

        {vm.requests.length > 0 ? (
          <NativeSettingsSection title={vm.t('profile.incomingInvites', { count: vm.requests.length })}>
            {vm.requests.map((request) => {
              const avatarPath = request.requester.avatar_storage_path ?? null;
              const loading = vm.actionLoadingId === request.id;
              return (
                <NativeSettingsSwipeActions
                  key={request.id}
                  actionLabel={vm.t('profile.rejectInvite')}
                  disabled={loading}
                  onAction={() => void vm.handleReject(request.id)}>
                  <NativeSettingsRow
                    title={`@${request.requester.username}`}
                    supportingText={vm.t('profile.incomingInviteStatus')}
                    avatar={{
                      url: avatarPath ? vm.incomingAvatarUrls[avatarPath] ?? null : null,
                      storagePath: avatarPath,
                      emoji: request.requester.avatar_emoji ?? null,
                      fallbackInitial: request.requester.username,
                    }}
                    disabled={loading}
                    trailing={
                      <RNHostView matchContents>
                        <HStack alignment="center" spacing={4}>
                          <Button
                            label={vm.t('profile.rejectInvite')}
                            variant="text"
                            role="destructive"
                            disabled={loading}
                            onPress={() => void vm.handleReject(request.id)}
                          />
                          <Button
                            label={loading ? vm.t('common.loading') : vm.t('profile.acceptInvite')}
                            variant="text"
                            disabled={loading}
                            onPress={() => void vm.handleAccept(request.id)}
                          />
                        </HStack>
                      </RNHostView>
                    }
                    testID={`incoming-request-${request.id}`}
                  />
                </NativeSettingsSwipeActions>
              );
            })}
          </NativeSettingsSection>
        ) : null}

        {vm.outgoingRequests.length > 0 ? (
          <NativeSettingsSection title={vm.t('profile.outgoingInvites', { count: vm.outgoingRequests.length })}>
            {vm.outgoingRequests.map((request) => {
              const avatarPath = request.recipient.avatar_storage_path ?? null;
              const loading = isOutgoingRequestBusy(vm.actionLoadingId, request.id);
              return (
                <NativeSettingsSwipeActions
                  key={request.id}
                  actionLabel={vm.t('profile.cancelInvite')}
                  disabled={loading}
                  onAction={() => confirmCancelInvite(request.id, request.recipient.username)}>
                  <NativeSettingsRow
                    title={`@${request.recipient.username}`}
                    supportingText={loading ? vm.t('common.loading') : vm.t('profile.outgoingInviteStatus')}
                    avatar={{
                      url: avatarPath ? vm.outgoingAvatarUrls[avatarPath] ?? null : null,
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

        <FieldGroup.Section title={vm.t('profile.friends', { count: vm.friends.length })}>
          {vm.friends.length === 0 ? (
            <NativeSettingsEmptyRow text={vm.t('profile.noFriends')} />
          ) : null}
          {vm.friends.map((friend) => {
            const avatarPath = friend.avatar_storage_path ?? null;
            const disabled = isFriendRowBusy(vm.actionLoadingId, friend.id);
            return (
              <NativeSettingsSwipeActions
                key={friend.id}
                actionLabel={vm.t('profile.removeFriend')}
                disabled={disabled}
                onAction={() => confirmRemoveFriend(friend.id, friend.username)}>
                <NativeSettingsRow
                  title={`@${friend.username}`}
                  supportingText={vm.t('profile.screenshotPermission')}
                  avatar={{
                    url: avatarPath ? vm.friendAvatarUrls[avatarPath] ?? null : null,
                    storagePath: avatarPath,
                    emoji: friend.avatar_emoji ?? null,
                    fallbackInitial: friend.username,
                  }}
                  disabled={disabled}
                  switchValue={vm.resolveFriendCapturePolicy(friend.id) === 'allow'}
                  onSwitchValueChange={(allowed) => void vm.handleToggleFriendCapture(friend.id, allowed)}
                  testID={`friend-${friend.id}`}
                />
              </NativeSettingsSwipeActions>
            );
          })}
          <FieldGroup.SectionFooter>
            <Text>{vm.t('profile.screenshotPermissionHint')}</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
      </SettingsListScreen>
      <Stack.Screen.Title>{vm.t('profile.friendsTitle')}</Stack.Screen.Title>
    </>
  );
}
