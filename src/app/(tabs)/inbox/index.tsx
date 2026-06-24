import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sentLifecycleSegments } from '../../../lib/nixInboxLabels';
import {
  deleteConversationWithPeer,
  fetchInboxNixes,
  fetchSentNixes,
  flushCleanupQueue,
  type InboxNix,
} from '../../../services/nixService';
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
import { AppIcon } from '../../../components/ui/app-icon';
import { AvatarCircle } from '../../../components/ui/avatar-circle';
import { RNHostView } from '@expo/ui';
import { DeletableRowMenu } from '../../../components/ui/deletable-row-menu';
import {
  SettingsEmptyText,
  SettingsSectionTitle,
} from '../../../components/ui/settings-list-sections';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { notifyError, notifyInfo, notifySuccess } from '../../../lib/appNotify';
import { runWithFinally } from '../../../lib/runWithFinally';
import { useTranslation } from 'react-i18next';
import { formatShortTime } from '../../../lib/formatters';
import { getCurrentLocale } from '../../../lib/i18n';
import { NATIVE_GROUPED_LIST_RN_ROW_PADDING } from '../../../theme/nativeListLayout';

async function fetchInboxNixesBundle() {
  void flushCleanupQueue().catch(() => {});
  const [inboxData, sentData] = await Promise.all([fetchInboxNixes(), fetchSentNixes()]);
  return { inboxData, sentData };
}

function openInboxNix(nix: InboxNix) {
  if (nix.is_viewed) return;
  router.push({
    pathname: '/viewer',
    params: { id: nix.id, path: nix.media_path, senderId: nix.sender_id },
  });
}

type ThreadRowProps = {
  avatarUrls: Record<string, string>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  item: InboxThreadItem;
  onOpenNix: (nix: InboxNix) => void;
  isDeleting: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: string;
};

