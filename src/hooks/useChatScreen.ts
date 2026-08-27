import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { queryKeys, avatarSignedUrlsQueryKey } from '../lib/queryKeys';
import { sortMessagesAscending } from '../lib/chatTimeline';
import { runWithFinally } from '../lib/runWithFinally';
import {
  fetchTextMessagesWithPeer,
} from '../services/textMessageService';
import {
  fetchMessageReactionsWithPeer,
  groupReactionsByMessageId,
  removeMessageReaction,
  upsertMessageReaction,
} from '../services/messageReactionService';
import {
  deleteConversationWithPeer,
  fetchChatNixesWithPeer,
  fetchNixPublicProfiles,
  type ChatNixEvent,
} from '../services/nixService';
import { createSignedAvatarUrls } from '../services/avatarService';
import { blockUser, reportContent, type ReportReason } from '../services/safetyService';
import { notifyDomainError, notifyError, notifyInfo, notifySuccess } from '../lib/appNotify';
import { selection } from '../lib/haptics';
import { isNixFirstOpenAvailable, isNixReplayAvailable } from '../lib/nixReplay';
import type { MessageReaction, MessageReactionEmoji, TextMessage } from '../types/database.types';
import { useUploadJobs, useUploadQueue } from '../context/uploadQueue';
import { selectChatUploadJobs } from '../lib/chatUploadPresentation';
import type { UploadRowAction } from '../lib/inboxPresentation';
import { markTextConversationRead } from '../services/conversationReadService';
import {
  getConversationMute,
  setConversationMute,
} from '../services/notificationPreferencesService';
import {
  deleteTextOutboxJob,
  enqueueTextOutbox,
  flushTextOutbox,
  listTextOutbox,
  retryTextOutboxJob,
} from '../services/textOutboxService';
import { activeChatPeerRef } from '../lib/activeChatPeer';
import { serializeViewerOpenParams } from '../lib/viewerRoute';

function generateClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type OptimisticTextMessage = TextMessage & {
  isSending?: boolean;
  sendFailed?: boolean;
  outboxId?: string;
};

const CHAT_REPORT_REASON_IDS = ['harassment', 'spam', 'other'] as const satisfies readonly ReportReason[];

/** Realtime keeps chat fresh; avoid cold refetch on every focus/re-enter. */
const CHAT_STALE_TIME_MS = 60_000;
const COMPLETED_UPLOAD_VISIBILITY_MS = 30_000;
const RETRY_FEEDBACK_MIN_MS = 900;
const EMPTY_CHAT_NIXES: ChatNixEvent[] = [];

async function withMinimumDuration<T>(promise: Promise<T>, minimumMs: number): Promise<T> {
  const startedAt = Date.now();
  try {
    return await promise;
  } finally {
    const remainingMs = minimumMs - (Date.now() - startedAt);
    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
    }
  }
}

