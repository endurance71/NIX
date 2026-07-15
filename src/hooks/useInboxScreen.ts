import { useEffect, useRef, useState } from 'react';
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
import { notifyError, notifyInfo, notifySuccess } from '../lib/appNotify';
import { inboxNixesBundleQueryOptions } from '../lib/inboxQuery';
import { runWithFinally } from '../lib/runWithFinally';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

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
  const deletingPeerIdsRef = useRef(new Set<string>());
  const [inviteActionIds, setInviteActionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [deletingPeerIds, setDeletingPeerIds] = useState<ReadonlySet<string>>(() => new Set());

  const nixesQuery = useQuery(inboxNixesBundleQueryOptions());

  const requestsQuery = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const inboxNixes = nixesQuery.data?.inboxData ?? [];
  const sentNixes = nixesQuery.data?.sentData ?? [];
  const requests = requestsQuery.data ?? [];
  const rows = buildInboxThreads(inboxNixes, sentNixes).map((item) =>
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

  useFocusEffect(() => {
    void Promise.all([
      queryClient.refetchQueries({ queryKey: queryKeys.inboxNixesBundle, type: 'active' }),
      queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
    ]);
  });

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
            invalidateInboxQueries(),
          ]);
          notifySuccess(t('inbox.inviteAccepted'));
        } catch (error) {
          notifyError(errorMessage(error, t('inbox.inviteAcceptFailure')));
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
          await invalidateInboxQueries();
          notifyInfo(t('inbox.inviteRemoved'));
        } catch (error) {
          notifyError(errorMessage(error, t('inbox.inviteRemoveFailure')));
        }
      },
      () => finishInviteAction(requestId)
    );
  };

  const handleDelete = async (row: InboxRowModel) => {
    if (deletingPeerIdsRef.current.has(row.peerId)) return;
    deletingPeerIdsRef.current = new Set(deletingPeerIdsRef.current).add(row.peerId);
    setDeletingPeerIds(deletingPeerIdsRef.current);

    await runWithFinally(
      async () => {
        try {
          await deleteConversationWithPeer(row.peerId);
          await queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
          notifySuccess(t('inbox.deleteConversationSuccess', { username: row.username }));
        } catch (error) {
          notifyError(errorMessage(error, t('inbox.deleteConversationFailure')));
        }
      },
      () => {
        const next = new Set(deletingPeerIdsRef.current);
        next.delete(row.peerId);
        deletingPeerIdsRef.current = next;
        setDeletingPeerIds(next);
      }
    );
  };

  const handleOpen = (row: InboxRowModel) => {
    if (!row.openParams || deletingPeerIdsRef.current.has(row.peerId)) return;
    router.push({
      pathname: '/viewer',
      params: {
        id: row.openParams.id,
        path: row.openParams.path,
        senderId: row.openParams.senderId,
      },
    });
  };

  const loading =
    (nixesQuery.isPending && nixesQuery.data === undefined) ||
    (requestsQuery.isPending && requestsQuery.data === undefined);
  const initialError =
    (nixesQuery.isError && nixesQuery.data === undefined) ||
    (requestsQuery.isError && requestsQuery.data === undefined);

  return {
    t,
    rows,
    requests,
    avatarUrls: avatarQuery.data ?? {},
    inviteActionIds,
    deletingPeerIds,
    loading,
    initialError,
    handleRefresh,
    handleRetry,
    handleAccept,
    handleReject,
    handleDelete,
    handleOpen,
  };
}

export type InboxScreenViewModel = ReturnType<typeof useInboxScreen>;
