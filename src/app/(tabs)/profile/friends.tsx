import { FieldGroup, ListItem, RNHostView, Text, TextInput } from '@expo/ui';
import { Button, HStack, ProgressView } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  fixedSize,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Stack, router } from 'expo-router';
import { Alert, View } from 'react-native';
import { useFriendsScreen } from '../../../hooks/useFriendsScreen';
import {
  NativeSettingsActionRow,
  NativeSettingsEmptyRow,
  NativeSettingsRow,
  NativeSettingsSection,
  NativeSettingsSwipeActions,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { AvatarCircle } from '../../../components/ui/avatar-circle';
import {
  isFriendRowBusy,
  isOutgoingRequestBusy,
} from '../../../lib/profileFriendsPresentation';

const INVITE_AVATAR_SIZE = 44;

export default function FriendsScreen() {
  const vm = useFriendsScreen();
  const inviteBusy = vm.actionLoadingId === 'invite';
  const { colors } = vm;

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
              const title =
                request.requester.display_name || `@${request.requester.username}`;
              return (
                <ListItem
                  key={request.id}
                  testID={`incoming-request-${request.id}`}
                  leading={
                    <RNHostView matchContents>
                      <View
                        collapsable={false}
                        style={{ width: INVITE_AVATAR_SIZE, height: INVITE_AVATAR_SIZE }}>
                        <AvatarCircle
                          size={INVITE_AVATAR_SIZE}
                          url={avatarPath ? vm.incomingAvatarUrls[avatarPath] ?? null : null}
                          storagePath={avatarPath}
                          emoji={request.requester.avatar_emoji ?? null}
                          fallbackInitial={request.requester.username}
                        />
                      </View>
                    </RNHostView>
                  }
                  supportingText={
                    loading ? (
                      <ProgressView
                        modifiers={[
                          padding({ top: 8 }),
                          accessibilityLabel(vm.t('common.loading')),
                        ]}
                      />
                    ) : (
                      <HStack
                        alignment="center"
                        spacing={8}
                        modifiers={[padding({ top: 8 })]}>
                        <Button
                          label={vm.t('profile.rejectInvite')}
                          onPress={() => void vm.handleReject(request.id)}
                          modifiers={[
                            buttonStyle('bordered'),
                            buttonBorderShape('capsule'),
                            controlSize('small'),
                            fixedSize(),
                            tint(colors.secondaryLabel),
                          ]}
                        />
                        <Button
                          label={vm.t('profile.acceptInvite')}
                          onPress={() => void vm.handleAccept(request.id)}
                          modifiers={[
                            buttonStyle('borderedProminent'),
                            buttonBorderShape('capsule'),
                            controlSize('small'),
                            fixedSize(),
                            tint(colors.accent),
                          ]}
                        />
                      </HStack>
                    )
                  }>
                  <Text textStyle={{ color: colors.label }}>{title}</Text>
                </ListItem>
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
                    title={request.recipient.display_name || `@${request.recipient.username}`}
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
                  title={friend.display_name || `@${friend.username}`}
                  supportingText={vm.t('profile.screenshotPermission')}
                  avatar={{
                    url: avatarPath ? vm.friendAvatarUrls[avatarPath] ?? null : null,
                    storagePath: avatarPath,
                    emoji: friend.avatar_emoji ?? null,
                    fallbackInitial: friend.username,
                  }}
                  disabled={disabled}
                  onPress={() =>
                    router.push({
                      pathname: '/chat/[peerId]',
                      params: { peerId: friend.id },
                    })
                  }
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
      <Stack.Screen.Title style={{ color: vm.colors.label }}>{vm.t('profile.friendsTitle')}</Stack.Screen.Title>
    </>
  );
}