function ThreadRow({
  avatarUrls,
  colors,
  item,
  onOpenNix,
  isDeleting,
  t,
  locale,
}: ThreadRowProps) {
  return (
    <RNHostView matchContents>
      {item.direction === 'received' ? (
        (() => {
          const nix = item.nix;
          const isNew = !nix.is_viewed;
          const avatarPath = nix.sender?.avatar_storage_path ?? null;
          const avatarUrl = avatarPath ? avatarUrls[avatarPath] : null;
          const fallback = nix.sender?.username?.charAt(0).toUpperCase() || '?';

          return (
            <Pressable
              accessibilityLabel={t('inbox.openNixA11y', { username: nix.sender?.username || t('common.unknownUser') })}
              accessibilityRole="button"
              disabled={!isNew || isDeleting}
              onPress={() => onOpenNix(nix)}
              style={({ pressed }) => [
                styles.rowInner,
                pressed && styles.rowPressed,
                (!isNew || isDeleting) && styles.rowDisabled,
              ]}>
              <AvatarCircle
                size={44}
                url={avatarUrl}
                storagePath={avatarPath}
                emoji={nix.sender?.avatar_emoji}
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
                  @{nix.sender?.username || t('common.unknown')}
                </RNText>
                <RNText
                  numberOfLines={1}
                  style={[styles.peerSubtitle, { color: isNew ? colors.destructive : colors.tertiaryLabel }]}>
                  {isNew ? t('inbox.newNix') : t('inbox.opened')} • {formatShortTime(nix.created_at, locale)}
                </RNText>
              </View>
              {isNew ? <AppIcon name="chevronRight" size={14} color={colors.tertiaryLabel} /> : null}
            </Pressable>
          );
        })()
      ) : (
        (() => {
          const sent = item.nix;
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
}

export default function InboxScreen() {
  const { t } = useTranslation();
  const locale = getCurrentLocale();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();

  const lastFocusRefreshAtRef = useRef(0);
  const [deletingPeerId, setDeletingPeerId] = useState<string | null>(null);

  const { data: nixesBundle, isPending: nixesPending } = useQuery({
    queryKey: queryKeys.inboxNixesBundle,
    queryFn: fetchInboxNixesBundle,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const { data: requests = [], isPending: requestsPending } = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const nixes = nixesBundle?.inboxData ?? [];
  const sentNixes = nixesBundle?.sentData ?? [];
  const loading = nixesPending || requestsPending;

  const feed = buildInboxThreads(nixes, sentNixes);

  const threadPaths = feed.flatMap((item) => {
    const path =
      item.direction === 'received' ? item.nix.sender?.avatar_storage_path : item.nix.receiver?.avatar_storage_path;
    return path ? [path] : [];
  });
  const invitePaths = requests.flatMap((request) =>
    request.requester.avatar_storage_path ? [request.requester.avatar_storage_path] : []
  );
  const sortedAvatarPaths = Array.from(new Set([...threadPaths, ...invitePaths])).sort();

  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(sortedAvatarPaths),
    queryFn: () => createSignedAvatarUrls(sortedAvatarPaths),
    enabled: sortedAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  useEffect(() => {
    if (nixesPending) return;
    const inbox = nixesBundle?.inboxData ?? [];
    setInboxBadgeCount(inbox.filter((nix) => nix.is_viewed !== true).length);
  }, [nixesBundle, nixesPending]);

  const invalidateInboxQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests }),
    ]);
  };

  const refetchInboxIfStale = () => {
    const now = Date.now();
    if (now - lastFocusRefreshAtRef.current < 2_500) return;
    lastFocusRefreshAtRef.current = now;
    void queryClient.refetchQueries({
      type: 'active',
      predicate: (query) => {
        const key = query.queryKey[0];
        if (key !== queryKeys.inboxNixesBundle[0] && key !== queryKeys.incomingFriendRequests[0]) return false;
        return query.isStale();
      },
    });
  };

  const refetchInboxForce = async () => {
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.inboxNixesBundle, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
      ]);
      await refreshInboxBadgeCount(queryClient);
    } catch (err) {
      console.error('Failed to refresh inbox', err);
    }
  };

  useFocusEffect(() => {
    refetchInboxIfStale();
  });


  const deleteSingleThread = async (item: InboxThreadItem) => {
    const peerId = item.direction === 'received' ? item.nix.sender_id : item.nix.receiver_id;
    const username = item.direction === 'received' ? item.nix.sender?.username : item.nix.receiver?.username;
    if (deletingPeerId) return;

    setDeletingPeerId(peerId);
    await runWithFinally(
      async () => {
        await deleteConversationWithPeer(peerId);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
          refreshInboxBadgeCount(queryClient, { forceNetwork: true }),
        ]);
        notifySuccess(t('inbox.deleteConversationSuccess', { username: username || t('common.unknownUser') }));
      },
      () => setDeletingPeerId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? t('inbox.deleteConversationFailure'));
    });
  };

  const handleNativeDelete = async (indices: number[]) => {
    const firstIndex = indices[0];
    if (typeof firstIndex !== 'number') return;
    const item = feed[firstIndex];
    if (!item) return;
    await deleteSingleThread(item);
  };

  const handleAccept = async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
        invalidateInboxQueries(),
      ]);
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
    return <SettingsListScreen loading />;
  }

  return (
    <>
      <SettingsListScreen onRefresh={refetchInboxForce}>
        {requests.length > 0 ? (
          <>
            <SettingsSectionTitle>{t('inbox.invitesSection', { count: requests.length })}</SettingsSectionTitle>
            {requests.map((request) => {
              const avatarPath = request.requester.avatar_storage_path ?? null;
              const avatarUrl = avatarPath ? avatarUrls[avatarPath] ?? null : null;
              const fallback = request.requester.username?.charAt(0).toUpperCase() || '?';
              return (
                <RNHostView matchContents key={request.id}>
                  <View style={styles.requestRow}>
                    <View style={styles.requestHeader}>
                      <AvatarCircle
                        size={36}
                        url={avatarUrl}
                        storagePath={avatarPath}
                        emoji={request.requester.avatar_emoji}
                        fallbackInitial={fallback}
                      />
                      <RNText numberOfLines={1} style={[styles.peerTitle, { color: colors.label, flex: 1 }]}>
                        @{request.requester.username}
                      </RNText>
                    </View>
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
              );
            })}
          </>
        ) : null}

        <SettingsSectionTitle>{t('inbox.messagesSection', { count: feed.length })}</SettingsSectionTitle>
        {feed.length === 0 ? (
          <SettingsEmptyText>{t('inbox.noMessages')}</SettingsEmptyText>
        ) : (
          feed.map((threadItem, index) => (
            <DeletableRowMenu
              key={threadItem.id}
              deleteLabel={t('inbox.deleteConversation', { defaultValue: 'Usuń rozmowę' })}
              disabled={
                deletingPeerId ===
                (threadItem.direction === 'received'
                  ? threadItem.nix.sender_id
                  : threadItem.nix.receiver_id)
              }
              onDelete={() => void handleNativeDelete([index])}>
              <ThreadRow
                item={threadItem}
                avatarUrls={avatarUrls}
                colors={colors}
                onOpenNix={openInboxNix}
                t={t}
                locale={locale}
                isDeleting={
                  deletingPeerId ===
                  (threadItem.direction === 'received' ? threadItem.nix.sender_id : threadItem.nix.receiver_id)
                }
              />
            </DeletableRowMenu>
          ))
        )}
      </SettingsListScreen>
      <Stack.Screen.Title large>{t('inbox.title')}</Stack.Screen.Title>
    </>
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
    ...NATIVE_GROUPED_LIST_RN_ROW_PADDING,
  },
  requestActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    ...NATIVE_GROUPED_LIST_RN_ROW_PADDING,
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
