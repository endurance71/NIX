import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { sentLifecycleSegments } from '../../../lib/snapInboxLabels';
import {
  deleteConversationWithPeer,
  fetchInboxSnaps,
  fetchSentSnaps,
  flushCleanupQueue,
  type InboxSnap,
} from '../../../services/snapService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../../../lib/queryKeys';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { refreshInboxBadgeCount, setInboxBadgeCount } from '../../../lib/inboxBadgeStore';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../../../services/avatarService';
import { typography } from '../../../theme/typography';
import { buildInboxThreads, type InboxThreadItem } from '../../../lib/inboxThreads';
import {
  acceptFriendRequest,
  listIncomingFriendRequests,
  rejectFriendRequest,
} from '../../../services/friendService';
import { SFSymbol } from '../../../components/ui/sf-symbol';
import { AvatarCircle } from '../../../components/ui/avatar-circle';
import { Host, List, Section, Text, RNHostView } from '@expo/ui/swift-ui';
import {
  foregroundStyle,
  listStyle,
  padding,
  refreshable,
  listRowSeparator,
} from '@expo/ui/swift-ui/modifiers';
import { notifyError, notifyInfo, notifySuccess } from '../../../lib/appNotify';
import { useTranslation } from 'react-i18next';
import { formatShortTime } from '../../../lib/formatters';
import { getCurrentLocale } from '../../../lib/i18n';
import { SWIFT_UI_INSET_GROUPED_LIST_RN_ROW_PADDING } from '../../../theme/swiftUiEmbeddedLayout';

async function fetchInboxSnapsBundle() {
  void flushCleanupQueue().catch(() => {});
  const [inboxData, sentData] = await Promise.all([fetchInboxSnaps(), fetchSentSnaps()]);
  return { inboxData, sentData };
}

type ThreadRowProps = {
  avatarUrls: Record<string, string>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  item: InboxThreadItem;
  onOpenSnap: (snap: InboxSnap) => void;
  isDeleting: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: string;
};

const ThreadRow = memo(function ThreadRow({
  avatarUrls,
  colors,
  item,
  onOpenSnap,
  isDeleting,
  t,
  locale,
}: ThreadRowProps) {
  return (
    <RNHostView matchContents>
      {item.direction === 'received' ? (
        (() => {
          const snap = item.snap;
          const isNew = !snap.is_viewed;
          const avatarPath = snap.sender?.avatar_storage_path ?? null;
          const avatarUrl = avatarPath ? avatarUrls[avatarPath] : null;
          const fallback = snap.sender?.username?.charAt(0).toUpperCase() || '?';

          return (
            <Pressable
              accessibilityLabel={t('inbox.openSnapA11y', { username: snap.sender?.username || t('common.unknownUser') })}
              accessibilityRole="button"
              disabled={!isNew || isDeleting}
              onPress={() => onOpenSnap(snap)}
              style={({ pressed }) => [
                styles.rowInner,
                pressed && styles.rowPressed,
                (!isNew || isDeleting) && styles.rowDisabled,
              ]}>
              <AvatarCircle
                size={44}
                url={avatarUrl}
                storagePath={avatarPath}
                emoji={snap.sender?.avatar_emoji}
                fallbackInitial={fallback}
              />
              <View style={styles.rowTextBlock}>
                <RNText
                  numberOfLines={1}
                  style={[
                    styles.peerTitle,
                    { color: colors.label },
                    !isNew && { color: colors.secondaryLabel, fontWeight: '400' },
                  ]}>
                  @{snap.sender?.username || t('common.unknown')}
                </RNText>
                <RNText
                  numberOfLines={1}
                  style={[styles.peerSubtitle, { color: isNew ? colors.destructive : colors.tertiaryLabel }]}>
                  {isNew ? t('inbox.newSnap') : t('inbox.opened')} • {formatShortTime(snap.created_at, locale)}
                </RNText>
              </View>
              {isNew ? <SFSymbol name="chevron.right" size={14} tintColor={colors.tertiaryLabel} /> : null}
            </Pressable>
          );
        })()
      ) : (
        (() => {
          const sent = item.snap;
          const avatarPath = sent.receiver?.avatar_storage_path ?? null;
          const avatarUrl = avatarPath ? avatarUrls[avatarPath] : null;
          const timeStr = formatShortTime(sent.created_at, locale);
          const sentSubtitle = [t('inbox.sent'), ...sentLifecycleSegments(sent, (key) => t(key)), timeStr].join(' • ');
          const fallback = sent.receiver?.username?.charAt(0).toUpperCase() || '?';

          return (
            <View
              style={[styles.rowInner, isDeleting && styles.rowDisabled]}
              accessibilityLabel={t('inbox.sentToA11y', {
                username: sent.receiver?.username || t('common.unknownUser'),
              })}>
              <AvatarCircle
                size={44}
                url={avatarUrl}
                storagePath={avatarPath}
                emoji={sent.receiver?.avatar_emoji}
                fallbackInitial={fallback}
              />
              <View style={styles.rowTextBlock}>
                <RNText numberOfLines={1} style={[styles.peerTitle, { color: colors.label }]}>
                  @{sent.receiver?.username || t('common.unknown')}
                </RNText>
                <RNText numberOfLines={1} style={[styles.peerSubtitle, { color: colors.tertiaryLabel }]}>
                  {sentSubtitle}
                </RNText>
              </View>
            </View>
          );
        })()
      )}
    </RNHostView>
  );
});

