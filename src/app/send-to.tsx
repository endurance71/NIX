import { paramFirst, decodeParamUri } from '../lib/previewRoute';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCEPTED_FRIENDS_LIMIT, listAcceptedFriends, type FriendProfile } from '../services/friendService';
import { usePhotoDraft } from '../context/photoDraft';
import { queryKeys } from '../lib/queryKeys';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { AppIcon } from '../components/ui/app-icon';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { Button } from '../components/ui/button';
import { normalizeNixViewDurationSec } from '../lib/nixViewDuration';
import { applySuggestedRecipientOnce } from '../lib/suggestedRecipient';
import { toggleSetValue } from '../lib/selection';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { selection } from '../lib/haptics';
import { APP_ICON_SIZE } from '../theme/app-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useSignedAvatarUrls } from '../hooks/useSignedAvatarUrls';
import { useSendMedia } from '../hooks/useSendMedia';
import { OfflineStatusBanner } from '../components/auth/OfflineStatusBanner';
import type { InboxBundle } from '../lib/inboxQuery';
import {
  buildRecipientSections,
  collectInboxRecentActivity,
  recentRecipientIds,
  recipientDisplayName,
  summarizeRecipientNames,
} from '../lib/sendRecipients';
import { useFriendshipOverview } from '../hooks/useFriendshipBadges';
import { friendshipBadgeAccessibilityLabel, type FriendshipBadge } from '../lib/friendStreaks';
import { StreakBadge } from '../components/friend/StreakBadge';

const RECENT_RECIPIENTS_LIMIT = 5;

type RecipientListItem =
  | { type: 'header'; key: string; title: string }
  | { type: 'friend'; key: string; profile: FriendProfile; badge: FriendshipBadge | null };

type FriendRecipientRowProps = {
  avatarUrl: string | null;
  item: FriendProfile;
  badge: FriendshipBadge | null;
  onToggle: (id: string) => void;
  selected: boolean;
  disabled: boolean;
};

