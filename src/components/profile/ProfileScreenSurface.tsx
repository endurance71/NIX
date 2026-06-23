import { Pressable, Text as RNText, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button, RNHostView, Switch, Text, TextInput } from '@expo/ui';
import { ProfileQrAvatarSection } from './ProfileQrAvatarSection';
import { AvatarCircle } from '../ui/avatar-circle';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { profileScreenRnStyles as styles } from './profileScreen.styles';
import { DeletableRowMenu } from '../ui/deletable-row-menu';
import {
  SettingsEmptyText,
  SettingsListScreen,
  SettingsSectionTitle,
} from '../ui/settings-list-screen';

export default function ProfileScreenSurface() {
  const vm = useProfileScreen();

  return (
    <>
      <SettingsListScreen onRefresh={vm.handleListRefresh} loading={vm.profilePending}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 4 }}>
          <Text textStyle={{ fontSize: 22, fontWeight: '700', color: vm.colors.label }}>
            {`@${vm.profileUsername ?? 'brak_nazwy_uzytkownika'}`}
          </Text>
          <Text textStyle={{ fontSize: 14, color: vm.colors.secondaryLabel }}>{vm.user?.email ?? '—'}</Text>
        </View>

        <SettingsSectionTitle>{vm.t('profile.myQrCode')}</SettingsSectionTitle>
        <ProfileQrAvatarSection
          colors={vm.colors}
          qrPayload={vm.qrPayload}
          avatarSignedUrl={vm.avatarSignedUrl}
          avatarStoragePath={vm.profileRow?.avatar_storage_path ?? null}
          avatarEmoji={vm.profileRow?.avatar_emoji ?? null}
          initialLetter={vm.initialLetter}
          avatarBusy={vm.avatarBusy}
          hasAvatar={vm.hasAvatar}
          styles={{
            avatarActions: styles.avatarActions,
            avatarLink: styles.avatarLink,
            avatarLinkPressed: styles.avatarLinkPressed,
            avatarLinkText: styles.avatarLinkText,
          }}
          onPickAvatarPhoto={vm.handlePickAvatarPhoto}
        />

        <SettingsSectionTitle>{vm.t('profile.addFriend')}</SettingsSectionTitle>
        <Button label={vm.t('profile.scanQr')} onPress={() => router.push('/friend-scan-qr')} />
        <TextInput
          key={`invite-input-${vm.inviteInputResetKey}`}
          placeholder="@nazwa_uzytkownika"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={vm.setSearchUsername}
        />
        <Button
          label={
            vm.actionLoadingId === 'invite' ? vm.t('profile.sendInviteLoading') : vm.t('profile.sendInvite')
          }
          onPress={vm.handleSendInvite}
        />

        {vm.requests.length > 0 ? (
          <>
            <SettingsSectionTitle>{vm.t('profile.incomingInvites', { count: vm.requests.length })}</SettingsSectionTitle>
            {vm.requests.map((request) => {
              const avatarPath = request.requester.avatar_storage_path ?? null;
              const avatarUrl = avatarPath ? vm.incomingAvatarUrls[avatarPath] ?? null : null;
              const fallbackInitial = request.requester.username.replace(/^@/, '').charAt(0).toUpperCase();
              return (
                <DeletableRowMenu
                  key={request.id}
                  deleteLabel="Usuń zaproszenie"
                  disabled={vm.actionLoadingId === request.id}
                  onDelete={() => void vm.handleReject(request.id)}>
                  <RNHostView matchContents>
                    <View style={[styles.socialRow, vm.actionLoadingId === request.id && styles.rowDisabled]}>
                      <View style={styles.outgoingHeader}>
                        <AvatarCircle
                          size={36}
                          url={avatarUrl}
                          storagePath={avatarPath}
                          emoji={request.requester.avatar_emoji}
                          fallbackInitial={fallbackInitial}
                        />
                        <RNText
                          numberOfLines={1}
                          style={[styles.socialTitle, { color: vm.colors.label, flex: 1 }]}>
                          @{request.requester.username}
                        </RNText>
                      </View>
                      <View style={styles.socialActions}>
                        <Pressable onPress={() => vm.handleAccept(request.id)} hitSlop={8}>
                          <RNText style={[styles.socialActionLabel, { color: vm.colors.accent }]}>Przyjmij</RNText>
                        </Pressable>
                      </View>
                    </View>
                  </RNHostView>
                </DeletableRowMenu>
              );
            })}
          </>
        ) : null}

        {vm.outgoingRequests.length > 0 ? (
          <>
            <SettingsSectionTitle>
              {vm.t('profile.outgoingInvites', { count: vm.outgoingRequests.length })}
            </SettingsSectionTitle>
            {vm.outgoingRequests.map((request) => {
              const avatarPath = request.recipient.avatar_storage_path ?? null;
              const avatarUrl = avatarPath ? vm.outgoingAvatarUrls[avatarPath] ?? null : null;
              const fallbackInitial = request.recipient.username.replace(/^@/, '').charAt(0).toUpperCase();
              return (
                <DeletableRowMenu
                  key={request.id}
                  deleteLabel="Anuluj zaproszenie"
                  disabled={vm.actionLoadingId === `outgoing-${request.id}`}
                  onDelete={() => void vm.handleCancelOutgoing(request.id)}>
                  <RNHostView matchContents>
                    <View
                      style={[
                        styles.socialRow,
                        vm.actionLoadingId === `outgoing-${request.id}` && styles.rowDisabled,
                      ]}>
                      <View style={styles.outgoingHeader}>
                        <AvatarCircle
                          size={36}
                          url={avatarUrl}
                          storagePath={avatarPath}
                          emoji={request.recipient.avatar_emoji}
                          fallbackInitial={fallbackInitial}
                        />
                        <RNText
                          numberOfLines={1}
                          style={[styles.socialTitle, { color: vm.colors.label, flex: 1 }]}>
                          @{request.recipient.username}
                        </RNText>
                      </View>
                      <RNText style={[styles.outgoingStatusLabel, { color: vm.colors.tertiaryLabel }]}>
                        {vm.actionLoadingId === `outgoing-${request.id}`
                          ? 'Usuwanie…'
                          : 'Oczekuje na akceptację'}
                      </RNText>
                    </View>
                  </RNHostView>
                </DeletableRowMenu>
              );
            })}
          </>
        ) : null}

        <SettingsSectionTitle>{vm.t('profile.friends', { count: vm.friends.length })}</SettingsSectionTitle>
        {vm.friends.length === 0 ? (
          <SettingsEmptyText>Nie masz jeszcze znajomych.</SettingsEmptyText>
        ) : (
          vm.friends.map((friend) => {
            const avatarPath = friend.avatar_storage_path ?? null;
            const avatarUrl = avatarPath ? vm.friendAvatarUrls[avatarPath] ?? null : null;
            const fallbackInitial = friend.username.replace(/^@/, '').charAt(0).toUpperCase();
            const captureLoadingId = `capture-${friend.id}`;
            const isCaptureUpdating = vm.actionLoadingId === captureLoadingId;
            return (
              <DeletableRowMenu
                key={friend.id}
                deleteLabel="Usuń ze znajomych"
                disabled={vm.actionLoadingId === `friend-${friend.id}`}
                onDelete={() => {
                  const index = vm.friends.findIndex((f) => f.id === friend.id);
                  if (index >= 0) void vm.handleNativeFriendDelete([index]);
                }}>
                <RNHostView matchContents>
                  <View
                    style={[styles.socialRow, vm.actionLoadingId === `friend-${friend.id}` && styles.rowDisabled]}>
                    <View style={styles.outgoingHeader}>
                      <AvatarCircle
                        size={36}
                        url={avatarUrl}
                        storagePath={avatarPath}
                        emoji={friend.avatar_emoji}
                        fallbackInitial={fallbackInitial}
                      />
                      <RNText numberOfLines={1} style={[styles.socialTitle, { color: vm.colors.label, flex: 1 }]}>
                        @{friend.username}
                      </RNText>
                    </View>
                    <View style={styles.captureToggleRow}>
                      <RNText
                        numberOfLines={2}
                        style={[styles.captureToggleLabel, { color: vm.colors.secondaryLabel }]}>
                        Zezwalaj na screenshoty
                      </RNText>
                      <Switch
                        value={vm.resolveFriendCapturePolicy(friend.id) === 'allow'}
                        onValueChange={(next) => {
                          void vm.handleToggleFriendCapture(friend.id, next);
                        }}
                        disabled={isCaptureUpdating}
                      />
                    </View>
                  </View>
                </RNHostView>
              </DeletableRowMenu>
            );
          })
        )}

        <SettingsSectionTitle>{vm.t('profile.account')}</SettingsSectionTitle>
        <Button
          label={vm.t('profile.changePassword')}
          onPress={() => router.push('/profile/change-password')}
        />
        <Button label={vm.t('profile.signOut')} onPress={vm.handleSignOut} />
      </SettingsListScreen>
      <Stack.Screen.Title large>{vm.t('profile.title')}</Stack.Screen.Title>
    </>
  );
}