export function useChatScreen(peerId: string) {
  const { t, i18n } = useTranslation();
  const { session, canUseNetworkSession, isOfflineAuthenticated } = useAuth();
  const currentUserId = session?.user?.id ?? '';
  const queryClient = useQueryClient();
  const {
    pauseUpload,
    resumeUpload,
    retryUpload,
    cancelUpload,
  } = useUploadQueue();
  const uploadJobs = useUploadJobs();

  const [inputBody, setInputBody] = useState('');
  const [composerKey, setComposerKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [uploadClock, setUploadClock] = useState(() => Date.now());
  const [busyUploadActions, setBusyUploadActions] = useState<
    ReadonlyMap<string, UploadRowAction>
  >(() => new Map());
  const peerActionBusyRef = useRef(false);
  const busyUploadActionsRef = useRef(new Map<string, UploadRowAction>());
  const lastReadThroughRef = useRef<string | null>(null);

  // Track the active chat so the foreground notification handler can
  // suppress banners for messages from the peer being viewed.
  useEffect(() => {
    if (!peerId) return;
    activeChatPeerRef.current = peerId;
    return () => {
      if (activeChatPeerRef.current === peerId) {
        activeChatPeerRef.current = null;
      }
    };
  }, [peerId]);

  const peerProfileQuery = useQuery({
    queryKey: ['peerProfile', peerId],
    queryFn: async () => {
      const map = await fetchNixPublicProfiles([peerId]);
      return map.get(peerId) ?? null;
    },
    staleTime: 60_000,
    enabled: canUseNetworkSession && Boolean(peerId),
  });

  const peerAvatarPath = peerProfileQuery.data?.avatar_storage_path ?? null;
  const peerAvatarQuery = useQuery({
    queryKey: avatarSignedUrlsQueryKey(peerAvatarPath ? [peerAvatarPath] : []),
    queryFn: () => createSignedAvatarUrls(peerAvatarPath ? [peerAvatarPath] : []),
    staleTime: 5 * 60_000,
    enabled: canUseNetworkSession && Boolean(peerAvatarPath),
  });

  const messagesQuery = useQuery({
    queryKey: queryKeys.textMessagesWithPeer(peerId),
    queryFn: () => fetchTextMessagesWithPeer({ peerId, limit: 50 }),
    staleTime: CHAT_STALE_TIME_MS,
    enabled: canUseNetworkSession && Boolean(peerId),
    refetchOnWindowFocus: true,
    select: (rows) => sortMessagesAscending(rows),
  });
  const outboxQuery = useQuery({
    queryKey: ['textOutbox', currentUserId, peerId] as const,
    queryFn: () => listTextOutbox(currentUserId, peerId),
    enabled: Boolean(currentUserId && peerId),
    networkMode: 'always',
    staleTime: 0,
  });

  const reactionsQuery = useQuery({
    queryKey: queryKeys.messageReactionsWithPeer(peerId),
    queryFn: () => fetchMessageReactionsWithPeer(peerId),
    staleTime: CHAT_STALE_TIME_MS,
    enabled: canUseNetworkSession && Boolean(peerId),
    refetchOnWindowFocus: true,
  });

  const nixesQuery = useQuery({
    queryKey: ['chatNixesWithPeer', peerId] as const,
    queryFn: () => fetchChatNixesWithPeer(peerId, 50, currentUserId || undefined),
    staleTime: CHAT_STALE_TIME_MS,
    enabled: canUseNetworkSession && Boolean(peerId),
    refetchOnWindowFocus: true,
    placeholderData: EMPTY_CHAT_NIXES,
  });
  const muteQuery = useQuery({
    queryKey: queryKeys.conversationMute(peerId),
    queryFn: () => getConversationMute(peerId),
    enabled: canUseNetworkSession && Boolean(peerId),
    staleTime: 30_000,
  });

  const outboxMessages: OptimisticTextMessage[] = (outboxQuery.data ?? []).map((job) => ({
    id: `temp-${job.id}`,
    sender_id: currentUserId,
    receiver_id: job.receiverId,
    body: job.body,
    created_at: new Date(job.createdAt).toISOString(),
    expires_at: new Date(job.expiresAt).toISOString(),
    client_message_id: job.id,
    is_system: false,
    metadata: null,
    isSending: job.state === 'pending' || job.state === 'sending',
    sendFailed: job.state === 'failed',
    outboxId: job.id,
  }));
  const messages: OptimisticTextMessage[] = sortMessagesAscending([
    ...(messagesQuery.data ?? []),
    ...outboxMessages.filter(
      (local) =>
        !(messagesQuery.data ?? []).some(
          (server) => server.client_message_id === local.client_message_id
        )
    ),
  ]);
  const nixes: ChatNixEvent[] = nixesQuery.data ?? EMPTY_CHAT_NIXES;
  const chatUploadJobs = selectChatUploadJobs(uploadJobs, peerId, nixes, {
    now: uploadClock,
    completedVisibilityMs: COMPLETED_UPLOAD_VISIBILITY_MS,
  });
  const reactionsByMessageId = groupReactionsByMessageId(reactionsQuery.data ?? []);

  useEffect(() => {
    if (!canUseNetworkSession || !currentUserId || !peerId || messagesQuery.isPending || messages.length === 0) return;
    const lastReceived = [...messages]
      .reverse()
      .find((message) => message.sender_id === peerId && !message.id.startsWith('temp-'));
    if (!lastReceived || lastReadThroughRef.current === lastReceived.created_at) return;
    const timer = setTimeout(() => {
      void markTextConversationRead(peerId, lastReceived.created_at)
        .then(() => {
          lastReadThroughRef.current = lastReceived.created_at;
          void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
        })
        .catch((error) => {
          console.warn('Could not mark text conversation read', error);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [canUseNetworkSession, currentUserId, messages, messagesQuery.isPending, peerId, queryClient]);

  useEffect(() => {
    const completionTimes = uploadJobs.flatMap((job) => {
      const belongsToPeer = job.recipients.some((recipient) => recipient.receiverId === peerId);
      return belongsToPeer && (job.state === 'completed' || job.state === 'partially_completed')
        ? [(job.finishedAt ?? job.updatedAt) + COMPLETED_UPLOAD_VISIBILITY_MS]
        : [];
    });
    const nextExpiry = Math.min(...completionTimes.filter((time) => time > Date.now()));
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => setUploadClock(Date.now()), Math.max(0, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [peerId, uploadJobs]);

  const reportReasons = CHAT_REPORT_REASON_IDS.map((id) => ({
    id,
    label: t(`chat.reportReasons.${id}`),
  }));

  const refreshInboxInBackground = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxActivityBundle });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
  };

  const handleSend = async () => {
    const trimmed = inputBody.trim();
    if (!trimmed || sending || !peerId) return;

    const clientMessageId = generateClientMessageId();
    setInputBody('');
    setComposerKey((key) => key + 1);
    setSending(true);

    await runWithFinally(
      async () => {
        try {
          await enqueueTextOutbox(currentUserId, peerId, trimmed, clientMessageId);
          await outboxQuery.refetch();
          await queryClient.invalidateQueries({ queryKey: ['textOutbox'] });
          if (canUseNetworkSession) {
            await flushTextOutbox(currentUserId);
            await Promise.all([outboxQuery.refetch(), messagesQuery.refetch()]);
            refreshInboxInBackground();
          }
        } catch (error) {
          notifyDomainError(error, t('chat.sendFailure'));
        }
      },
      () => setSending(false)
    );
  };

  const handleRetryTextMessage = async (message: OptimisticTextMessage) => {
    if (!message.outboxId) return;
    await retryTextOutboxJob(message.outboxId);
    await outboxQuery.refetch();
    if (canUseNetworkSession) {
      await flushTextOutbox(currentUserId);
      await Promise.all([outboxQuery.refetch(), messagesQuery.refetch()]);
    }
  };

  const handleDeleteFailedTextMessage = async (message: OptimisticTextMessage) => {
    if (!message.outboxId) return;
    await deleteTextOutboxJob(message.outboxId);
    await outboxQuery.refetch();
  };

  const peerUsername = peerProfileQuery.data?.username ?? 'user';

  const handleReportMessage = async (message: TextMessage, reason: ReportReason) => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    try {
      await reportContent({
        textMessageId: message.id,
        reason,
        details: 'User reported text message in chat screen.',
      });
      notifySuccess(t('chat.reportSuccess'));
    } catch (error) {
      notifyDomainError(error, t('chat.reportFailure'));
    }
  };

  const handleReportPeer = async (reason: ReportReason) => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    if (!peerId || peerActionBusyRef.current) return;
    peerActionBusyRef.current = true;
    await runWithFinally(
      async () => {
        try {
          await reportContent({
            reportedUserId: peerId,
            reason,
            details: 'User reported peer from chat header menu.',
          });
          notifySuccess(t('chat.reportPeerSuccess'));
        } catch (error) {
          notifyDomainError(error, t('chat.reportPeerFailure'));
        }
      },
      () => {
        peerActionBusyRef.current = false;
      }
    );
  };

  const handleBlockPeer = async () => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    if (!peerId || peerActionBusyRef.current) return;
    peerActionBusyRef.current = true;
    await runWithFinally(
      async () => {
        try {
          await blockUser(peerId);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers }),
            queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
            queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
            queryClient.invalidateQueries({ queryKey: queryKeys.inboxActivityBundle }),
          ]);
          notifySuccess(t('viewer.blockSuccess'));
          router.back();
        } catch (error) {
          notifyDomainError(error, t('viewer.blockFailure'));
        }
      },
      () => {
        peerActionBusyRef.current = false;
      }
    );
  };

  const handleDeleteConversation = async () => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    if (!peerId || peerActionBusyRef.current) return;
    peerActionBusyRef.current = true;
    await runWithFinally(
      async () => {
        try {
          await deleteConversationWithPeer(peerId);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
            queryClient.invalidateQueries({ queryKey: queryKeys.inboxActivityBundle }),
            queryClient.invalidateQueries({ queryKey: queryKeys.textMessagesWithPeer(peerId) }),
            queryClient.invalidateQueries({ queryKey: ['chatNixesWithPeer', peerId] }),
          ]);
          notifySuccess(t('inbox.deleteConversationSuccess', { username: peerUsername }));
          router.back();
        } catch (error) {
          notifyDomainError(error, t('inbox.deleteConversationFailure'));
        }
      },
      () => {
        peerActionBusyRef.current = false;
      }
    );
  };

  const handleSetReaction = async (message: TextMessage, emoji: MessageReactionEmoji) => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    if (!currentUserId || message.id.startsWith('temp-')) return;

    const existing = (reactionsQuery.data ?? []).find(
      (reaction) => reaction.message_id === message.id && reaction.user_id === currentUserId
    );
    if (existing?.emoji === emoji) {
      selection();
      return;
    }

    selection();
    const previous = reactionsQuery.data ?? [];
    const nowIso = new Date().toISOString();
    const optimistic: MessageReaction[] = [
      ...previous.filter(
        (reaction) => !(reaction.message_id === message.id && reaction.user_id === currentUserId)
      ),
      {
        id: existing?.id ?? `temp-reaction-${message.id}`,
        message_id: message.id,
        user_id: currentUserId,
        emoji,
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
      },
    ];

    queryClient.setQueryData<MessageReaction[]>(
      queryKeys.messageReactionsWithPeer(peerId),
      optimistic
    );

    try {
      await upsertMessageReaction(message.id, emoji);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.messageReactionsWithPeer(peerId),
      });
    } catch (error) {
      queryClient.setQueryData<MessageReaction[]>(
        queryKeys.messageReactionsWithPeer(peerId),
        previous
      );
      notifyDomainError(error, t('chat.reactionFailure'));
    }
  };

  const handleRemoveReaction = async (message: TextMessage) => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    if (!currentUserId || message.id.startsWith('temp-')) return;

    const existing = (reactionsQuery.data ?? []).find(
      (reaction) => reaction.message_id === message.id && reaction.user_id === currentUserId
    );
    if (!existing) return;

    selection();
    const previous = reactionsQuery.data ?? [];
    queryClient.setQueryData<MessageReaction[]>(
      queryKeys.messageReactionsWithPeer(peerId),
      previous.filter(
        (reaction) => !(reaction.message_id === message.id && reaction.user_id === currentUserId)
      )
    );

    try {
      await removeMessageReaction(message.id);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.messageReactionsWithPeer(peerId),
      });
    } catch (error) {
      queryClient.setQueryData<MessageReaction[]>(
        queryKeys.messageReactionsWithPeer(peerId),
        previous
      );
      notifyDomainError(error, t('chat.reactionFailure'));
    }
  };

  const handleOpenNix = (nix: ChatNixEvent) => {
    if (isOfflineAuthenticated) {
      notifyInfo(t('root.offlineMediaUnavailable'));
      return;
    }
    const canFirstOpen = isNixFirstOpenAvailable(nix);
    const canReplay = isNixReplayAvailable(nix);
    if (!canFirstOpen && !canReplay) return;
    if (!nix.media_path) return;

    router.push({
      pathname: '/viewer',
      params: serializeViewerOpenParams({
        id: nix.id,
        path: nix.media_path,
        senderId: peerId,
        mediaType: nix.media_type === 'video' ? 'video' : 'image',
        viewDurationSec: nix.view_duration_sec,
        playbackDurationMs: nix.playback_duration_ms ?? null,
        thumbnailB64: nix.thumbnail_b64,
        isReplay: canReplay,
      }),
    });
  };

  const handleUploadAction = async (jobId: string, action: UploadRowAction) => {
    if (busyUploadActionsRef.current.has(jobId)) return;
    const operation = action === 'pause'
      ? pauseUpload
      : action === 'resume'
        ? resumeUpload
        : action === 'retry'
          ? retryUpload
          : cancelUpload;

    busyUploadActionsRef.current = new Map(busyUploadActionsRef.current).set(jobId, action);
    setBusyUploadActions(busyUploadActionsRef.current);
    await runWithFinally(
      async () => {
        try {
          await withMinimumDuration(
            operation(jobId),
            action === 'retry' ? RETRY_FEEDBACK_MIN_MS : 0
          );
        } catch (error) {
          console.error(`Chat upload action ${action} failed`, error);
          notifyError(t('chat.uploadActionFailure'));
        }
      },
      () => {
        const next = new Map(busyUploadActionsRef.current);
        next.delete(jobId);
        busyUploadActionsRef.current = next;
        setBusyUploadActions(next);
      }
    );
  };

  const handleSetMute = async (duration: '1h' | '24h' | 'forever' | 'off') => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    try {
      await setConversationMute(peerId, duration);
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversationMute(peerId) });
      notifySuccess(duration === 'off' ? t('chat.unmuted') : t('chat.muted'));
    } catch (error) {
      notifyDomainError(error, t('chat.muteFailure'));
    }
  };

  const peerAvatarUrl = peerAvatarPath ? peerAvatarQuery.data?.[peerAvatarPath] ?? null : null;
  // Full-screen loader only on cold messages — nixes stream into the timeline.
  const messagesLoading = canUseNetworkSession
    && messagesQuery.isPending
    && messagesQuery.data === undefined;

  return {
    t,
    locale: i18n.language || 'pl',
    currentUserId,
    peerId,
    peerProfile: peerProfileQuery.data,
    peerAvatarUrl,
    peerAvatarPath,
    peerLoading: canUseNetworkSession && peerProfileQuery.isPending,
    messages,
    nixes,
    chatUploadJobs,
    busyUploadActions,
    reactionsByMessageId,
    messagesLoading,
    messagesError: canUseNetworkSession && (messagesQuery.isError || nixesQuery.isError),
    inputBody,
    setInputBody,
    composerKey,
    sending,
    reportReasons,
    handleSend,
    handleRetryTextMessage,
    handleDeleteFailedTextMessage,
    handleReportMessage,
    handleReportPeer,
    handleBlockPeer,
    handleDeleteConversation,
    handleSetReaction,
    handleRemoveReaction,
    handleOpenNix,
    handleUploadAction,
    isMuted: Boolean(muteQuery.data),
    handleSetMute,
    canPerformNetworkAction: canUseNetworkSession,
    isOfflineAuthenticated,
    refetchMessages: async () => {
      if (!canUseNetworkSession) {
        notifyInfo(t('root.offlineActionUnavailable'));
        return;
      }
      await Promise.all([
        messagesQuery.refetch(),
        reactionsQuery.refetch(),
        nixesQuery.refetch(),
      ]);
    },
  };
}

export type ChatScreenViewModel = ReturnType<typeof useChatScreen>;