function FriendRecipientRow({
  avatarUrl,
  item,
  badge,
  onToggle,
  selected,
  disabled,
}: FriendRecipientRowProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const name = recipientDisplayName(item, t('common.unknown'));
  const showUsername = Boolean(item.display_name?.trim() && item.username);
  const a11yLabel = [
    name,
    friendshipBadgeAccessibilityLabel(badge, t),
    showUsername ? `@${item.username}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      accessibilityLabel={a11yLabel}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.profileRow,
        { borderBottomColor: colors.separator },
        pressed && { backgroundColor: colors.systemFill },
      ]}
      onPress={() => onToggle(item.id)}>
      <View style={styles.avatarWrap}>
        <AvatarCircle
          size={40}
          url={avatarUrl}
          storagePath={item.avatar_storage_path}
          emoji={item.avatar_emoji}
          fallbackInitial={item.username?.charAt(0)}
        />
      </View>
      <View style={styles.rowText}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.label }]}>
            {name}
          </Text>
          <StreakBadge badge={badge} decorative />
        </View>
        {showUsername ? (
          <Text numberOfLines={1} style={[styles.username, { color: colors.secondaryLabel }]}>
            @{item.username}
          </Text>
        ) : null}
      </View>
      <AppIcon
        name={selected ? 'checkCircleFill' : 'circle'}
        size={APP_ICON_SIZE.xxl}
        color={selected ? colors.accent : colors.tertiaryLabel}
      />
    </Pressable>
  );
}

function SectionHeader({ title }: { title: string }) {
  const { colors } = useAppTheme();
  return (
    <Text accessibilityRole="header" style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>
      {title}
    </Text>
  );
}

function openFromEmptyState(pathname: '/friend-scan-qr' | '/friend-my-code') {
  router.dismiss();
  setTimeout(() => router.push(pathname), 50);
}

function EmptyRecipients({
  stylesForTheme,
  offlineSnapshotMissing,
}: {
  stylesForTheme: ReturnType<typeof createStyles>;
  offlineSnapshotMissing: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  if (offlineSnapshotMissing) {
    return (
      <View style={stylesForTheme.emptyState}>
        <Text style={stylesForTheme.emptyStateText}>{t('sendTo.offlineCacheMissing')}</Text>
      </View>
    );
  }
  return (
    <View style={stylesForTheme.emptyState}>
      <Text style={stylesForTheme.emptyStateText}>{t('sendTo.empty')}</Text>
      <View style={styles.emptyActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => openFromEmptyState('/friend-scan-qr')}
          style={({ pressed }) => [
            styles.emptyAction,
            { backgroundColor: colors.secondarySystemFill },
            pressed && styles.pressed,
          ]}>
          <AppIcon name="personAdd" size={APP_ICON_SIZE.md} color={colors.accent} />
          <Text style={[styles.emptyActionText, { color: colors.accent }]}>
            {t('sendTo.addFriendsCta')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => openFromEmptyState('/friend-my-code')}
          style={({ pressed }) => [
            styles.emptyAction,
            { backgroundColor: colors.secondarySystemFill },
            pressed && styles.pressed,
          ]}>
          <AppIcon name="myQrCode" size={APP_ICON_SIZE.md} color={colors.accent} />
          <Text style={[styles.emptyActionText, { color: colors.accent }]}>
            {t('sendTo.myQrCodeCta')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function RecipientList({
  showInitialLoader,
  canUseNetworkSession,
  isError,
  isFetching,
  refetch,
  items,
  hasProfiles,
  searchQuery,
  extraData,
  renderItem,
  stylesForTheme,
  isOfflineRecipientSnapshotMissing,
}: {
  showInitialLoader: boolean;
  canUseNetworkSession: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
  items: RecipientListItem[];
  hasProfiles: boolean;
  searchQuery: string;
  extraData: unknown;
  renderItem: (info: { item: RecipientListItem }) => React.ReactElement;
  stylesForTheme: ReturnType<typeof createStyles>;
  isOfflineRecipientSnapshotMissing: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  if (showInitialLoader) return <ActivityIndicator color={colors.label} style={styles.loading} />;
  if (canUseNetworkSession && isError) {
    return (
      <View style={stylesForTheme.emptyState}>
        <Text style={stylesForTheme.emptyStateText}>{t('sendTo.loadFailure')}</Text>
        <Button
          title={t('common.retry')}
          onPress={() => void refetch()}
          variant="tertiary"
          loading={isFetching}
          style={styles.retryButton}
        />
      </View>
    );
  }
  return (
    <View style={stylesForTheme.listWrap}>
      <FlashList
        data={items}
        extraData={extraData}
        getItemType={(item) => item.type}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={stylesForTheme.listContent}
        ListEmptyComponent={
          hasProfiles ? (
            <View style={stylesForTheme.emptyState}>
              <Text style={stylesForTheme.emptyStateText}>
                {t('sendTo.noSearchResults', { query: searchQuery.trim() })}
              </Text>
            </View>
          ) : (
            <EmptyRecipients
              stylesForTheme={stylesForTheme}
              offlineSnapshotMissing={isOfflineRecipientSnapshotMissing}
            />
          )
        }
      />
    </View>
  );
}

function SendToHeader({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerSide} />
      <Text accessibilityRole="header" numberOfLines={1} style={[styles.headerTitle, { color: colors.label }]}>
        {t('sendTo.title')}
      </Text>
      <View style={[styles.headerSide, styles.headerSideEnd]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: colors.secondarySystemFill },
            (pressed || disabled) && styles.pressed,
          ]}>
          <AppIcon name="close" size={APP_ICON_SIZE.sm} color={colors.secondaryLabel} />
        </Pressable>
      </View>
    </View>
  );
}

function RecipientSearchField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View style={[styles.searchField, { backgroundColor: colors.secondarySystemFill }]}>
      <AppIcon name="search" size={APP_ICON_SIZE.sm} color={colors.secondaryLabel} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={t('sendTo.searchPlaceholder')}
        placeholderTextColor={colors.secondaryLabel}
        accessibilityLabel={t('sendTo.searchPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={[styles.searchInput, { color: colors.label }]}
      />
    </View>
  );
}

function useRecipientItems(profiles: FriendProfile[], searchQuery: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Best friends and badges come from the streak RPC; without it both are simply absent.
  const { badges, bestFriendIds } = useFriendshipOverview();
  const bundle = queryClient.getQueryData<InboxBundle>(queryKeys.inboxNixesBundle);
  const recentIds = recentRecipientIds(
    collectInboxRecentActivity(bundle),
    profiles.map((profile) => profile.id),
    RECENT_RECIPIENTS_LIMIT,
  );
  const { best, recent, others } = buildRecipientSections({
    profiles,
    bestFriendIds,
    recentIds,
    query: searchQuery,
  });
  const items: RecipientListItem[] = [];
  const pushFriend = (profile: FriendProfile, key: string) =>
    items.push({ type: 'friend', key, profile, badge: badges.get(profile.id) ?? null });
  if (best.length > 0) {
    items.push({ type: 'header', key: 'header-best', title: t('sendTo.bestFriendsSection') });
    for (const profile of best) pushFriend(profile, `best-${profile.id}`);
  }
  if (recent.length > 0) {
    items.push({ type: 'header', key: 'header-recent', title: t('sendTo.recentSection') });
    for (const profile of recent) pushFriend(profile, `recent-${profile.id}`);
  }
  if ((best.length > 0 || recent.length > 0) && others.length > 0) {
    items.push({ type: 'header', key: 'header-friends', title: t('sendTo.friendsSection') });
  }
  for (const profile of others) pushFriend(profile, profile.id);
  return items;
}

export default function SendToSheet() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const { colors } = useAppTheme();
  const stylesForTheme = createStyles(colors, topContentInset, bottomContentInset);
  const rawParams = useLocalSearchParams<{
    uri?: string;
    viewDurationSec?: string;
    mode?: string;
    recipientId?: string;
  }>();
  const { draft: draftPhoto } = usePhotoDraft();
  const photoUri = draftPhoto?.uri ?? decodeParamUri(paramFirst(rawParams.uri));
  const viewDurationSec = normalizeNixViewDurationSec(paramFirst(rawParams.viewDurationSec));
  const isVideo = paramFirst(rawParams.mode) === 'video';
  const { send, isSending } = useSendMedia({ isVideo, photoUri });
  const { user, isOfflineAuthenticated, canUseNetworkSession } = useAuth();
  const {
    data: profilesData,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: ACCEPTED_FRIENDS_LIMIT }),
    enabled: Boolean(user) && canUseNetworkSession,
    staleTime: 1000 * 60 * 2,
  });

  const profiles = profilesData ?? [];
  const isOfflineRecipientSnapshotMissing = isOfflineAuthenticated && profilesData === undefined;

  // Only refetch when stale — formSheet can re-fire focus during presentation;
  // invalidateQueries would cancel in-flight fetches and leave isPending spinning.
  useFocusEffect(
    useCallback(() => {
      if (!canUseNetworkSession) return;
      void queryClient.refetchQueries({
        queryKey: queryKeys.acceptedFriends,
        type: 'active',
        stale: true,
      });
    }, [canUseNetworkSession, queryClient]),
  );

  const showInitialLoader = canUseNetworkSession && isLoading && profiles.length === 0;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const didPreselectRecipientRef = useRef(false);
  const suggestedRecipientId = paramFirst(rawParams.recipientId);

  useEffect(() => {
    if (profilesData === undefined) return;
    const { applied, selectedId } = applySuggestedRecipientOnce({
      alreadyApplied: didPreselectRecipientRef.current,
      recipientId: suggestedRecipientId,
      acceptedFriendIds: profilesData.map((profile) => profile.id),
    });
    didPreselectRecipientRef.current = applied;
    if (selectedId) {
      setSelectedIds(new Set([selectedId]));
    }
  }, [profilesData, suggestedRecipientId]);

  // Keep the order in which people were picked for the button label.
  const selectedIdList = Array.from(selectedIds);
  const selectedCount = selectedIdList.length;
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile] as const));
  const selectedNames = selectedIdList.map((id) => {
    const profile = profilesById.get(id);
    return profile ? recipientDisplayName(profile, t('common.unknown')) : t('common.unknown');
  });
  const summary = summarizeRecipientNames(selectedNames);
  const sendLabel = isSending
    ? t('sendTo.securing')
    : !summary
      ? t('sendTo.selectRecipients')
      : summary.extra > 0
        ? t('sendTo.sendToNamesMore', { names: summary.names, count: summary.extra })
        : t('sendTo.sendToNames', { names: summary.names });

  const avatarUrls = useSignedAvatarUrls(
    profiles.map((profile) => profile.avatar_storage_path),
    { enabled: canUseNetworkSession },
  );
  const items = useRecipientItems(profiles, searchQuery);

  const handleSend = () => {
    void send({
      recipientIds: selectedIdList,
      viewDurationSec,
      returnToPeerId: suggestedRecipientId,
    });
  };

  const toggleSelection = (id: string) => {
    selection();
    setSelectedIds((prev) => toggleSetValue(prev, id));
  };

  const renderItem = ({ item }: { item: RecipientListItem }) =>
    item.type === 'header' ? (
      <SectionHeader title={item.title} />
    ) : (
      <FriendRecipientRow
        item={item.profile}
        badge={item.badge}
        selected={selectedIds.has(item.profile.id)}
        onToggle={toggleSelection}
        disabled={isSending}
        avatarUrl={
          item.profile.avatar_storage_path
            ? (avatarUrls[item.profile.avatar_storage_path] ?? null)
            : null
        }
      />
    );

  const sendDisabled = selectedCount === 0 || isSending;

  return (
    <View style={stylesForTheme.container}>
      {/* Swipe-to-dismiss is blocked while the media is being secured (SEND-11); for a sheet
          this sets UIKit's isModalInPresentation. */}
      <Stack.Screen options={{ gestureEnabled: !isSending }} />
      <SendToHeader disabled={isSending} />
      <OfflineStatusBanner />
      {profiles.length > 0 ? (
        <RecipientSearchField value={searchQuery} onChangeText={setSearchQuery} />
      ) : null}

      <RecipientList
        showInitialLoader={showInitialLoader}
        canUseNetworkSession={canUseNetworkSession}
        isError={isError}
        isFetching={isFetching}
        refetch={refetch}
        items={items}
        hasProfiles={profiles.length > 0}
        searchQuery={searchQuery}
        extraData={{ avatarUrls, selectedIds, isSending }}
        renderItem={renderItem}
        stylesForTheme={stylesForTheme}
        isOfflineRecipientSnapshotMissing={isOfflineRecipientSnapshotMissing}
      />

      <View style={stylesForTheme.footer}>
        <Button
          title={sendLabel}
          onPress={handleSend}
          size="large"
          fullWidth
          loading={isSending}
          disabled={sendDisabled}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 44,
  },
  headerSide: {
    width: 44,
  },
  headerSideEnd: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    ...typography.headline,
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 10,
    minHeight: 36,
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    paddingVertical: 7,
  },
  sectionHeader: {
    ...typography.footnote,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 6,
  },
  profileRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    marginRight: 4,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    ...typography.callout,
    fontWeight: '500',
    flexShrink: 1,
  },
  username: {
    ...typography.footnote,
  },
  loading: {
    marginTop: 20,
  },
  retryButton: {
    marginTop: spacing.lg,
  },
  emptyActions: {
    marginTop: 16,
    gap: 10,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
  },
  emptyActionText: {
    ...typography.headline,
  },
  pressed: {
    opacity: 0.6,
  },
});

const createStyles = (colors: ThemeColors, paddingTop: number, bottomInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingTop,
    },
    listContent: {
      paddingBottom: Math.max(bottomInset, 12),
    },
    listWrap: {
      flex: 1,
      width: '100%',
      marginTop: 4,
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: Math.max(bottomInset, 28),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      backgroundColor: 'transparent',
    },
    emptyState: {
      paddingHorizontal: 24,
      paddingTop: 24,
    },
    emptyStateText: {
      ...typography.callout,
      color: colors.secondaryLabel,
    },
  });
