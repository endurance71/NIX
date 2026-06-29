import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQueryClient } from '@tanstack/react-query';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { registerTabScrollToTop } from '../../lib/tabBarScrollActions';
import { typography } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';
import { AppIcon } from '../ui/app-icon';
import type { AppIconName } from '../../theme/app-icons';
import { AvatarCircle } from '../ui/avatar-circle';
import { BottomSheet, RNHostView } from '@expo/ui';
import { clearProfileAvatar, createSignedAvatarUrl } from '../../services/avatarService';
import { removeFriend, cancelOutgoingFriendRequest } from '../../services/friendService';
import { queryKeys } from '../../lib/queryKeys';
import { notifyDomainError, notifySuccess, notifyInfo, notifyError } from '../../lib/appNotify';
import { ConfirmationSheet } from '../ui/confirmation-sheet';

export default function ProfileScreenSurface() {
  const vm = useProfileScreen();
  const { isDark } = useAppTheme();
  const { bottomContentInset } = useScreenInsets('tabStackList');
  const settingsCardColor = resolveSettingsCardColor(vm.colors, isDark);
  const queryClient = useQueryClient();

  const [isRemoveAvatarOpen, setIsRemoveAvatarOpen] = useState(false);
  const [friendToRemove, setFriendToRemove] = useState<{
    id: string;
    username: string;
    avatarStoragePath: string | null;
    avatarEmoji: string | null;
  } | null>(null);
  const [requestToCancel, setRequestToCancel] = useState<{
    id: string;
    username: string;
    avatarStoragePath: string | null;
    avatarEmoji: string | null;
  } | null>(null);

  const [friendAvatarUrl, setFriendAvatarUrl] = useState<string | null>(null);
  const [requestAvatarUrl, setRequestAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!friendToRemove?.avatarStoragePath) {
        setFriendAvatarUrl(null);
        return;
      }
      try {
        const url = await createSignedAvatarUrl(friendToRemove.avatarStoragePath);
        if (!cancelled) setFriendAvatarUrl(url);
      } catch (err) {
        console.warn('Failed to load signed avatar url for friend to remove', err);
        if (!cancelled) setFriendAvatarUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [friendToRemove]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!requestToCancel?.avatarStoragePath) {
        setRequestAvatarUrl(null);
        return;
      }
      try {
        const url = await createSignedAvatarUrl(requestToCancel.avatarStoragePath);
        if (!cancelled) setRequestAvatarUrl(url);
      } catch (err) {
        console.warn('Failed to load signed avatar url for request to cancel', err);
        if (!cancelled) setRequestAvatarUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestToCancel]);

  useEffect(() => {
    return registerTabScrollToTop('profile', () => {
      router.replace('/(tabs)/profile');
    });
  }, []);

  if (vm.profilePending) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: vm.colors.background }]}>
        <StatusBar style={vm.statusBarStyle} />
        <ActivityIndicator color={vm.colors.label} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerLargeTitle: true, title: vm.t('profile.title') }} />
      <StatusBar style={vm.statusBarStyle} />
      <ScrollView
        style={[styles.container, { backgroundColor: vm.colors.background }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 12,
            paddingBottom: bottomContentInset,
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.handleListRefresh}
            tintColor={vm.colors.label}
            colors={[vm.colors.accent]}
            progressBackgroundColor={vm.colors.secondarySystemBackground}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <ProfileAccountCard
          colors={vm.colors}
          backgroundColor={settingsCardColor}
          username={`@${vm.profileUsername ?? 'brak_nazwy_uzytkownika'}`}
          email={vm.user?.email ?? '-'}
          avatarUrl={vm.avatarSignedUrl}
          avatarStoragePath={vm.profileRow?.avatar_storage_path ?? null}
          avatarEmoji={vm.profileRow?.avatar_emoji ?? null}
          fallbackInitial={vm.initialLetter}
          changeAvatarTitle={vm.avatarBusy ? vm.t('profile.changeAvatarLoading') : vm.t('profile.changeAvatar')}
          removeAvatarTitle={vm.t('profile.removeAvatar')}
          avatarBusy={vm.avatarBusy}
          hasAvatar={vm.hasAvatar}
          onChangeAvatar={vm.handlePickAvatarPhoto}
          onRemoveAvatar={() => setIsRemoveAvatarOpen(true)}
        />

        <ProfileSectionTitle colors={vm.colors}>{vm.t('profile.addFriend')}</ProfileSectionTitle>
        <ProfileSection backgroundColor={settingsCardColor}>
          <ProfileActionRow
            colors={vm.colors}
            title={vm.t('profile.myQrCode')}
            onPress={() => router.push('/(tabs)/profile/my-code')}
            icon="qrcode"
            showChevron
          />
          <ProfileActionRow
            colors={vm.colors}
            title={vm.t('profile.scanQr')}
            onPress={() => router.push('/friend-scan-qr')}
            icon="qrcode"
            showChevron
          />
          <TextInput
            key={`invite-input-${vm.inviteInputResetKey}`}
            style={[styles.input, { color: vm.colors.label, borderBottomColor: vm.colors.separator }]}
            placeholder="@nazwa_uzytkownika"
            placeholderTextColor={vm.colors.tertiaryLabel}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={vm.setSearchUsername}
          />
          <ProfileActionRow
            colors={vm.colors}
            title={vm.actionLoadingId === 'invite' ? vm.t('profile.sendInviteLoading') : vm.t('profile.sendInvite')}
            onPress={vm.handleSendInvite}
            disabled={vm.actionLoadingId === 'invite'}
            icon="send"
            showSeparator={false}
          />
        </ProfileSection>

        {vm.requests.length > 0 ? (
          <>
            <ProfileSectionTitle colors={vm.colors}>
              {vm.t('profile.incomingInvites', { count: vm.requests.length })}
            </ProfileSectionTitle>
            <ProfileSection backgroundColor={settingsCardColor}>
              {vm.requests.map((request) => (
                <View key={request.id}>
                  <ProfileInfoRow
                    colors={vm.colors}
                    title={`@${request.requester.username}`}
                    subtitle="Zaproszenie przychodzace"
                    icon="profile"
                  />
                  <ProfileActionRow
                    colors={vm.colors}
                    title="Przyjmij"
                    disabled={vm.actionLoadingId === request.id}
                    onPress={() => void vm.handleAccept(request.id)}
                    icon="personAdd"
                  />
                  <ProfileActionRow
                    colors={vm.colors}
                    title="Usun zaproszenie"
                    destructive
                    disabled={vm.actionLoadingId === request.id}
                    onPress={() => void vm.handleReject(request.id)}
                    icon="trash"
                    showSeparator={false}
                  />
                </View>
              ))}
            </ProfileSection>
          </>
        ) : null}

        {vm.outgoingRequests.length > 0 ? (
          <>
            <ProfileSectionTitle colors={vm.colors}>
              {vm.t('profile.outgoingInvites', { count: vm.outgoingRequests.length })}
            </ProfileSectionTitle>
            <ProfileSection backgroundColor={settingsCardColor}>
              {vm.outgoingRequests.map((request) => (
                <View key={request.id}>
                  <ProfileInfoRow
                    colors={vm.colors}
                    title={`@${request.recipient.username}`}
                    subtitle={
                      vm.actionLoadingId === `outgoing-${request.id}` ? 'Usuwanie...' : 'Oczekuje na akceptacje'
                    }
                    icon="profile"
                  />
                  <ProfileActionRow
                    colors={vm.colors}
                    title="Anuluj zaproszenie"
                    destructive
                    disabled={vm.actionLoadingId === `outgoing-${request.id}`}
                    onPress={() => {
                      setRequestToCancel({
                        id: request.id,
                        username: request.recipient.username,
                        avatarStoragePath: request.recipient.avatar_storage_path ?? null,
                        avatarEmoji: request.recipient.avatar_emoji ?? null,
                      });
                    }}
                    icon="close"
                    showChevron
                    showSeparator={false}
                  />
                </View>
              ))}
            </ProfileSection>
          </>
        ) : null}

        <ProfileSectionTitle colors={vm.colors}>
          {vm.t('profile.friends', { count: vm.friends.length })}
        </ProfileSectionTitle>
        <ProfileSection backgroundColor={settingsCardColor}>
          {vm.friends.length === 0 ? (
            <Text style={[styles.emptyText, { color: vm.colors.secondaryLabel }]}>Nie masz jeszcze znajomych.</Text>
          ) : null}
          {vm.friends.map((friend) => {
            const avatarPath = friend.avatar_storage_path ?? null;
            const avatarUrl = avatarPath ? vm.friendAvatarUrls[avatarPath] ?? null : null;
            const captureLoadingId = `capture-${friend.id}`;
            const isCaptureUpdating = vm.actionLoadingId === captureLoadingId;
            return (
              <View key={friend.id}>
                <ProfileInfoRow
                  colors={vm.colors}
                  title={`@${friend.username}`}
                  subtitle={avatarPath ? 'Avatar ustawiony' : 'Brak avatara'}
                  avatar={{
                    url: avatarUrl,
                    storagePath: avatarPath,
                    emoji: friend.avatar_emoji ?? null,
                    fallbackInitial: friend.username,
                  }}
                />
                <ProfileSwitchRow
                  colors={vm.colors}
                  title="Zezwalaj na screenshoty"
                  value={vm.resolveFriendCapturePolicy(friend.id) === 'allow'}
                  disabled={isCaptureUpdating}
                  onValueChange={(next) => {
                    void vm.handleToggleFriendCapture(friend.id, next);
                  }}
                  icon="shield"
                />
                <ProfileActionRow
                  colors={vm.colors}
                  title="Usun ze znajomych"
                  destructive
                  disabled={vm.actionLoadingId === `friend-${friend.id}`}
                  onPress={() => {
                    setFriendToRemove({
                      id: friend.id,
                      username: friend.username,
                      avatarStoragePath: friend.avatar_storage_path ?? null,
                      avatarEmoji: friend.avatar_emoji ?? null,
                    });
                  }}
                  icon="personMinus"
                  showChevron
                  showSeparator={false}
                />
              </View>
            );
          })}
        </ProfileSection>

        <ProfileSectionTitle colors={vm.colors}>{vm.t('profile.account')}</ProfileSectionTitle>
        <ProfileSection backgroundColor={settingsCardColor}>
          <ProfileActionRow
            colors={vm.colors}
            title={vm.t('profile.changePassword')}
            onPress={() => router.push('/profile/change-password')}
            icon="lock"
            showChevron
          />
          <ProfileActionRow
            colors={vm.colors}
            title={vm.t('profile.signOut')}
            onPress={vm.handleSignOut}
            icon="signOut"
            destructive
            showSeparator={false}
          />
        </ProfileSection>
      </ScrollView>

      <BottomSheet isPresented={isRemoveAvatarOpen} onDismiss={() => setIsRemoveAvatarOpen(false)}>
        <RNHostView matchContents>
          <ConfirmationSheet
            title="Usunąć awatar?"
            message="Po usunięciu wrócisz do domyślnego widoku profilu."
            avatarUrl={vm.avatarSignedUrl}
            avatarStoragePath={vm.profileRow?.avatar_storage_path}
            avatarEmoji={vm.profileRow?.avatar_emoji}
            fallbackInitial={vm.initialLetter}
            primaryActionLabel="Usuń awatar"
            onCancel={() => setIsRemoveAvatarOpen(false)}
            onConfirm={async () => {
              await clearProfileAvatar();
              await queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile });
              await queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
              await queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
              notifySuccess('Awatar usunięty.');
              setIsRemoveAvatarOpen(false);
            }}
          />
        </RNHostView>
      </BottomSheet>

      <BottomSheet isPresented={friendToRemove !== null} onDismiss={() => setFriendToRemove(null)}>
        <RNHostView matchContents>
          {friendToRemove ? (
            <ConfirmationSheet
              title={`Usunąć @${friendToRemove.username}?`}
              message="Ta osoba zniknie z Twojej listy znajomych."
              avatarUrl={friendAvatarUrl}
              avatarStoragePath={friendToRemove.avatarStoragePath}
              avatarEmoji={friendToRemove.avatarEmoji}
              fallbackInitial={friendToRemove.username}
              primaryActionLabel="Usuń znajomego"
              onCancel={() => setFriendToRemove(null)}
              onConfirm={async () => {
                await removeFriend(friendToRemove.id);
                await queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
                await queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
                setFriendToRemove(null);
              }}
            />
          ) : (
            <View />
          )}
        </RNHostView>
      </BottomSheet>

      <BottomSheet isPresented={requestToCancel !== null} onDismiss={() => setRequestToCancel(null)}>
        <RNHostView matchContents>
          {requestToCancel ? (
            <ConfirmationSheet
              title={`Anulować zaproszenie do @${requestToCancel.username}?`}
              message="Ta osoba nie zobaczy już oczekującego zaproszenia od Ciebie."
              avatarUrl={requestAvatarUrl}
              avatarStoragePath={requestToCancel.avatarStoragePath}
              avatarEmoji={requestToCancel.avatarEmoji}
              fallbackInitial={requestToCancel.username}
              primaryActionLabel="Anuluj zaproszenie"
              onCancel={() => setRequestToCancel(null)}
              onConfirm={async () => {
                await cancelOutgoingFriendRequest(requestToCancel.id);
                await queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests });
                notifyInfo('Zaproszenie anulowane.');
                setRequestToCancel(null);
              }}
            />
          ) : (
            <View />
          )}
        </RNHostView>
      </BottomSheet>
    </>
  );
}