export default function InboxScreen() {
  const { t } = useTranslation();
  const locale = getCurrentLocale();
  const queryClient = useQueryClient();
  const { colors, statusBarStyle } = useAppTheme();

  const lastFocusRefreshAtRef = useRef(0);
  const [deletingPeerId, setDeletingPeerId] = useState<string | null>(null);

  const { data: snapsBundle, isPending: snapsPending } = useQuery({
    queryKey: queryKeys.inboxSnapsBundle,
    queryFn: fetchInboxSnapsBundle,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const { data: requests = [], isPending: requestsPending } = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const snaps = useMemo(() => snapsBundle?.inboxData ?? [], [snapsBundle?.inboxData]);
  const sentSnaps = useMemo(() => snapsBundle?.sentData ?? [], [snapsBundle?.sentData]);
  const loading = snapsPending || requestsPending;

  const feed = useMemo(() => buildInboxThreads(snaps, sentSnaps), [snaps, sentSnaps]);

  const sortedAvatarPaths = useMemo(() => {
    const paths = feed
      .map((item) =>
        item.direction === 'received' ? item.snap.sender?.avatar_storage_path : item.snap.receiver?.avatar_storage_path
      )
      .filter((path): path is string => Boolean(path));
    return Array.from(new Set(paths)).sort();
  }, [feed]);

  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(sortedAvatarPaths),
    queryFn: () => createSignedAvatarUrls(sortedAvatarPaths),
    enabled: sortedAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  useEffect(() => {
    if (snapsPending) return;
    setInboxBadgeCount(snaps.filter((snap) => snap.is_viewed !== true).length);
  }, [snaps, snapsPending]);

  const invalidateInboxQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxSnapsBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests }),
    ]);
  }, [queryClient]);

  const refetchInboxIfStale = useCallback(() => {
    const now = Date.now();
    if (now - lastFocusRefreshAtRef.current < 2_500) return;
    lastFocusRefreshAtRef.current = now;
    void queryClient.refetchQueries({
      type: 'active',
      predicate: (query) => {
        const key = query.queryKey[0];
        if (key !== queryKeys.inboxSnapsBundle[0] && key !== queryKeys.incomingFriendRequests[0]) return false;
        return query.isStale();
      },
    });
  }, [queryClient]);

  const refetchInboxForce = useCallback(async () => {
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.inboxSnapsBundle, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
      ]);
      await refreshInboxBadgeCount(queryClient);
    } catch (err) {
      console.error('Failed to refresh inbox', err);
    }
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      refetchInboxIfStale();
    }, [refetchInboxIfStale])
  );

  const handleOpenSnap = useCallback((snap: InboxSnap) => {
    if (snap.is_viewed) return;
    router.push({
      pathname: '/viewer',
      params: { id: snap.id, path: snap.media_path, senderId: snap.sender_id },
    });
  }, []);

  const deleteSingleThread = useCallback(
    async (item: InboxThreadItem) => {
      const peerId = item.direction === 'received' ? item.snap.sender_id : item.snap.receiver_id;
      const username = item.direction === 'received' ? item.snap.sender?.username : item.snap.receiver?.username;
      if (deletingPeerId) return;

      setDeletingPeerId(peerId);
      try {
        await deleteConversationWithPeer(peerId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.inboxSnapsBundle });
        await refreshInboxBadgeCount(queryClient, { forceNetwork: true });
        if (process.env.EXPO_OS === 'ios') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        notifySuccess(t('inbox.deleteConversationSuccess', { username: username || t('common.unknownUser') }));
      } catch (err: any) {
        if (process.env.EXPO_OS === 'ios') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        notifyError(err?.message ?? t('inbox.deleteConversationFailure'));
      } finally {
        setDeletingPeerId(null);
      }
    },
    [deletingPeerId, queryClient, t]
  );

  const handleNativeDelete = useCallback(
    async (indices: number[]) => {
      const firstIndex = indices[0];
      if (typeof firstIndex !== 'number') return;
      const item = feed[firstIndex];
      if (!item) return;
      await deleteSingleThread(item);
    },
    [deleteSingleThread, feed]
  );

  const handleAccept = async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
      await invalidateInboxQueries();
      notifySuccess(t('inbox.inviteAccepted'));
    } catch (err: any) {
      notifyError(err?.message ?? t('inbox.inviteAcceptFailure'));
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await rejectFriendRequest(requestId);
      await invalidateInboxQueries();
      notifyInfo(t('inbox.inviteRemoved'));
    } catch (err: any) {
      notifyError(err?.message ?? t('inbox.inviteRemoveFailure'));
    }
  };

  if (loading && feed.length === 0) {
    return (
      <Host style={[styles.container, styles.centered]} colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
        <StatusBar style={statusBarStyle} />
        <ActivityIndicator color={colors.label} />
      </Host>
    );
  }

  return (
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <List modifiers={[listStyle('insetGrouped'), padding({ top: 0 }), refreshable(refetchInboxForce)]}>
        {requests.length > 0 ? (
          <Section title={t('inbox.invitesSection', { count: requests.length })}>
            {requests.map((request) => (
              <RNHostView matchContents key={request.id}>
                <View style={styles.requestRow}>
                  <RNText numberOfLines={1} style={[styles.peerTitle, { color: colors.label }]}>
                    @{request.requester.username}
                  </RNText>
                  <View style={styles.requestActions}>
                    <Pressable onPress={() => handleAccept(request.id)} hitSlop={8}>
                      <RNText style={[styles.requestActionLabel, { color: colors.accent }]}>{t('inbox.accept')}</RNText>
                    </Pressable>
                    <Pressable onPress={() => handleReject(request.id)} hitSlop={8}>
                      <RNText style={[styles.requestActionLabel, { color: colors.destructive }]}>{t('inbox.remove')}</RNText>
                    </Pressable>
                  </View>
                </View>
              </RNHostView>
            ))}
          </Section>
        ) : null}

        <Section title={t('inbox.messagesSection', { count: feed.length })}>
          {feed.length === 0 ? (
            <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), listRowSeparator('hidden')]}>
              {t('inbox.noMessages')}
            </Text>
          ) : (
            <List.ForEach onDelete={handleNativeDelete}>
              {feed.map((threadItem) => (
                <ThreadRow
                  key={threadItem.id}
                  item={threadItem}
                  avatarUrls={avatarUrls}
                  colors={colors}
                  onOpenSnap={handleOpenSnap}
                  t={t}
                  locale={locale}
                  isDeleting={
                    deletingPeerId ===
                    (threadItem.direction === 'received' ? threadItem.snap.sender_id : threadItem.snap.receiver_id)
                  }
                />
              ))}
            </List.ForEach>
          )}
        </Section>
      </List>
      <Stack.Screen.Title large>{t('inbox.title')}</Stack.Screen.Title>
    </Host>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestRow: {
    gap: 8,
    minHeight: 56,
    justifyContent: 'center',
    paddingVertical: 6,
    ...SWIFT_UI_INSET_GROUPED_LIST_RN_ROW_PADDING,
  },
  requestActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  requestActionLabel: {
    ...typography.headline,
    fontWeight: '600',
  },
  rowInner: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    ...SWIFT_UI_INSET_GROUPED_LIST_RN_ROW_PADDING,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowDisabled: {
    opacity: 0.82,
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  peerTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  peerSubtitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
  },
});
