import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ProfileQrAvatarSection } from './ProfileQrAvatarSection';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { registerTabScrollToTop } from '../../lib/tabBarScrollActions';
import { typography } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';

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
      <View style={[styles.loadingContainer, { backgroundColor: vm.colors.secondarySystemBackground }]}>
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
        style={[styles.container, { backgroundColor: vm.colors.secondarySystemBackground }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 12,
            paddingBottom: bottomContentInset + 132,
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: vm.colors.tertiarySystemBackground }]}>
          <Text style={[styles.accountUsername, { color: vm.colors.label }]} numberOfLines={1}>
            {`@${vm.profileUsername ?? 'brak_nazwy_uzytkownika'}`}
          </Text>
          <View style={[styles.separator, { backgroundColor: vm.colors.separator }]} />
          <Text style={[styles.accountEmail, { color: vm.colors.secondaryLabel }]} numberOfLines={1}>
            {vm.user?.email ?? '-'}
          </Text>
        </View>

        <ProfileSectionTitle colors={vm.colors}>{vm.t('profile.myQrCode')}</ProfileSectionTitle>
        <View style={[styles.qrCard, { backgroundColor: vm.colors.tertiarySystemBackground }]}>
          <ProfileQrAvatarSection
            colors={vm.colors}
            qrPayload={vm.qrPayload}
            avatarSignedUrl={vm.avatarSignedUrl}
            avatarStoragePath={vm.profileRow?.avatar_storage_path ?? null}
            avatarEmoji={vm.profileRow?.avatar_emoji ?? null}
            initialLetter={vm.initialLetter}
          />
        </View>

        <ProfileSection colors={vm.colors}>
          <ProfileActionRow
            colors={vm.colors}
            title={vm.avatarBusy ? 'Przetwarzanie...' : 'Zdjecie z biblioteki'}
            onPress={vm.handlePickAvatarPhoto}
            disabled={vm.avatarBusy}
          />
          <ProfileActionRow
            colors={vm.colors}
            title="Usun awatar"
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
        </ProfileSection>

        <ProfileSectionTitle colors={vm.colors}>{vm.t('profile.addFriend')}</ProfileSectionTitle>
        <ProfileSection colors={vm.colors}>
          <ProfileActionRow
            colors={vm.colors}
            title={vm.t('profile.scanQr')}
            onPress={() => router.push('/friend-scan-qr')}
          />
          <TextInput
            key={`invite-input-${vm.inviteInputResetKey}`}
            style={[styles.input, { color: vm.colors.label }]}
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
          />
        </ProfileSection>

        {vm.requests.length > 0 ? (
          <>
            <ProfileSectionTitle colors={vm.colors}>
              {vm.t('profile.incomingInvites', { count: vm.requests.length })}
            </ProfileSectionTitle>
            <ProfileSection colors={vm.colors}>
              {vm.requests.map((request) => (
                <View key={request.id}>
                  <ProfileInfoRow
                    colors={vm.colors}
                    title={`@${request.requester.username}`}
                    subtitle="Zaproszenie przychodzace"
                  />
                  <ProfileActionRow
                    colors={vm.colors}
                    title="Przyjmij"
                    disabled={vm.actionLoadingId === request.id}
                    onPress={() => void vm.handleAccept(request.id)}
                  />
                  <ProfileActionRow
                    colors={vm.colors}
                    title="Usun zaproszenie"
                    destructive
                    disabled={vm.actionLoadingId === request.id}
                    onPress={() => void vm.handleReject(request.id)}
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
            <ProfileSection colors={vm.colors}>
              {vm.outgoingRequests.map((request) => (
                <View key={request.id}>
                  <ProfileInfoRow
                    colors={vm.colors}
                    title={`@${request.recipient.username}`}
                    subtitle={
                      vm.actionLoadingId === `outgoing-${request.id}` ? 'Usuwanie...' : 'Oczekuje na akceptacje'
                    }
                  />
                  <ProfileActionRow
                    colors={vm.colors}
                    title="Anuluj zaproszenie"
                    destructive
                    disabled={vm.actionLoadingId === `outgoing-${request.id}`}
                    onPress={() => void vm.handleCancelOutgoing(request.id)}
                  />
                </View>
              ))}
            </ProfileSection>
          </>
        ) : null}

        <ProfileSectionTitle colors={vm.colors}>
          {vm.t('profile.friends', { count: vm.friends.length })}
        </ProfileSectionTitle>
        <ProfileSection colors={vm.colors}>
          {vm.friends.length === 0 ? (
            <Text style={[styles.emptyText, { color: vm.colors.secondaryLabel }]}>Nie masz jeszcze znajomych.</Text>
          ) : null}
          {vm.friends.map((friend) => {
            const avatarPath = friend.avatar_storage_path ?? null;
            const captureLoadingId = `capture-${friend.id}`;
            const isCaptureUpdating = vm.actionLoadingId === captureLoadingId;
            return (
              <View key={friend.id}>
                <ProfileInfoRow
                  colors={vm.colors}
                  title={`@${friend.username}`}
                  subtitle={avatarPath ? 'Avatar ustawiony' : 'Brak avatara'}
                />
                <ProfileSwitchRow
                  colors={vm.colors}
                  title="Zezwalaj na screenshoty"
                  value={vm.resolveFriendCapturePolicy(friend.id) === 'allow'}
                  disabled={isCaptureUpdating}
                  onValueChange={(next) => {
                    void vm.handleToggleFriendCapture(friend.id, next);
                  }}
                />
                <ProfileActionRow
                  colors={vm.colors}
                  title="Usun ze znajomych"
                  destructive
                  disabled={vm.actionLoadingId === `friend-${friend.id}`}
                  onPress={() => {
                    const index = vm.friends.findIndex((f) => f.id === friend.id);
                    if (index >= 0) void vm.handleNativeFriendDelete([index]);
                  }}
                />
              </View>
            );
          })}
        </ProfileSection>

        <ProfileSectionTitle colors={vm.colors}>{vm.t('profile.account')}</ProfileSectionTitle>
        <ProfileSection colors={vm.colors}>
          <ProfileActionRow
            colors={vm.colors}
            title={vm.t('profile.changePassword')}
            onPress={() => router.push('/profile/change-password')}
          />
          <ProfileActionRow colors={vm.colors} title={vm.t('profile.signOut')} onPress={vm.handleSignOut} />
        </ProfileSection>
      </ScrollView>
    </>
  );
}

function ProfileSectionTitle({ children, colors }: { children: string; colors: ThemeColors }) {
  return <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>{children}</Text>;
}

function ProfileSection({
  children,
  colors,
}: {
  children: React.ReactNode;
  colors: ThemeColors;
}) {
  return <View style={[styles.card, styles.sectionCard, { backgroundColor: colors.tertiarySystemBackground }]}>{children}</View>;
}

function ProfileInfoRow({
  colors,
  title,
  subtitle,
}: {
  colors: ThemeColors;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowTitle, { color: colors.label }]} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.rowSubtitle, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function ProfileActionRow({
  colors,
  title,
  destructive,
  disabled,
  onPress,
}: {
  colors: ThemeColors;
  title: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.row, pressed && !disabled ? { backgroundColor: colors.systemFill } : null]}>
      <Text
        style={[
          styles.actionText,
          { color: destructive ? colors.destructive : colors.systemBlue },
          disabled ? { color: colors.tertiaryLabel } : null,
        ]}
        numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

function ProfileSwitchRow({
  colors,
  title,
  value,
  disabled,
  onValueChange,
}: {
  colors: ThemeColors;
  title: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.rowTitle, { color: disabled ? colors.tertiaryLabel : colors.label }]}>{title}</Text>
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
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  accountUsername: {
    ...typography.title2,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  accountEmail: {
    ...typography.body,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 20,
  },
  sectionTitle: {
    ...typography.title2,
    marginTop: 28,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  qrCard: {
    minHeight: 312,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    overflow: 'hidden',
  },
  sectionCard: {
    marginTop: 16,
  },
  row: {
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  switchRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  rowTitle: {
    ...typography.body,
  },
  rowSubtitle: {
    ...typography.footnote,
    marginTop: 2,
  },
  actionText: {
    ...typography.body,
  },
  input: {
    ...typography.body,
    minHeight: 54,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyText: {
    ...typography.body,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
});
