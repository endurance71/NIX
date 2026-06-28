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
import { Link, Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { registerTabScrollToTop } from '../../lib/tabBarScrollActions';
import { typography } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';
import { AppIcon } from '../ui/app-icon';
import type { AppIconName } from '../../theme/app-icons';
import { AvatarCircle } from '../ui/avatar-circle';

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
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <ProfileHero
          colors={vm.colors}
          username={`@${vm.profileUsername ?? 'brak_nazwy_uzytkownika'}`}
          email={vm.user?.email ?? '-'}
          avatarUrl={vm.avatarSignedUrl}
          avatarStoragePath={vm.profileRow?.avatar_storage_path ?? null}
          avatarEmoji={vm.profileRow?.avatar_emoji ?? null}
          fallbackInitial={vm.initialLetter}
        />

        <ProfileSection colors={vm.colors}>
          <ProfileQrLinkRow colors={vm.colors} title={vm.t('profile.myQrCode')} />
          <ProfileActionRow
            colors={vm.colors}
            title={vm.avatarBusy ? 'Przetwarzanie...' : 'Zdjecie z biblioteki'}
            onPress={vm.handlePickAvatarPhoto}
            disabled={vm.avatarBusy}
            icon="photoLibrary"
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
            icon="close"
          />
        </ProfileSection>

        <ProfileSectionTitle colors={vm.colors}>{vm.t('profile.addFriend')}</ProfileSectionTitle>
        <ProfileSection colors={vm.colors}>
          <ProfileActionRow
            colors={vm.colors}
            title={vm.t('profile.scanQr')}
            onPress={() => router.push('/friend-scan-qr')}
            icon="qrcode"
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
                    icon="profile"
                  />
                  <ProfileActionRow
                    colors={vm.colors}
                    title="Anuluj zaproszenie"
                    destructive
                    disabled={vm.actionLoadingId === `outgoing-${request.id}`}
                    onPress={() => void vm.handleCancelOutgoing(request.id)}
                    icon="close"
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
                    const index = vm.friends.findIndex((f) => f.id === friend.id);
                    if (index >= 0) void vm.handleNativeFriendDelete([index]);
                  }}
                  icon="personMinus"
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
            icon="lock"
          />
          <ProfileActionRow
            colors={vm.colors}
            title={vm.t('profile.signOut')}
            onPress={vm.handleSignOut}
            icon="signOut"
            destructive
          />
        </ProfileSection>
      </ScrollView>
    </>
  );
}

function ProfileSectionTitle({ children, colors }: { children: string; colors: ThemeColors }) {
  return <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>{children}</Text>;
}

function ProfileHero({
  colors,
  username,
  email,
  avatarUrl,
  avatarStoragePath,
  avatarEmoji,
  fallbackInitial,
}: {
  colors: ThemeColors;
  username: string;
  email: string;
  avatarUrl: string | null;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
  fallbackInitial: string;
}) {
  return (
    <View style={styles.hero}>
      <AvatarCircle
        size={104}
        url={avatarUrl}
        storagePath={avatarStoragePath}
        emoji={avatarEmoji}
        fallbackInitial={fallbackInitial}
      />
      <Text selectable style={[styles.heroTitle, { color: colors.label }]} numberOfLines={1}>
        {username}
      </Text>
      <Text selectable style={[styles.heroSubtitle, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {email}
      </Text>
    </View>
  );
}

function ProfileSection({
  children,
  colors,
}: {
  children: React.ReactNode;
  colors: ThemeColors;
}) {
  return <View style={[styles.card, styles.sectionCard, { backgroundColor: colors.secondarySystemBackground }]}>{children}</View>;
}

function ProfileInfoRow({
  colors,
  title,
  subtitle,
  icon,
  avatar,
}: {
  colors: ThemeColors;
  title: string;
  subtitle?: string;
  icon?: AppIconName;
  avatar?: {
    url?: string | null;
    storagePath?: string | null;
    emoji?: string | null;
    fallbackInitial?: string | null;
  };
}) {
  return (
    <View style={[styles.row, { borderBottomColor: colors.separator }]}>
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
          <View style={[styles.iconTile, { backgroundColor: colors.systemFill }]}>
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
        <AppIcon name="chevronRight" size={15} color={colors.tertiaryLabel} />
      </View>
    </View>
  );
}

function ProfileQrLinkRow({ colors, title }: { colors: ThemeColors; title: string }) {
  return (
    <Link href="/(tabs)/profile/my-code" asChild>
      <Link.Trigger>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: colors.separator },
            pressed ? { backgroundColor: colors.systemFill } : null,
          ]}>
          <View style={styles.rowContent}>
            <Link.AppleZoom>
              <View style={[styles.iconTile, { backgroundColor: colors.systemFill }]}>
                <AppIcon name="qrcode" size={17} color={colors.label} />
              </View>
            </Link.AppleZoom>
            <Text style={[styles.actionText, { color: colors.label }]} numberOfLines={1}>
              {title}
            </Text>
            <AppIcon name="chevronRight" size={15} color={colors.tertiaryLabel} />
          </View>
        </Pressable>
      </Link.Trigger>
    </Link>
  );
}

function ProfileActionRow({
  colors,
  title,
  destructive,
  disabled,
  onPress,
  icon,
}: {
  colors: ThemeColors;
  title: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
  icon?: AppIconName;
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
        { borderBottomColor: colors.separator },
        pressed && !disabled ? { backgroundColor: colors.systemFill } : null,
      ]}>
      <View style={styles.rowContent}>
        {icon ? (
          <View style={[styles.iconTile, { backgroundColor: colors.systemFill }]}>
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
        <AppIcon name="chevronRight" size={15} color={disabled ? colors.tertiaryLabel : colors.tertiaryLabel} />
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
          <View style={[styles.iconTile, { backgroundColor: colors.systemFill }]}>
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
  },
  card: {
    borderRadius: 28,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 28,
  },
  heroTitle: {
    ...typography.largeTitle,
    maxWidth: '100%',
    marginTop: 18,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...typography.title2,
    maxWidth: '100%',
    marginTop: 2,
    fontWeight: '400',
    textAlign: 'center',
  },
  sectionTitle: {
    ...typography.footnote,
    marginTop: 28,
    marginBottom: 8,
    paddingHorizontal: 24,
    textTransform: 'uppercase',
  },
  sectionCard: {
    marginTop: 20,
  },
  row: {
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#54545866',
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconTile: {
    marginRight: 16,
    width: 31,
    height: 31,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  avatarWrapper: {
    marginRight: 16,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#54545866',
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
    minHeight: 56,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
});
