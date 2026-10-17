import { buildInboxLocalMessages } from '../lib/inboxLocalMessages';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNixReactions } from './useNixReactions';
import {
  ACCEPTED_FRIENDS_LIMIT,
  acceptFriendRequest,
  listAcceptedFriends,
  listIncomingFriendRequests,
  rejectFriendRequest,
} from '../services/friendService';
import {
  deleteConversationWithPeer,
  fetchChatNixesWithPeer,
} from '../services/nixService';
import { queryKeys } from '../lib/queryKeys';
import { buildInboxThreads } from '../lib/inboxThreads';
import {
  buildInboxRowModel,
  type InboxRowModel,
  type UploadRowAction,
} from '../lib/inboxPresentation';
import {
  buildRecipientUploadPresentations,
  createInboxRowIdentityCache,
  mergeInboxRowsWithUploads,
} from '../lib/inboxUploadPresentation';
import { getCurrentLocale } from '../lib/i18n';
import { registerTabScrollToTop } from '../lib/tabBarScrollActions';
import { notifyDomainError, notifyError, notifyInfo, notifyOffline, notifySuccess } from '../lib/appNotify';
import { inboxNixesBundleQueryOptions } from '../lib/inboxQuery';
import { runWithFinally } from '../lib/runWithFinally';
import { blockUser } from '../services/safetyService';
import { fetchTextMessagesWithPeer } from '../services/textMessageService';
import { fetchMessageReactionsWithPeer } from '../services/messageReactionService';
import { useAuth } from './useAuth';
import { useSignedAvatarUrls } from './useSignedAvatarUrls';
import { filterInboxRows, filterInviteRequests } from '../lib/inboxSearch';
import { orderRowsWithPins, splitPinnedRows } from '../lib/conversationPins';
import type { ConversationMuteDuration } from '../lib/inboxRowMenu';
import { notify as hapticNotify } from '../lib/haptics';
import { markTextConversationRead } from '../services/conversationReadService';
import { reportContent, type ReportReason } from '../services/safetyService';
import { useInboxPreferences } from './useInboxPreferences';
import { recordProductEvent } from '../services/productAnalyticsService';
import { serializeViewerOpenParams } from '../lib/viewerRoute';
import {
  useUploadJobs,
  useUploadQueueActions,
  useUploadQueueSummary,
} from '../context/uploadQueue';
import { useOfflineCache } from '../context/OfflineCacheProvider';
import { listTextOutbox } from '../services/textOutboxService';
import { useTextMessageExpiryClock } from './useTextMessageExpiryClock';
import { useUploadVisibilityClock } from './useUploadVisibilityClock';
import { isTextMessageExpired } from '../lib/chatTimeline';
import { useFriendshipOverview } from './useFriendshipBadges';
import { COMPLETED_UPLOAD_VISIBILITY_MS } from '../lib/uploadProgress';

/** A streak refresh closer than this to the bundle refresh already reflects it. */
const STREAK_REFRESH_SLACK_MS = 5_000;

/** Keep in sync with useChatScreen CHAT_STALE_TIME_MS. */
const CHAT_STALE_TIME_MS = 60_000;
const EMPTY_LIST: never[] = [];
async function refreshInboxQueries(queryClient: QueryClient, failureMessage: string) {
  try {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: queryKeys.inboxNixesBundle, type: 'active' }),
      queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
      // Streak badges are decoration: their failure never fails the inbox refresh.
      queryClient
        .refetchQueries({ queryKey: queryKeys.friendStreaks, type: 'active' })
        .catch(() => undefined),
    ]);
  } catch (error) {
    console.error('Failed to refresh inbox', error);
    notifyError(failureMessage);
  }
}

function useInboxQueries(
  currentUserId: string,
  canUseNetworkSession: boolean,
  uploadJobs: ReturnType<typeof useUploadJobs>,
  uploadClock: number,
) {
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
    () =>
      buildRecipientUploadPresentations(uploadJobs, {
        now: uploadClock,
        completedVisibilityMs: COMPLETED_UPLOAD_VISIBILITY_MS,
      }),
    [uploadClock, uploadJobs],
  );
  const acceptedFriendsQuery = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: ACCEPTED_FRIENDS_LIMIT }),
    enabled:
      canUseNetworkSession && (uploadPresentations.size > 0 || (outboxQuery.data?.length ?? 0) > 0),
    staleTime: 1000 * 60 * 2,
  });
  return { nixesQuery, requestsQuery, outboxQuery, uploadPresentations, acceptedFriendsQuery };
}