function ProfileSectionTitle({ children, colors }: { children: string; colors: ThemeColors }) {
  return <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>{children}</Text>;
}

function resolveSettingsCardColor(colors: ThemeColors, isDark: boolean) {
  return isDark ? colors.secondarySystemBackground : colors.tertiarySystemBackground;
}

function ProfileAccountCard({
  colors,
  backgroundColor,
  username,
  email,
  avatarUrl,
  avatarStoragePath,
  avatarEmoji,
  fallbackInitial,
  changeAvatarTitle,
  removeAvatarTitle,
  avatarBusy,
  hasAvatar,
  onChangeAvatar,
  onRemoveAvatar,
}: {
  colors: ThemeColors;
  backgroundColor: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
  fallbackInitial: string;
  changeAvatarTitle: string;
  removeAvatarTitle: string;
  avatarBusy: boolean;
  hasAvatar: boolean;
  onChangeAvatar: () => void;
  onRemoveAvatar: () => void;
}) {
  return (
    <View style={[styles.accountCard, { backgroundColor }]}>
      <View style={[styles.accountHeader, { borderBottomColor: colors.separator }]}>
        <AvatarCircle
          size={58}
          url={avatarUrl}
          storagePath={avatarStoragePath}
          emoji={avatarEmoji}
          fallbackInitial={fallbackInitial}
        />
        <View style={styles.accountText}>
          <Text selectable style={[styles.accountTitle, { color: colors.label }]} numberOfLines={1}>
            {username}
          </Text>
          <Text selectable style={[styles.accountSubtitle, { color: colors.secondaryLabel }]} numberOfLines={1}>
            {email}
          </Text>
        </View>
      </View>
      <ProfileActionRow
        colors={colors}
        title={changeAvatarTitle}
        onPress={onChangeAvatar}
        disabled={avatarBusy}
        icon="photoLibrary"
      />
      <ProfileActionRow
        colors={colors}
        title={removeAvatarTitle}
        destructive
        disabled={avatarBusy || !hasAvatar}
        onPress={onRemoveAvatar}
        icon="close"
        showChevron
        showSeparator={false}
      />
    </View>
  );
}

