import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text as RNText,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Host, List, Section, Text, TextField, Button, RNHostView } from '@expo/ui/swift-ui';
import {
  foregroundStyle,
  font,
  textFieldStyle,
  textInputAutocapitalization,
  autocorrectionDisabled,
  padding,
  listStyle,
  listRowSeparator,
  refreshable,
} from '@expo/ui/swift-ui/modifiers';
import { ProfileQrAvatarSection } from './ProfileQrAvatarSection';
import { AvatarCircle } from '../ui/avatar-circle';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { profileScreenRnStyles as styles } from './profileScreen.styles';

export default function ProfileScreenSurface() {
  const vm = useProfileScreen();

  if (vm.profilePending) {
    return (
      <Host style={[styles.container, styles.centered]}>
        <StatusBar style={vm.statusBarStyle} />
        <ActivityIndicator color={vm.colors.label} />
      </Host>
    );
  }

  return (
    <>
      <Host
        style={styles.container}
        useViewportSizeMeasurement
        colorScheme={vm.statusBarStyle === 'light' ? 'dark' : 'light'}>
        <List
          modifiers={[
            listStyle('insetGrouped'),
            padding({ top: 0 }),
            refreshable(vm.handleListRefresh),
          ]}>
          <Section>
            <Text modifiers={[font({ size: 22, weight: 'bold', design: 'rounded' })]}>
              @{vm.profileUsername ?? 'brak_nazwy_uzytkownika'}
            </Text>
            <Text
              modifiers={[
                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                font({ size: 14, design: 'rounded' }),
              ]}>
              {vm.user?.email ?? '—'}
            </Text>
          </Section>
          <Section title={vm.t('profile.myQrCode')}>
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
          </Section>
          <Section title={vm.t('profile.addFriend')}>
            <Button label={vm.t('profile.scanQr')} onPress={() => router.push('/friend-scan-qr')} />
            <TextField
              key={`invite-input-${vm.inviteInputResetKey}`}
              placeholder="@nazwa_uzytkownika"
              defaultValue={vm.searchUsername}
              onValueChange={vm.setSearchUsername}
              modifiers={[
                textFieldStyle('roundedBorder'),
                textInputAutocapitalization('never'),
                autocorrectionDisabled(true),
              ]}
            />
            <Button
              label={
                vm.actionLoadingId === 'invite'
                  ? vm.t('profile.sendInviteLoading')
                  : vm.t('profile.sendInvite')
              }
              onPress={vm.handleSendInvite}
            />
          </Section>
          {vm.requests.length > 0 ? (
            <Section title={vm.t('profile.incomingInvites', { count: vm.requests.length })}>
              <List.ForEach onDelete={vm.handleNativeIncomingDelete}>
                {vm.requests.map((request) => {
                  const avatarPath = request.requester.avatar_storage_path ?? null;
                  const avatarUrl = avatarPath ? vm.incomingAvatarUrls[avatarPath] ?? null : null;
                  const fallbackInitial = request.requester.username.replace(/^@/, '').charAt(0).toUpperCase();
                  return (
                    <RNHostView matchContents key={request.id}>
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
                            <RNText style={[styles.socialActionLabel, { color: vm.colors.accent }]}>
                              Przyjmij
                            </RNText>
                          </Pressable>
                        </View>
                      </View>
                    </RNHostView>
                  );
                })}
              </List.ForEach>
            </Section>
          ) : null}
          {vm.outgoingRequests.length > 0 ? (
            <Section title={vm.t('profile.outgoingInvites', { count: vm.outgoingRequests.length })}>
              <List.ForEach onDelete={vm.handleNativeOutgoingDelete}>
                {vm.outgoingRequests.map((request) => {
                  const avatarPath = request.recipient.avatar_storage_path ?? null;
                  const avatarUrl = avatarPath ? vm.outgoingAvatarUrls[avatarPath] ?? null : null;
                  const fallbackInitial = request.recipient.username.replace(/^@/, '').charAt(0).toUpperCase();
                  return (
                    <RNHostView matchContents key={request.id}>
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
                  );
                })}
              </List.ForEach>
            </Section>
          ) : null}
          <Section title={vm.t('profile.friends', { count: vm.friends.length })}>
            {vm.friends.length === 0 ? (
              <Text
                modifiers={[
                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                  listRowSeparator('hidden'),
                ]}>
                Nie masz jeszcze znajomych.
              </Text>
            ) : (
              <List.ForEach onDelete={vm.handleNativeFriendDelete}>
                {vm.friends.map((friend) => {
                  const avatarPath = friend.avatar_storage_path ?? null;
                  const avatarUrl = avatarPath ? vm.friendAvatarUrls[avatarPath] ?? null : null;
                  const fallbackInitial = friend.username.replace(/^@/, '').charAt(0).toUpperCase();
                  const captureLoadingId = `capture-${friend.id}`;
                  const isCaptureUpdating = vm.actionLoadingId === captureLoadingId;
                  return (
                    <RNHostView matchContents key={friend.id}>
                      <View
                        style={[
                          styles.socialRow,
                          vm.actionLoadingId === `friend-${friend.id}` && styles.rowDisabled,
                        ]}>
                        <View style={styles.outgoingHeader}>
                          <AvatarCircle
                            size={36}
                            url={avatarUrl}
                            storagePath={avatarPath}
                            emoji={friend.avatar_emoji}
                            fallbackInitial={fallbackInitial}
                          />
                          <RNText
                            numberOfLines={1}
                            style={[styles.socialTitle, { color: vm.colors.label, flex: 1 }]}>
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
                  );
                })}
              </List.ForEach>
            )}
          </Section>
          <Section title={vm.t('profile.account')}>
            <Button
              label={vm.t('profile.changePassword')}
              onPress={() => router.push('/profile/change-password')}
            />
            <Button label={vm.t('profile.signOut')} onPress={vm.handleSignOut} />
          </Section>
        </List>
        <Stack.Screen.Title large>{vm.t('profile.title')}</Stack.Screen.Title>
      </Host>
    </>
  );
}