function resolveInboxScreenState({
  nixesQuery,
  requestsQuery,
  uploadSummary,
  canUseNetworkSession,
  isOfflineAuthenticated,
  hasCachedInbox,
  rows,
  requests,
  visibleRequests,
  allRows,
  searchQuery,
}: {
  nixesQuery: Pick<
    ReturnType<typeof useInboxQueries>['nixesQuery'],
    'isPending' | 'isError' | 'data'
  >;
  requestsQuery: Pick<ReturnType<typeof useInboxQueries>['requestsQuery'], 'isPending' | 'data'>;
  uploadSummary: ReturnType<typeof useUploadQueueSummary>;
  canUseNetworkSession: boolean;
  isOfflineAuthenticated: boolean;
  hasCachedInbox: boolean;
  rows: readonly InboxRowModel[];
  allRows: InboxRowModel[];
  requests: NonNullable<ReturnType<typeof useInboxQueries>['requestsQuery']['data']>;
  visibleRequests: readonly unknown[];
  searchQuery: string;
}) {
  const hasVisibleLocalUploads = uploadSummary.activeCount > 0 || uploadSummary.failedCount > 0;
  const loading =
    nixesQuery.isPending &&
    canUseNetworkSession &&
    nixesQuery.data === undefined &&
    rows.length === 0 &&
    !hasVisibleLocalUploads;
  const initialError =
    nixesQuery.isError &&
    canUseNetworkSession &&
    nixesQuery.data === undefined &&
    rows.length === 0 &&
    !hasVisibleLocalUploads;
  const requestsReady =
    !canUseNetworkSession || !(requestsQuery.isPending && requestsQuery.data === undefined);
  const showEmpty = requestsReady && requests.length === 0 && allRows.length === 0;
  const showOfflineCacheMissing = isOfflineAuthenticated && !hasCachedInbox && allRows.length === 0;
  const showSearchEmpty =
    searchQuery.trim().length > 0 &&
    (allRows.length > 0 || requests.length > 0) &&
    rows.length === 0 &&
    visibleRequests.length === 0;

  return { loading, initialError, showEmpty, showOfflineCacheMissing, showSearchEmpty };
}