function ProfileSection({
  children,
  backgroundColor,
  topSpacing = false,
}: {
  children: React.ReactNode;
  backgroundColor: string;
  topSpacing?: boolean;
}) {
  return <View style={[styles.card, topSpacing ? styles.sectionTopSpacing : null, { backgroundColor }]}>{children}</View>;
}

function ProfileInfoRow({
  colors,
  title,
  subtitle,
  icon,
  avatar,
  showSeparator = true,
}: {
  colors: ThemeColors;
  title: string;
  subtitle?: string;
  icon?: AppIconName;
  showSeparator?: boolean;
  avatar?: {
    url?: string | null;
    storagePath?: string | null;
    emoji?: string | null;
    fallbackInitial?: string | null;
  };
}) {
  return (
    <View style={[styles.row, showSeparator ? { borderBottomColor: colors.separator } : styles.rowNoSeparator]}>
      <View style={styles.rowContent}>
        {avatar ? (
          <View style={styles.avatarWrapper}>
            <AvatarCircle
              size={32}
              url={avatar.url}
              storagePath={avatar.storagePath}
              emoji={avatar.emoji}
              fallbackInitial={avatar.fallbackInitial}
            />
          </View>
        ) : icon ? (
          <View style={styles.iconTile}>
            <AppIcon name={icon} size={17} color={colors.label} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.label }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.rowSubtitle, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ProfileActionRow({
  colors,
  title,
  destructive,
  disabled,
  onPress,
  icon,
  showChevron = false,
  showSeparator = true,
}: {
  colors: ThemeColors;
  title: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
  icon?: AppIconName;
  showChevron?: boolean;
  showSeparator?: boolean;
}) {
  const foregroundColor = destructive ? colors.destructive : colors.label;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.row,
        showSeparator ? { borderBottomColor: colors.separator } : styles.rowNoSeparator,
        pressed && !disabled ? { backgroundColor: colors.systemFill } : null,
      ]}>
      <View style={styles.rowContent}>
        {icon ? (
          <View style={styles.iconTile}>
            <AppIcon
              name={icon}
              size={17}
              color={disabled ? colors.tertiaryLabel : foregroundColor}
            />
          </View>
        ) : null}
        <Text
          style={[
            styles.actionText,
            { color: foregroundColor },
            disabled ? { color: colors.tertiaryLabel } : null,
          ]}
          numberOfLines={1}>
          {title}
        </Text>
        {showChevron ? <AppIcon name="chevronRight" size={15} color={colors.tertiaryLabel} /> : null}
      </View>
    </Pressable>
  );
}

