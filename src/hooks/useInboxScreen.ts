import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  acceptFriendRequest,
  listIncomingFriendRequests,
  rejectFriendRequest,
} from '../services/friendService';
import {
  deleteConversationWithPeer,
} from '../services/nixService';
import {
  AVATAR_SIGNED_URL_STALE_TIME_MS,
  createSignedAvatarUrls,
} from '../services/avatarService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { buildInboxThreads } from '../lib/inboxThreads';
import { buildInboxRowModel, type InboxRowModel } from '../lib/inboxPresentation';
import { getCurrentLocale } from '../lib/i18n';
import { registerTabScrollToTop } from '../lib/tabBarScrollActions';
import { notifyDomainError, notifyError, notifyInfo, notifySuccess } from '../lib/appNotify';
import { inboxNixesBundleQueryOptions } from '../lib/inboxQuery';
import { runWithFinally } from '../lib/runWithFinally';
import { blockUser } from '../services/safetyService';

async function refreshInboxQueries(queryClient: QueryClient, failureMessage: string) {
  try {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: queryKeys.inboxNixesBundle, type: 'active' }),
      queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
    ]);
  } catch (error) {
    console.error('Failed to refresh inbox', error);
    notifyError(failureMessage);
  }
}

export function useInboxScreen() {
  const { t } = useTranslation();
  const locale = getCurrentLocale();
  const queryClient = useQueryClient();
  const inviteActionIdsRef = useRef(new Set<string>());
  const busyPeerIdsRef = useRef(new Set<string>());
  const [inviteActionIds, setInviteActionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busyPeerIds, setBusyPeerIds] = useState<ReadonlySet<string>>(() => new Set());

  const nixesQuery = useQuery(inboxNixesBundleQueryOptions());

  const requestsQuery = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  const inboxNixes = nixesQuery.data?.inboxData ?? [];
  const sentNixes = nixesQuery.data?.sentData ?? [];
  const textMessages = nixesQuery.data?.textMessagesData ?? [];
  const requests = requestsQuery.data ?? [];
  const rows = buildInboxThreads(inboxNixes, sentNixes, textMessages).map((item) =>
    buildInboxRowModel(item, {
      unknownUsername: t('common.unknown'),
      locale,
      yesterdayLabel: t('inbox.yesterday'),
    })
  );

  const avatarPaths = Array.from(
    new Set([
      ...rows.flatMap((row) => (row.avatarStoragePath ? [row.avatarStoragePath] : [])),
      ...requests.flatMap((request) =>
        request.requester.avatar_storage_path ? [request.requester.avatar_storage_path] : []
      ),
    ])
  ).sort();

  const avatarQuery = useQuery({
    queryKey: avatarSignedUrlsQueryKey(avatarPaths),
    queryFn: () => createSignedAvatarUrls(avatarPaths),
    enabled: avatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  const invalidateInboxQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests }),
    ]);
  };

  const refreshFailureMessage = t('inbox.refreshFailure');
  const handleRefresh = () => refreshInboxQueries(queryClient, refreshFailureMessage);

  const handleRetry = async () => {
    await Promise.all([nixesQuery.refetch(), requestsQuery.refetch()]);
  };

  useFocusEffect(
    useCallback(() => {
      void queryClient.refetchQueries({
        type: 'active',
        predicate: (query) => {
          const key = query.queryKey[0];
          if (
            key !== queryKeys.inboxNixesBundle[0] &&
            key !== queryKeys.incomingFriendRequests[0]
          ) {
            return false;
          }
          return query.isStale();
        },
      });
    }, [queryClient])
  );

  useEffect(
    () =>
      registerTabScrollToTop('inbox', () =>
        void refreshInboxQueries(queryClient, refreshFailureMessage)
      ),
    [queryClient, refreshFailureMessage]
  );

  const beginInviteAction = (requestId: string) => {
    if (inviteActionIdsRef.current.has(requestId)) return false;
    inviteActionIdsRef.current = new Set(inviteActionIdsRef.current).add(requestId);
    setInviteActionIds(inviteActionIdsRef.current);
    return true;
  };

  const finishInviteAction = (requestId: string) => {
    const next = new Set(inviteActionIdsRef.current);
    next.delete(requestId);
    inviteActionIdsRef.current = next;
    setInviteActionIds(next);
  };

  const handleAccept = async (requestId: string) => {
    if (!beginInviteAction(requestId)) return;
    await runWithFinally(
      async () => {
        try {
          await acceptFriendRequest(requestId);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
            queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
          ]);
          notifySuccess(t('friends.acceptSuccess'));
        } catch (error) {
          notifyDomainError(error, t('friends.acceptFailure'));
        }
      },
      () => finishInviteAction(requestId)
    );
  };

  const handleReject = async (requestId: string) => {
    if (!beginInviteAction(requestId)) return;
    await runWithFinally(
      async () => {
        try {
          await rejectFriendRequest(requestId);
          await queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests });
          notifyInfo(t('friends.rejectSuccess'));
        } catch (error) {
          notifyDomainError(error, t('friends.rejectFailure'));
        }
      },
      () => finishInviteAction(requestId)
    );
  };

  const beginPeerAction = (peerId: string) => {
    if (busyPeerIdsRef.current.has(peerId)) return false;
    busyPeerIdsRef.current = new Set(busyPeerIdsRef.current).add(peerId);
    setBusyPeerIds(busyPeerIdsRef.current);
    return true;
  };

  const finishPeerAction = (peerId: string) => {
    const next = new Set(busyPeerIdsRef.current);
    next.delete(peerId);
    busyPeerIdsRef.current = next;
    setBusyPeerIds(next);
  };

  const handleDelete = async (row: InboxRowModel) => {
    if (!beginPeerAction(row.peerId)) return;

    await runWithFinally(
      async () => {
        try {
          await deleteConversationWithPeer(row.peerId);
          await queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
          notifySuccess(t('inbox.deleteConversationSuccess'));
        } catch (error) {
          notifyDomainError(error, t('inbox.deleteConversationFailure'));
        }
      },
      () => finishPeerAction(row.peerId)
    );
  };

  const handleBlock = async (row: InboxRowModel) => {
    if (!beginPeerAction(row.peerId)) return;

    await runWithFinally(
      async () => {
        try {
          await blockUser(row.peerId);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers }),
            queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
            queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
          ]);
          notifySuccess(t('viewer.blockSuccess'));
        } catch (error) {
          notifyDomainError(error, t('viewer.blockFailure'));
        }
      },
      () => finishPeerAction(row.peerId)
    );
  };

  const handleOpen = (row: InboxRowModel) => {
    if (busyPeerIdsRef.current.has(row.peerId)) return;

    if (row.kind === 'nix' && row.unread && row.openParams) {
      router.push({
        pathname: '/viewer',
        params: {
          id: row.openParams.id,
          path: row.openParams.path,
          senderId: row.openParams.senderId,
        },
      });
    } else {
      router.push({
        pathname: '/chat/[peerId]',
        params: { peerId: row.peerId },
      });
    }
  };

  // Full-screen loader tylko od bundla wątków — friend requests ładują się
  // niezależnie i nie powinny blokować listy wiadomości.
  const loading = nixesQuery.isPending && nixesQuery.data === undefined;
  const initialError = nixesQuery.isError && nixesQuery.data === undefined;
  const requestsReady = !(requestsQuery.isPending && requestsQuery.data === undefined);
  const showEmpty = requestsReady && requests.length === 0 && rows.length === 0;

  return {
    t,
    rows,
    requests,
    avatarUrls: avatarQuery.data ?? {},
    inviteActionIds,
    busyPeerIds,
    loading,
    initialError,
    showEmpty,
    handleRefresh,
    handleRetry,
    handleAccept,
    handleReject,
    handleDelete,
    handleBlock,
    handleOpen,
  };
}

export type InboxScreenViewModel = ReturnType<typeof useInboxScreen>;
