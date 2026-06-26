import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { Text, TextInput } from '@expo/ui';
import { ProfileQrAvatarSection } from './ProfileQrAvatarSection';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import {
  NativeSettingsActionRow,
  NativeSettingsEmptyRow,
  NativeSettingsRow,
  NativeSettingsSection,
  NativeSettingsSwitchRow,
} from '../ui/native-settings';
import { SettingsListScreen } from '../ui/settings-list-screen';
import { registerTabScrollToTop } from '../../lib/tabBarScrollActions';

export default function ProfileScreenSurface() {
  const vm = useProfileScreen();

  useEffect(() => {
    return registerTabScrollToTop('profile', () => {
      router.replace('/(tabs)/profile');
    });
  }, []);

  return (
    <>
      <SettingsListScreen onRefresh={vm.handleListRefresh} loading={vm.profilePending}>
        <NativeSettingsSection>
          <Text textStyle={{ fontSize: 22, fontWeight: '700', color: vm.colors.label }}>
            {`@${vm.profileUsername ?? 'brak_nazwy_uzytkownika'}`}
          </Text>
          <Text textStyle={{ fontSize: 14, color: vm.colors.secondaryLabel }}>{vm.user?.email ?? '—'}</Text>
        </NativeSettingsSection>

        <NativeSettingsSection title={vm.t('profile.myQrCode')}>
          <ProfileQrAvatarSection
            colors={vm.colors}
            qrPayload={vm.qrPayload}
            avatarSignedUrl={vm.avatarSignedUrl}
            avatarStoragePath={vm.profileRow?.avatar_storage_path ?? null}
            avatarEmoji={vm.profileRow?.avatar_emoji ?? null}
            initialLetter={vm.initialLetter}
          />
          <NativeSettingsActionRow
            title={vm.avatarBusy ? 'Przetwarzanie…' : 'Zdjęcie z biblioteki'}
            onPress={vm.handlePickAvatarPhoto}
            disabled={vm.avatarBusy}
          />
          <NativeSettingsActionRow
            title="Usuń awatar"
            destructive
            disabled={vm.avatarBusy || !vm.hasAvatar}
            onPress={() =>
              router.push({
                pathname: '/profile/remove-avatar',
                params: {
                  avatarUrl: vm.avatarSignedUrl ?? undefined,
                  avatarStoragePath: vm.profileRow?.avatar_storage_path ?? undefined,
                  avatarEmoji: vm.profileRow?.avatar_emoji ?? undefined,
                  fallbackInitial: vm.initialLetter,
                },
              })
            }
          />
        </NativeSettingsSection>

        <NativeSettingsSection title={vm.t('profile.addFriend')}>
          <NativeSettingsActionRow title={vm.t('profile.scanQr')} onPress={() => router.push('/friend-scan-qr')} />
          <TextInput
            key={`invite-input-${vm.inviteInputResetKey}`}
            placeholder="@nazwa_uzytkownika"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={vm.setSearchUsername}
          />
          <NativeSettingsActionRow
            title={
              vm.actionLoadingId === 'invite' ? vm.t('profile.sendInviteLoading') : vm.t('profile.sendInvite')
            }
            onPress={vm.handleSendInvite}
            disabled={vm.actionLoadingId === 'invite'}
          />
        </NativeSettingsSection>

        {vm.requests.length > 0 ? (
          <NativeSettingsSection title={vm.t('profile.incomingInvites', { count: vm.requests.length })}>
            {vm.requests.flatMap((request) => [
              <NativeSettingsRow
                key={`${request.id}:row`}
                title={`@${request.requester.username}`}
                supportingText="Zaproszenie przychodzące"
              />,
              <NativeSettingsActionRow
                key={`${request.id}:accept`}
                title="Przyjmij"
                disabled={vm.actionLoadingId === request.id}
                onPress={() => void vm.handleAccept(request.id)}
              />,
              <NativeSettingsActionRow
                key={`${request.id}:reject`}
                title="Usuń zaproszenie"
                destructive
                disabled={vm.actionLoadingId === request.id}
                onPress={() => void vm.handleReject(request.id)}
              />,
            ])}
          </NativeSettingsSection>
        ) : null}

        {vm.outgoingRequests.length > 0 ? (
          <NativeSettingsSection title={vm.t('profile.outgoingInvites', { count: vm.outgoingRequests.length })}>
            {vm.outgoingRequests.flatMap((request) => [
              <NativeSettingsRow
                key={`${request.id}:row`}
                title={`@${request.recipient.username}`}
                supportingText={
                  vm.actionLoadingId === `outgoing-${request.id}` ? 'Usuwanie…' : 'Oczekuje na akceptację'
                }
              />,
              <NativeSettingsActionRow
                key={`${request.id}:cancel`}
                title="Anuluj zaproszenie"
                destructive
                disabled={vm.actionLoadingId === `outgoing-${request.id}`}
                onPress={() => void vm.handleCancelOutgoing(request.id)}
              />,
            ])}
          </NativeSettingsSection>
        ) : null}

        <NativeSettingsSection title={vm.t('profile.friends', { count: vm.friends.length })}>
          {vm.friends.length === 0 ? (
            <NativeSettingsEmptyRow text="Nie masz jeszcze znajomych." />
          ) : null}
          {vm.friends.flatMap((friend) => {
            const avatarPath = friend.avatar_storage_path ?? null;
            const captureLoadingId = `capture-${friend.id}`;
            const isCaptureUpdating = vm.actionLoadingId === captureLoadingId;
            return [
              <NativeSettingsRow
                key={`${friend.id}:row`}
                title={`@${friend.username}`}
                supportingText={avatarPath ? 'Avatar ustawiony' : 'Brak avatara'}
              />,
              <NativeSettingsSwitchRow
                key={`${friend.id}:capture`}
                title="Zezwalaj na screenshoty"
                value={vm.resolveFriendCapturePolicy(friend.id) === 'allow'}
                onValueChange={(next) => {
                  void vm.handleToggleFriendCapture(friend.id, next);
                }}
                disabled={isCaptureUpdating}
              />,
              <NativeSettingsActionRow
                key={`${friend.id}:delete`}
                title="Usuń ze znajomych"
                destructive
                disabled={vm.actionLoadingId === `friend-${friend.id}`}
                onPress={() => {
                  const index = vm.friends.findIndex((f) => f.id === friend.id);
                  if (index >= 0) void vm.handleNativeFriendDelete([index]);
                }}
              />,
            ];
          })}
        </NativeSettingsSection>

        <NativeSettingsSection title={vm.t('profile.account')}>
          <NativeSettingsActionRow
            title={vm.t('profile.changePassword')}
            onPress={() => router.push('/profile/change-password')}
          />
          <NativeSettingsActionRow title={vm.t('profile.signOut')} onPress={vm.handleSignOut} />
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title large>{vm.t('profile.title')}</Stack.Screen.Title>
    </>
  );
}
