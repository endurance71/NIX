import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  acceptFriendRequest,
  listAcceptedFriends,
  listIncomingFriendRequests,
  rejectFriendRequest,
} from '../services/friendService';
import {
  deleteConversationWithPeer,
  fetchChatNixesWithPeer,
} from '../services/nixService';
import {
  AVATAR_SIGNED_URL_STALE_TIME_MS,
  createSignedAvatarUrls,
} from '../services/avatarService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { buildInboxThreads } from '../lib/inboxThreads';
import {
  buildInboxRowModel,
  type InboxRowModel,
  type UploadRowAction,
} from '../lib/inboxPresentation';
import {
  buildRecipientUploadPresentations,
  mergeInboxRowsWithUploads,
} from '../lib/inboxUploadPresentation';
import { getCurrentLocale } from '../lib/i18n';
import { registerTabScrollToTop } from '../lib/tabBarScrollActions';
import { notifyDomainError, notifyError, notifyInfo, notifySuccess } from '../lib/appNotify';
import { inboxNixesBundleQueryOptions } from '../lib/inboxQuery';
import { runWithFinally } from '../lib/runWithFinally';
import { blockUser } from '../services/safetyService';
import { fetchTextMessagesWithPeer } from '../services/textMessageService';
import { fetchMessageReactionsWithPeer } from '../services/messageReactionService';
import { useAuth } from './useAuth';
import { filterInboxRows } from '../lib/inboxSearch';
import { recordProductEvent } from '../services/productAnalyticsService';
import { serializeViewerOpenParams } from '../lib/viewerRoute';
import {
  useUploadJobs,
  useUploadQueue,
  useUploadQueueSummary,
} from '../context/uploadQueue';
import { useOfflineCache } from '../context/OfflineCacheProvider';
import { listTextOutbox } from '../services/textOutboxService';

