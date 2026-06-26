import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Button, FieldGroup, ListItem, Text, TextInput } from '@expo/ui';
import { ProfileQrAvatarSection } from './ProfileQrAvatarSection';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { registerTabScrollToTop } from '../../lib/tabBarScrollActions';
import { AppHost } from '../ui/app-host';
import { AppRnHostView } from '../ui/app-rn-host-view';

export default function ProfileScreenSurface() {
  const vm = useProfileScreen();
  const { bottomContentInset } = useScreenInsets('tabStackList');

  useEffect(() => {
    return registerTabScrollToTop('profile', () => {
      router.replace('/(tabs)/profile');
    });
  }, []);

  if (vm.profilePending) {
    return (
      <AppHost style={[styles.host, styles.centered, { backgroundColor: vm.colors.background }]}>
        <StatusBar style={vm.statusBarStyle} />
        <ActivityIndicator color={vm.colors.label} />
      </AppHost>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerLargeTitle: true, title: vm.t('profile.title') }} />
      <AppHost style={[styles.host, { backgroundColor: vm.colors.background }]} useViewportSizeMeasurement>
        <StatusBar style={vm.statusBarStyle} />
        <FieldGroup style={{ backgroundColor: vm.colors.background, paddingBottom: bottomContentInset }}>
          <FieldGroup.Section>
            <ListItem supportingText={vm.user?.email ?? '-'}>
              {`@${vm.profileUsername ?? 'brak_nazwy_uzytkownika'}`}
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title={vm.t('profile.myQrCode')}>
            <AppRnHostView style={styles.qrNativeHost}>
              <ProfileQrAvatarSection
                colors={vm.colors}
                qrPayload={vm.qrPayload}
                avatarSignedUrl={vm.avatarSignedUrl}
                avatarStoragePath={vm.profileRow?.avatar_storage_path ?? null}
                avatarEmoji={vm.profileRow?.avatar_emoji ?? null}
                initialLetter={vm.initialLetter}
              />
            </AppRnHostView>
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Button
              label={vm.avatarBusy ? 'Przetwarzanie...' : 'Zdjecie z biblioteki'}
              onPress={vm.avatarBusy ? undefined : vm.handlePickAvatarPhoto}
              disabled={vm.avatarBusy}
              variant="text"
            />
            <Button
              label="Usun awatar"
              onPress={
                vm.avatarBusy || !vm.hasAvatar
                  ? undefined
                  : () =>
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
              disabled={vm.avatarBusy || !vm.hasAvatar}
              variant="outlined"
            />
          </FieldGroup.Section>

          <FieldGroup.Section title={vm.t('profile.addFriend')}>
            <Button label={vm.t('profile.scanQr')} onPress={() => router.push('/friend-scan-qr')} variant="text" />
            <TextInput
              key={`invite-input-${vm.inviteInputResetKey}`}
              placeholder="@nazwa_uzytkownika"
              placeholderTextColor={vm.colors.tertiaryLabel}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={vm.setSearchUsername}
              returnKeyType="send"
              onSubmitEditing={() => void vm.handleSendInvite()}
            />
            <Button
              label={vm.actionLoadingId === 'invite' ? vm.t('profile.sendInviteLoading') : vm.t('profile.sendInvite')}
              onPress={vm.actionLoadingId === 'invite' ? undefined : vm.handleSendInvite}
              disabled={vm.actionLoadingId === 'invite'}
            />
          </FieldGroup.Section>

          {vm.requests.length > 0 ? (
            <FieldGroup.Section title={vm.t('profile.incomingInvites', { count: vm.requests.length })}>
              {vm.requests.flatMap((request) => [
                <ListItem key={`${request.id}:row`} supportingText="Zaproszenie przychodzace">
                  {`@${request.requester.username}`}
                </ListItem>,
                <Button
                  key={`${request.id}:accept`}
                  label="Przyjmij"
                  onPress={() => void vm.handleAccept(request.id)}
                  disabled={vm.actionLoadingId === request.id}
                />,
                <Button
                  key={`${request.id}:reject`}
                  label="Usun zaproszenie"
                  onPress={() => void vm.handleReject(request.id)}
                  disabled={vm.actionLoadingId === request.id}
                  variant="outlined"
                />,
              ])}
            </FieldGroup.Section>
          ) : null}

          {vm.outgoingRequests.length > 0 ? (
            <FieldGroup.Section title={vm.t('profile.outgoingInvites', { count: vm.outgoingRequests.length })}>
              {vm.outgoingRequests.flatMap((request) => [
                <ListItem
                  key={`${request.id}:row`}
                  supportingText={
                    vm.actionLoadingId === `outgoing-${request.id}` ? 'Usuwanie...' : 'Oczekuje na akceptacje'
                  }>
                  {`@${request.recipient.username}`}
                </ListItem>,
                <Button
                  key={`${request.id}:cancel`}
                  label="Anuluj zaproszenie"
                  onPress={() => void vm.handleCancelOutgoing(request.id)}
                  disabled={vm.actionLoadingId === `outgoing-${request.id}`}
                  variant="outlined"
                />,
              ])}
            </FieldGroup.Section>
          ) : null}

          <FieldGroup.Section title={vm.t('profile.friends', { count: vm.friends.length })}>
            {vm.friends.length === 0 ? (
              <Text textStyle={{ color: vm.colors.secondaryLabel, fontSize: 15 }}>
                Nie masz jeszcze znajomych.
              </Text>
            ) : null}
            {vm.friends.flatMap((friend) => {
              const captureLoadingId = `capture-${friend.id}`;
              const isCaptureUpdating = vm.actionLoadingId === captureLoadingId;
              const captureAllowed = vm.resolveFriendCapturePolicy(friend.id) === 'allow';
              const friendIndex = vm.friends.findIndex((f) => f.id === friend.id);
              return [
                <ListItem
                  key={`${friend.id}:row`}
                  supportingText={[
                    friend.avatar_storage_path ? 'Avatar ustawiony' : 'Brak avatara',
                    captureAllowed ? 'Screenshoty dozwolone' : 'Screenshoty zablokowane',
                  ].join(' · ')}>
                  {`@${friend.username}`}
                </ListItem>,
                <Button
                  key={`${friend.id}:capture`}
                  label={captureAllowed ? 'Zablokuj screenshoty' : 'Zezwalaj na screenshoty'}
                  onPress={() => void vm.handleToggleFriendCapture(friend.id, !captureAllowed)}
                  disabled={isCaptureUpdating}
                  variant="text"
                />,
                <Button
                  key={`${friend.id}:remove`}
                  label="Usun ze znajomych"
                  onPress={() => {
                    if (friendIndex >= 0) void vm.handleNativeFriendDelete([friendIndex]);
                  }}
                  disabled={vm.actionLoadingId === `friend-${friend.id}`}
                  variant="outlined"
                />,
              ];
            })}
          </FieldGroup.Section>

          <FieldGroup.Section title={vm.t('profile.account')}>
            <Button label={vm.t('profile.changePassword')} onPress={() => router.push('/profile/change-password')} />
            <Button label={vm.t('profile.signOut')} onPress={vm.handleSignOut} variant="outlined" />
          </FieldGroup.Section>
        </FieldGroup>
      </AppHost>
    </>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrNativeHost: {
    height: 312,
    width: '100%',
  },
});
