import { useCallback, useEffect, useRef, useState } from 'react';
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
import { queryKeys } from '../../../lib/queryKeys';
import { refreshInboxBadgeCount, setInboxBadgeCount } from '../../../lib/inboxBadgeStore';
import { buildInboxThreads, type InboxThreadItem } from '../../../lib/inboxThreads';
import {
  acceptFriendRequest,
  listIncomingFriendRequests,
  rejectFriendRequest,
} from '../../../services/friendService';
import { DeletableRowMenu } from '../../../components/ui/deletable-row-menu';
import {
  NativeSettingsActionRow,
  NativeSettingsEmptyRow,
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { notifyError, notifyInfo, notifySuccess } from '../../../lib/appNotify';
import { runWithFinally } from '../../../lib/runWithFinally';
import { useTranslation } from 'react-i18next';
import { formatShortTime } from '../../../lib/formatters';
import { getCurrentLocale } from '../../../lib/i18n';
import { registerTabScrollToTop } from '../../../lib/tabBarScrollActions';

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
  item: InboxThreadItem;
  onOpenNix: (nix: InboxNix) => void;
  isDeleting: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: string;
};

function ThreadRow({
  item,
  onOpenNix,
  isDeleting,
  t,
  locale,
}: ThreadRowProps) {
  if (item.direction === 'received') {
    const nix = item.nix;
    const isNew = !nix.is_viewed;
    return (
      <NativeSettingsRow
        title={`@${nix.sender?.username || t('common.unknown')}`}
        supportingText={`${isNew ? t('inbox.newNix') : t('inbox.opened')} • ${formatShortTime(nix.created_at, locale)}`}
        onPress={!isNew || isDeleting ? undefined : () => onOpenNix(nix)}
      />
    );
  }

  const sent = item.nix;
  const timeStr = formatShortTime(sent.created_at, locale);
  const sentSubtitle = [t('inbox.sent'), ...sentLifecycleSegments(sent, (key) => t(key)), timeStr].join(' • ');

  return (
    <NativeSettingsRow
      title={`@${sent.receiver?.username || t('common.unknown')}`}
      supportingText={sentSubtitle}
    />
  );
}

export default function InboxScreen() {
  const { t } = useTranslation();
  const locale = getCurrentLocale();
  const queryClient = useQueryClient();

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

  const refetchInboxIfStale = useCallback(() => {
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
  }, [queryClient]);

  useFocusEffect(refetchInboxIfStale);

  useEffect(() => {
    return registerTabScrollToTop('inbox', () => {
      void (async () => {
        try {
          await Promise.all([
            queryClient.refetchQueries({ queryKey: queryKeys.inboxNixesBundle, type: 'active' }),
            queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
          ]);
          await refreshInboxBadgeCount(queryClient);
        } catch (err) {
          console.error('Failed to refresh inbox', err);
        }
      })();
    });
  }, [queryClient]);

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
      <SettingsListScreen>
        {requests.length > 0 ? (
          <NativeSettingsSection title={t('inbox.invitesSection', { count: requests.length })}>
            {requests.flatMap((request) => [
              <NativeSettingsRow
                key={`${request.id}:row`}
                title={`@${request.requester.username}`}
                supportingText={t('inbox.invitesSection', { count: 1 })}
              />,
              <NativeSettingsActionRow
                key={`${request.id}:accept`}
                title={t('inbox.accept')}
                onPress={() => void handleAccept(request.id)}
              />,
              <NativeSettingsActionRow
                key={`${request.id}:reject`}
                title={t('inbox.remove')}
                destructive
                onPress={() => void handleReject(request.id)}
              />,
            ])}
          </NativeSettingsSection>
        ) : null}

        <NativeSettingsSection title={t('inbox.messagesSection', { count: feed.length })}>
          {feed.length === 0 ? <NativeSettingsEmptyRow text={t('inbox.noMessages')} /> : null}
          {feed.map((threadItem, index) => (
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
                onOpenNix={openInboxNix}
                t={t}
                locale={locale}
                isDeleting={
                  deletingPeerId ===
                  (threadItem.direction === 'received' ? threadItem.nix.sender_id : threadItem.nix.receiver_id)
                }
              />
            </DeletableRowMenu>
          ))}
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title large>{t('inbox.title')}</Stack.Screen.Title>
    </>
  );
}