/** Keep in sync with useChatScreen CHAT_STALE_TIME_MS. */
const CHAT_STALE_TIME_MS = 60_000;
const COMPLETED_UPLOAD_VISIBILITY_MS = 30_000;
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
  const { session, canUseNetworkSession, isOfflineAuthenticated } = useAuth();
  const { hasCachedData } = useOfflineCache();
  const {
    pauseUpload,
    resumeUpload,
    retryUpload,
    cancelUpload,
  } = useUploadQueue();
  const uploadJobs = useUploadJobs();
  const uploadSummary = useUploadQueueSummary();
  const currentUserId = session?.user?.id ?? '';
  const inviteActionIdsRef = useRef(new Set<string>());
  const busyPeerIdsRef = useRef(new Set<string>());
  const [inviteActionIds, setInviteActionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busyPeerIds, setBusyPeerIds] = useState<ReadonlySet<string>>(() => new Set());
  const [uploadClock, setUploadClock] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState('');

  const nixesQuery = useQuery({
    ...inboxNixesBundleQueryOptions(),
    enabled: canUseNetworkSession,
  });

  const requestsQuery = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  const outboxQuery = useQuery({
    queryKey: ['textOutbox', currentUserId, 'inbox'] as const,
    queryFn: () => listTextOutbox(currentUserId),
    enabled: Boolean(currentUserId),
    networkMode: 'always',
    staleTime: 0,
  });
  const uploadPresentations = useMemo(
    () => buildRecipientUploadPresentations(uploadJobs, {
      now: uploadClock,
      completedVisibilityMs: COMPLETED_UPLOAD_VISIBILITY_MS,
    }),
    [uploadClock, uploadJobs]
  );
  const acceptedFriendsQuery = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: 100 }),
    enabled: canUseNetworkSession
      && (uploadPresentations.size > 0 || (outboxQuery.data?.length ?? 0) > 0),
    staleTime: 1000 * 60 * 2,
  });
  const inboxNixes = nixesQuery.data?.inboxData ?? [];
  const sentNixes = nixesQuery.data?.sentData ?? [];
  const serverTextMessages = nixesQuery.data?.textMessagesData ?? [];
  const friendsById = new Map((acceptedFriendsQuery.data ?? []).map((friend) => [friend.id, friend]));
  const serverTextClientIds = new Set(serverTextMessages.map((message) => message.client_message_id));
  const localTextMessages: typeof serverTextMessages = [];
  for (const job of outboxQuery.data ?? []) {
    if (serverTextClientIds.has(job.id)) continue;
    const friend = friendsById.get(job.receiverId);
    localTextMessages.push({
      id: `temp-${job.id}`,
      sender_id: currentUserId,
      receiver_id: job.receiverId,
      body: job.body,
      created_at: new Date(job.createdAt).toISOString(),
      expires_at: new Date(job.expiresAt).toISOString(),
      client_message_id: job.id,
      is_system: false,
      metadata: null,
      peer_id: job.receiverId,
      is_unread: false,
      peerProfile: friend ? {
        username: friend.username,
        display_name: friend.display_name ?? null,
        avatar_storage_path: friend.avatar_storage_path ?? null,
        avatar_emoji: friend.avatar_emoji ?? null,
      } : null,
    });
  }
  const baseRows = buildInboxThreads(
    inboxNixes,
    sentNixes,
    [...serverTextMessages, ...localTextMessages]
  ).map((item) =>
    buildInboxRowModel(item, {
      unknownUsername: t('common.unknown'),
      locale,
      yesterdayLabel: t('inbox.yesterday'),
    })
  );
  const requests = requestsQuery.data ?? [];
  const allRows = mergeInboxRowsWithUploads(
    baseRows,
    uploadPresentations,
    acceptedFriendsQuery.data ?? [],
    {
      unknownUsername: t('common.unknown'),
      locale,
      yesterdayLabel: t('inbox.yesterday'),
    }
  );
  const rows = useMemo(
    () => filterInboxRows(allRows, searchQuery),
    [allRows, searchQuery]
  );

  useEffect(() => {
    const completionTimes = uploadJobs.flatMap((job) =>
      job.state === 'completed' || job.state === 'partially_completed'
        ? [(job.finishedAt ?? job.updatedAt) + COMPLETED_UPLOAD_VISIBILITY_MS]
        : []
    );
    if (completionTimes.length === 0) return;
    const nextExpiry = Math.min(...completionTimes.filter((time) => time > Date.now()));
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => setUploadClock(Date.now()), Math.max(0, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [uploadJobs]);

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
    enabled: canUseNetworkSession && avatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  const refreshFailureMessage = t('inbox.refreshFailure');
  const handleRefresh = async () => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    await refreshInboxQueries(queryClient, refreshFailureMessage);
  };

  const handleRetry = async () => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    await Promise.all([nixesQuery.refetch(), requestsQuery.refetch()]);
  };

  useFocusEffect(
    useCallback(() => {
      if (!canUseNetworkSession) return;
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
    }, [canUseNetworkSession, queryClient])
  );

  useEffect(
    () =>
      registerTabScrollToTop('inbox', () => {
        if (canUseNetworkSession) void refreshInboxQueries(queryClient, refreshFailureMessage);
      }),
    [canUseNetworkSession, queryClient, refreshFailureMessage]
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
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
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
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
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
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
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
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
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

  const handleUploadAction = async (row: InboxRowModel, action: UploadRowAction) => {
    const upload = row.upload;
    if (!upload || !beginPeerAction(row.peerId)) return;
    const jobIds = action === 'pause'
      ? upload.actions.pauseJobIds
      : action === 'resume'
        ? upload.actions.resumeJobIds
        : action === 'retry'
          ? upload.actions.retryJobIds
          : upload.actions.cancelJobIds;
    const operation = action === 'pause'
      ? pauseUpload
      : action === 'resume'
        ? resumeUpload
        : action === 'retry'
          ? retryUpload
          : cancelUpload;

    await runWithFinally(
      async () => {
        try {
          await Promise.all(jobIds.map((jobId) => operation(jobId)));
        } catch (error) {
          console.error(`Upload action ${action} failed`, error);
          notifyError(t('inbox.uploadActionFailure'));
        }
      },
      () => finishPeerAction(row.peerId)
    );
  };

  const handleOpen = (row: InboxRowModel) => {
    if (busyPeerIdsRef.current.has(row.peerId)) return;

    if (isOfflineAuthenticated && row.kind === 'nix' && !row.upload) {
      notifyInfo(t('root.offlineMediaUnavailable'));
      return;
    }

    if (!row.upload && row.kind === 'nix' && row.unread && row.openParams) {
      router.push({
        pathname: '/viewer',
        params: serializeViewerOpenParams(row.openParams),
      });
    } else {
      const peerId = row.peerId;
      if (canUseNetworkSession) {
        void queryClient.prefetchQuery({
          queryKey: queryKeys.textMessagesWithPeer(peerId),
          queryFn: () => fetchTextMessagesWithPeer({ peerId, limit: 50 }),
          staleTime: CHAT_STALE_TIME_MS,
        });
        void queryClient.prefetchQuery({
          queryKey: queryKeys.messageReactionsWithPeer(peerId),
          queryFn: () => fetchMessageReactionsWithPeer(peerId),
          staleTime: CHAT_STALE_TIME_MS,
        });
        void queryClient.prefetchQuery({
          queryKey: ['chatNixesWithPeer', peerId] as const,
          queryFn: () => fetchChatNixesWithPeer(peerId, 50, currentUserId || undefined),
          staleTime: CHAT_STALE_TIME_MS,
        });
      }
      router.push({
        pathname: '/chat/[peerId]',
        params: { peerId },
      });
    }
  };

  // Full-screen loader tylko od bundla wątków — friend requests ładują się
  // niezależnie i nie powinny blokować listy wiadomości.
  const hasVisibleLocalUploads = uploadSummary.activeCount > 0 || uploadSummary.failedCount > 0;
  const loading = nixesQuery.isPending
    && canUseNetworkSession
    && nixesQuery.data === undefined
    && rows.length === 0
    && !hasVisibleLocalUploads;
  const initialError = nixesQuery.isError
    && canUseNetworkSession
    && nixesQuery.data === undefined
    && rows.length === 0
    && !hasVisibleLocalUploads;
  const requestsReady = !canUseNetworkSession
    || !(requestsQuery.isPending && requestsQuery.data === undefined);
  const showEmpty = requestsReady && requests.length === 0 && allRows.length === 0;
  const showOfflineCacheMissing = isOfflineAuthenticated
    && !hasCachedData('inbox')
    && allRows.length === 0;
  const showSearchEmpty = searchQuery.trim().length > 0 && allRows.length > 0 && rows.length === 0;

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleSearchEnd = () => {
    if (!searchQuery.trim()) return;
    void recordProductEvent('inbox_search_used', { has_results: rows.length > 0 });
  };

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
    showOfflineCacheMissing,
    showSearchEmpty,
    searchQuery,
    handleSearchChange,
    handleSearchEnd,
    handleRefresh,
    handleRetry,
    handleAccept,
    handleReject,
    handleDelete,
    handleBlock,
    handleUploadAction,
    handleOpen,
    canPerformNetworkAction: canUseNetworkSession,
  };
}

export type InboxScreenViewModel = ReturnType<typeof useInboxScreen>;