export function useInboxScreen() {
  const { t } = useTranslation();
  const locale = getCurrentLocale();
  const queryClient = useQueryClient();
  const { session, canUseNetworkSession, isOfflineAuthenticated } = useAuth();
  const { hasCachedData } = useOfflineCache();
  const { pauseUpload, resumeUpload, retryUpload, cancelUpload } = useUploadQueueActions();
  const uploadJobs = useUploadJobs();
  const uploadSummary = useUploadQueueSummary();
  const currentUserId = session?.user?.id ?? '';
  const inviteActionIdsRef = useRef(new Set<string>());
  const busyPeerIdsRef = useRef(new Set<string>());
  const [inviteActionIds, setInviteActionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busyPeerIds, setBusyPeerIds] = useState<ReadonlySet<string>>(() => new Set());
  const uploadClock = useUploadVisibilityClock(uploadJobs, COMPLETED_UPLOAD_VISIBILITY_MS);
  const [searchQuery, setSearchQuery] = useState('');
  const [rowIdentityCache] = useState(createInboxRowIdentityCache);

  const { nixesQuery, requestsQuery, outboxQuery, uploadPresentations, acceptedFriendsQuery } =
    useInboxQueries(currentUserId, canUseNetworkSession, uploadJobs, uploadClock);
  const inboxNixes = nixesQuery.data?.inboxData ?? EMPTY_LIST;
  const sentNixes = nixesQuery.data?.sentData ?? EMPTY_LIST;
  const fetchedTextMessages = nixesQuery.data?.textMessagesData ?? EMPTY_LIST;
  // Expired messages leave the previews on time, not on the next refetch (DB-2).
  const expiryClock = useTextMessageExpiryClock(fetchedTextMessages);
  const serverTextMessages = useMemo(
    () => fetchedTextMessages.filter((message) => !isTextMessageExpired(message, expiryClock)),
    [expiryClock, fetchedTextMessages],
  );
  const unknownUsername = t('common.unknown');
  const yesterdayLabel = t('inbox.yesterday');
  // Upload progress re-renders this screen often; rebuild threads only when their inputs change.
  const baseRows = useMemo(() => {
    const localTextMessages = buildInboxLocalMessages(
      serverTextMessages,
      outboxQuery.data ?? [],
      acceptedFriendsQuery.data ?? [],
      currentUserId,
    );
    return buildInboxThreads(inboxNixes, sentNixes, [
      ...serverTextMessages,
      ...localTextMessages,
    ]).map((item) => buildInboxRowModel(item, { unknownUsername, locale, yesterdayLabel }));
  }, [
    acceptedFriendsQuery.data,
    currentUserId,
    inboxNixes,
    locale,
    outboxQuery.data,
    sentNixes,
    serverTextMessages,
    unknownUsername,
    yesterdayLabel,
  ]);
  const requests = requestsQuery.data ?? EMPTY_LIST;
  // Unchanged conversations keep their row object, so `memo(MessageRow)` skips them on every
  // upload progress tick or new message elsewhere (PERF-16 follow-up).
  const allRows = useMemo(
    () =>
      rowIdentityCache.reconcile(
        mergeInboxRowsWithUploads(baseRows, uploadPresentations, acceptedFriendsQuery.data ?? [], {
          unknownUsername,
          locale,
          yesterdayLabel,
        }),
      ),
    [
      acceptedFriendsQuery.data,
      baseRows,
      locale,
      rowIdentityCache,
      unknownUsername,
      uploadPresentations,
      yesterdayLabel,
    ],
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const preferences = useInboxPreferences({ currentUserId, canUseNetworkSession, t });
  const friendship = useFriendshipOverview();
  // A new NiX in or out (realtime refetch of the bundle) can extend or complete a streak.
  const bundleUpdatedAt = nixesQuery.dataUpdatedAt;
  useEffect(() => {
    if (!canUseNetworkSession || !bundleUpdatedAt) return;
    const streaks = queryClient.getQueryState(queryKeys.friendStreaks);
    if (!streaks || streaks.dataUpdatedAt >= bundleUpdatedAt - STREAK_REFRESH_SLACK_MS) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.friendStreaks });
  }, [bundleUpdatedAt, canUseNetworkSession, queryClient]);
  // Pinned conversations first, in pin order; search filters the ordered list.
  const orderedRows = useMemo(
    () => orderRowsWithPins(allRows, preferences.pins),
    [allRows, preferences.pins],
  );
  const rows = useMemo(
    () => filterInboxRows(orderedRows, deferredSearchQuery),
    [orderedRows, deferredSearchQuery],
  );
  // The pinned avatar grid (like Messages) takes the pinned conversations out of the list; while
  // searching there is no grid and the matches are ordinary rows.
  const searching = deferredSearchQuery.trim().length > 0;
  const pinnedSplit = useMemo(
    () => (searching ? null : splitPinnedRows(allRows, preferences.pins)),
    [allRows, preferences.pins, searching],
  );
  const pinnedRows = pinnedSplit?.pinned ?? EMPTY_LIST;
  const unpinnedRows = pinnedSplit?.rest ?? rows;
  // Reactions the peer left on my sent NiXes, shown next to their status ("Otwarto · ❤️").
  const sentNixIds = useMemo(
    () =>
      rows
        .filter((row) => row.kind === 'nix' && row.direction === 'sent' && row.id.startsWith('sent-nix-'))
        .map((row) => row.id.slice('sent-nix-'.length)),
    [rows],
  );
  const nixReactions = useNixReactions(sentNixIds);
  const visibleRequests = useMemo(
    () => filterInviteRequests(requests, deferredSearchQuery),
    [requests, deferredSearchQuery],
  );

  // PERF-17 / SEND-6: per-path cache shared with every screen. A new conversation signs only its
  // own avatar; the others keep their URL (and the map keeps its identity when nothing changed).
  // Based on all rows (not the search result) so typing in search never changes the set.
  const avatarUrls = useSignedAvatarUrls(
    [
      ...allRows.map((row) => row.avatarStoragePath),
      ...requests.map((request) => request.requester.avatar_storage_path),
    ],
    { enabled: canUseNetworkSession },
  );

  const refreshFailureMessage = t('inbox.refreshFailure');
  const handleRefresh = async () => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    await Promise.all([
      refreshInboxQueries(queryClient, refreshFailureMessage),
      preferences.refresh(),
    ]);
  };

  const handleRetry = async () => {
    if (!canUseNetworkSession) {
      notifyOffline();
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
            key !== queryKeys.incomingFriendRequests[0] &&
            key !== queryKeys.conversationMutes[0] &&
            key !== queryKeys.friendStreaks[0]
          ) {
            return false;
          }
          return query.isStale();
        },
      });
    }, [canUseNetworkSession, queryClient]),
  );

  useEffect(
    () =>
      registerTabScrollToTop('inbox', () => {
        if (canUseNetworkSession) void refreshInboxQueries(queryClient, refreshFailureMessage);
      }),
    [canUseNetworkSession, queryClient, refreshFailureMessage],
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
      notifyOffline();
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
          hapticNotify('success');
          notifySuccess(t('friends.acceptSuccess'));
        } catch (error) {
          notifyDomainError(error, t('friends.acceptFailure'));
        }
      },
      () => finishInviteAction(requestId),
    );
  };

  const handleReject = async (requestId: string) => {
    if (!canUseNetworkSession) {
      notifyOffline();
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
      () => finishInviteAction(requestId),
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
      notifyOffline();
      return;
    }
    if (!beginPeerAction(row.peerId)) return;

    await runWithFinally(
      async () => {
        try {
          await deleteConversationWithPeer(row.peerId);
          void preferences.forgetPin(row.peerId);
          await queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
          notifySuccess(t('inbox.deleteConversationSuccess', { username: row.username }));
        } catch (error) {
          notifyDomainError(error, t('inbox.deleteConversationFailure'));
        }
      },
      () => finishPeerAction(row.peerId),
    );
  };

  const handleBlock = async (row: InboxRowModel) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    if (!beginPeerAction(row.peerId)) return;

    await runWithFinally(
      async () => {
        try {
          await blockUser(row.peerId);
          void preferences.forgetPin(row.peerId);
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
      () => finishPeerAction(row.peerId),
    );
  };

  const handleTogglePin = (row: InboxRowModel) =>
    preferences.setPinned(row.peerId, !preferences.pinnedPeerIds.has(row.peerId));

  const handleSetMute = (row: InboxRowModel, duration: ConversationMuteDuration | 'off') =>
    preferences.setMute(row.peerId, duration);

  const handleMarkRead = async (row: InboxRowModel) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    if (!beginPeerAction(row.peerId)) return;
    await runWithFinally(
      async () => {
        try {
          await markTextConversationRead(row.peerId, row.createdAt);
          await queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
        } catch (error) {
          notifyDomainError(error, t('inbox.markReadFailure'));
        }
      },
      () => finishPeerAction(row.peerId),
    );
  };

  const handleReport = async (row: InboxRowModel, reason: ReportReason) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    if (!beginPeerAction(row.peerId)) return;
    await runWithFinally(
      async () => {
        try {
          await reportContent({
            reportedUserId: row.peerId,
            reason,
            details: 'User reported peer from inbox row menu.',
          });
          notifySuccess(t('chat.reportPeerSuccess'));
        } catch (error) {
          notifyDomainError(error, t('chat.reportPeerFailure'));
        }
      },
      () => finishPeerAction(row.peerId),
    );
  };

  const handleUploadAction = async (row: InboxRowModel, action: UploadRowAction) => {
    const upload = row.upload;
    if (!upload || !beginPeerAction(row.peerId)) return;
    const jobIds =
      action === 'pause'
        ? upload.actions.pauseJobIds
        : action === 'resume'
          ? upload.actions.resumeJobIds
          : action === 'retry'
            ? upload.actions.retryJobIds
            : upload.actions.cancelJobIds;
    const operation =
      action === 'pause'
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
      () => finishPeerAction(row.peerId),
    );
  };

  const handleOpen = (row: InboxRowModel) => {
    if (busyPeerIdsRef.current.has(row.peerId)) return;

    if (isOfflineAuthenticated && row.kind === 'nix' && !row.upload) {
      notifyOffline('media');
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
  const { loading, initialError, showEmpty, showOfflineCacheMissing, showSearchEmpty } =
    resolveInboxScreenState({
      nixesQuery,
      requestsQuery,
      uploadSummary,
      canUseNetworkSession,
      isOfflineAuthenticated,
      hasCachedInbox: hasCachedData('inbox'),
      rows,
      requests,
      visibleRequests,
      allRows,
      searchQuery,
    });

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleSearchEnd = () => {
    if (!searchQuery.trim()) return;
    void recordProductEvent('inbox_search_used', { has_results: rows.length > 0 });
  };

  return {
    t,
    /** Every visible conversation, pinned first (search results, or the fallback without a grid). */
    rows,
    /** Pinned conversations for the avatar grid, in pin order; empty while searching. */
    pinnedRows,
    /** The list under the pinned grid: `rows` without the pinned ones. */
    unpinnedRows,
    requests: visibleRequests,
    avatarUrls,
    pinnedPeerIds: preferences.pinnedPeerIds,
    friendshipBadges: friendship.badges,
    nixReactionFor: (row: InboxRowModel) =>
      row.kind === 'nix' && row.direction === 'sent' && nixReactions.available
        ? nixReactions.reactionFor(row.id.slice('sent-nix-'.length))
        : null,
    mutedPeerIds: preferences.mutedPeerIds,
    muteAvailable: preferences.muteAvailable,
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
    handleTogglePin,
    handleSetMute,
    handleMarkRead,
    handleReport,
    handleUploadAction,
    handleOpen,
    canPerformNetworkAction: canUseNetworkSession,
  };
}

export type InboxScreenViewModel = ReturnType<typeof useInboxScreen>;