function ProfileSwitchRow({
  colors,
  title,
  value,
  disabled,
  onValueChange,
  icon,
}: {
  colors: ThemeColors;
  title: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
  icon?: AppIconName;
}) {
  return (
    <View style={[styles.switchRow, { borderBottomColor: colors.separator }]}>
      <View style={styles.rowContent}>
        {icon ? (
          <View style={styles.iconTile}>
            <AppIcon name={icon} size={17} color={colors.label} />
          </View>
        ) : null}
        <Text style={[styles.rowTitle, { color: disabled ? colors.tertiaryLabel : colors.label }]}>{title}</Text>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 8,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  accountCard: {
    overflow: 'hidden',
    borderRadius: 24,
    borderCurve: 'continuous',
  },
  accountHeader: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accountText: {
    flex: 1,
    marginLeft: 14,
    marginRight: 12,
  },
  accountTitle: {
    ...typography.title2,
    fontSize: 20,
    lineHeight: 25,
  },
  accountSubtitle: {
    ...typography.callout,
    marginTop: 1,
    fontWeight: '400',
  },
  sectionTitle: {
    ...typography.footnote,
    marginTop: 30,
    marginBottom: 7,
    paddingHorizontal: 16,
    textTransform: 'uppercase',
  },
  sectionTopSpacing: {
    marginTop: 28,
  },
  row: {
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#54545866',
  },
  rowNoSeparator: {
    borderBottomWidth: 0,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconTile: {
    marginRight: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    marginRight: 14,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#54545866',
  },
  rowTitle: {
    ...typography.body,
    flex: 1,
  },
  rowSubtitle: {
    ...typography.footnote,
    marginTop: 2,
  },
  actionText: {
    ...typography.body,
    flex: 1,
  },
  input: {
    ...typography.body,
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
});
