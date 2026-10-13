import { mergeChatOutboxMessages, type ChatOutboxStatus } from '../lib/chatOutboxMessages';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { useSignedAvatarUrls } from './useSignedAvatarUrls';
import { queryKeys } from '../lib/queryKeys';
import {
  chatPeerProfileFromInboxBundle,
  sortMessagesAscending,
} from '../lib/chatTimeline';
import type { InboxBundle } from '../lib/inboxQuery';
import { runWithFinally } from '../lib/runWithFinally';
import {
  cancelOwnTextMessage,
  editOwnTextMessage,
  fetchRecentTextMessagesWithPeer,
  setTextMessageSaved,
  unsendOwnTextMessage,
  waitForTextEdit,
} from '../services/textMessageService';
import { chatMessageActions, type ChatMessageActions } from '../lib/chatMessageActions';
import { DomainError } from '../services/errors';
import {
  deleteLocalRecording,
  discardVoiceUpload,
  sendVoiceMessage,
  uploadVoiceRecording,
} from '../services/voiceMessageService';
import { fetchChatCapabilities } from '../services/chatCapabilitiesService';
import {
  isMissingChatFeatureError,
  NO_CHAT_CAPABILITIES,
  type ChatCapabilities,
} from '../lib/chatCapabilities';
import { withSavedState, type ChatMessageExtras } from '../lib/chatMessageExtras';
import {
  mergePendingVoiceMessages,
  voiceClientIdFromOutboxId,
  type PendingVoiceMessage,
} from '../lib/chatVoiceOutbox';
import type { VoiceRecordingResult } from './useVoiceRecorder';
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
import { blockUser, reportContent, reportNix, type ReportReason } from '../services/safetyService';
import {
  notifyDomainError,
  notifyError,
  notifyInfo,
  notifyOffline,
  notifySuccess,
} from '../lib/appNotify';
import { selection } from '../lib/haptics';
import { isNixFirstOpenAvailable, isNixReplayAvailable } from '../lib/nixReplay';
import type { MessageReaction, MessageReactionEmoji, TextMessage } from '../types/database.types';
import { useUploadJobs, useUploadQueueActions } from '../context/uploadQueue';
import { rememberChatMediaAnchors, selectChatUploadJobs } from '../lib/chatUploadPresentation';
import type { UploadRowAction } from '../lib/inboxPresentation';
import { markTextConversationRead } from '../services/conversationReadService';
import {
  getConversationMute,
  setConversationMute,
} from '../services/notificationPreferencesService';
import {
  deleteTextOutboxJob,
  deleteUnclaimedTextOutboxJob,
  enqueueTextOutbox,
  flushTextOutbox,
  listTextOutbox,
  retryTextOutboxJob,
} from '../services/textOutboxService';
import { claimActiveChatPeer } from '../lib/activeChatPeer';
import { useConnectivity } from '../lib/connectivity';
import { serializeViewerOpenParams } from '../lib/viewerRoute';
import { usePhotoDraft } from '../context/photoDraft';
import { chatPasteFeatures } from '../config/chatPasteFeatures';
import { handleChatPastePayload } from '../lib/chatPasteHandler';
import type { ChatPasteIo, ChatPastePayload } from '../lib/chatPaste';
import { createDefaultChatPasteIo } from '../lib/chatPasteIo';
import { useTextMessageExpiryClock } from './useTextMessageExpiryClock';
import { useUploadVisibilityClock } from './useUploadVisibilityClock';
import { useChatTyping } from './useChatTyping';
import { useNixReactions } from './useNixReactions';
import { copyTextToClipboard, isClipboardAvailable } from '../lib/clipboard';

function generateClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type OptimisticTextMessage = TextMessage & ChatMessageExtras & {
  isSending?: boolean;
  sendFailed?: boolean;
  /** Set only for rows that still live in the local outbox. */
  outboxStatus?: ChatOutboxStatus;
  outboxId?: string;
  /** A voice message still being sent plays from the local recording. */
  localVoiceUri?: string;
};

const CHAT_REPORT_REASON_IDS = ['harassment', 'spam', 'other'] as const satisfies readonly ReportReason[];

/** Realtime keeps chat fresh; avoid cold refetch on every focus/re-enter. */
const CHAT_STALE_TIME_MS = 60_000;
const COMPLETED_UPLOAD_VISIBILITY_MS = 30_000;
const RETRY_FEEDBACK_MIN_MS = 900;
const EMPTY_CHAT_NIXES: ChatNixEvent[] = [];
const EMPTY_TEXT_MESSAGES: TextMessage[] = [];
const EMPTY_OUTBOX: Awaited<ReturnType<typeof listTextOutbox>> = [];
const EMPTY_REACTIONS: MessageReaction[] = [];

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

function useChatPeerQueries(peerId: string, canUseNetworkSession: boolean) {
  const queryClient = useQueryClient();
  const peerProfileQuery = useQuery({
    queryKey: ['peerProfile', peerId],
    queryFn: async () => {
      const map = await fetchNixPublicProfiles([peerId]);
      return map.get(peerId) ?? null;
    },
    staleTime: 60_000,
    enabled: canUseNetworkSession && Boolean(peerId),
    // DB-7: the inbox bundle already holds this profile, so the header and the avatar request
    // start at once. Dated like the bundle, so a stale bundle still triggers the profile refetch.
    initialData: () =>
      chatPeerProfileFromInboxBundle(
        queryClient.getQueryData<InboxBundle>(queryKeys.inboxNixesBundle),
        peerId,
      ),
    initialDataUpdatedAt: () => queryClient.getQueryState(queryKeys.inboxNixesBundle)?.dataUpdatedAt,
  });

  const peerAvatarPath = peerProfileQuery.data?.avatar_storage_path ?? null;
  // PERF-17: same per-path cache as the inbox row, so opening a chat reuses the inbox's URL.
  const peerAvatarUrls = useSignedAvatarUrls([peerAvatarPath], { enabled: canUseNetworkSession });

  return { peerProfileQuery, peerAvatarPath, peerAvatarUrls };
}

const CHAT_MESSAGE_PAGE_SIZE = 50;
// Module-level so TanStack keeps the selected array between renders (an inline `select` re-runs
// on every render and would hand every memoized consumer a new array).
const selectMessagesAscending = (rows: TextMessage[]) => sortMessagesAscending(rows);

function useChatTimelineQueries(
  peerId: string,
  currentUserId: string,
  canUseNetworkSession: boolean,
  messagePages: number,
) {
  const messagesQuery = useQuery({
    queryKey: queryKeys.textMessagesWithPeer(peerId),
    // The page count is not part of the key: realtime, push and the offline
    // cache share this entry, and every refetch reloads all requested pages.
    queryFn: () => fetchRecentTextMessagesWithPeer(peerId, messagePages, CHAT_MESSAGE_PAGE_SIZE),
    staleTime: CHAT_STALE_TIME_MS,
    enabled: canUseNetworkSession && Boolean(peerId),
    refetchOnWindowFocus: true,
    select: selectMessagesAscending,
  });
  const outboxQuery = useQuery({
    queryKey: ['textOutbox', currentUserId, peerId] as const,
    // Tombstones of expired messages are shown in the chat (OFF-4), not in the inbox preview.
    queryFn: () => listTextOutbox(currentUserId, peerId, { includeExpired: true }),
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

  return {
    messagesQuery,
    outboxQuery,
    reactionsQuery,
    nixesQuery,
    muteQuery,
    serverMessages: messagesQuery.data ?? EMPTY_TEXT_MESSAGES,
    outboxJobs: outboxQuery.data ?? EMPTY_OUTBOX,
    nixes: (nixesQuery.data ?? EMPTY_CHAT_NIXES) as ChatNixEvent[],
    reactions: reactionsQuery.data ?? EMPTY_REACTIONS,
  };
}

/** Number of message pages requested for this peer; resets when the peer changes. */
function useChatMessagePages(peerId: string) {
  const [state, setState] = useState({ peerId, pages: 1 });
  const pages = state.peerId === peerId ? state.pages : 1;
  const setPages = useCallback((next: number) => setState({ peerId, pages: next }), [peerId]);
  return [pages, setPages] as const;
}

function useOlderChatMessages({
  peerId,
  messagePages,
  messagesQuery,
  canUseNetworkSession,
  onPagesChange,
  failureMessage,
}: {
  peerId: string;
  messagePages: number;
  messagesQuery: { data?: TextMessage[]; isFetching: boolean };
  canUseNetworkSession: boolean;
  onPagesChange: (pages: number) => void;
  failureMessage: string;
}) {
  const queryClient = useQueryClient();
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  // A full set of pages means the server may hold older, unexpired messages.
  const loadedCount = messagesQuery.data?.length ?? 0;
  const hasOlderMessages =
    canUseNetworkSession &&
    !messagesQuery.isFetching &&
    loadedCount >= messagePages * CHAT_MESSAGE_PAGE_SIZE;

  const loadOlderMessages = async () => {
    if (loadingOlderMessages) return;
    const nextPages = messagePages + 1;
    setLoadingOlderMessages(true);
    onPagesChange(nextPages);
    await runWithFinally(
      () =>
        queryClient
          .fetchQuery({
            queryKey: queryKeys.textMessagesWithPeer(peerId),
            queryFn: () =>
              fetchRecentTextMessagesWithPeer(peerId, nextPages, CHAT_MESSAGE_PAGE_SIZE),
            staleTime: 0,
          })
          .then(() => undefined)
          .catch((error) => {
            notifyDomainError(error, failureMessage);
          }),
      () => setLoadingOlderMessages(false),
    );
  };

  return {
    loadingOlderMessages,
    onReachedOldestMessage: hasOlderMessages ? () => void loadOlderMessages() : undefined,
  };
}

/** Marks the newest received message read (debounced) once the chat shows it. */
function useMarkConversationRead({
  canUseNetworkSession,
  currentUserId,
  messagesPending,
  peerId,
  messages,
}: {
  canUseNetworkSession: boolean;
  currentUserId: string;
  messagesPending: boolean;
  peerId: string;
  messages: readonly { id: string; sender_id: string; created_at: string }[];
}) {
  const queryClient = useQueryClient();
  const lastReadThroughRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canUseNetworkSession || !currentUserId || messagesPending || !peerId || messages.length === 0) {
      return;
    }
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
  }, [canUseNetworkSession, currentUserId, messages, messagesPending, peerId, queryClient]);
}



const CHAT_CAPABILITIES_KEY = ['chatCapabilities'] as const;
const CHAT_CAPABILITIES_STALE_MS = 10 * 60_000;

/**
 * Saved messages and voice messages exist only on backends with 20261012100000/20261012101000.
 * Production without them answers „none”: the actions stay hidden and nothing errors. A call
 * that still fails with a missing RPC/column/bucket hides that feature for the session.
 */
function useChatCapabilities(canUseNetworkSession: boolean) {
  const query = useQuery({
    queryKey: CHAT_CAPABILITIES_KEY,
    queryFn: fetchChatCapabilities,
    staleTime: CHAT_CAPABILITIES_STALE_MS,
    enabled: canUseNetworkSession,
    retry: 1,
  });
  const [missing, setMissing] = useState<Partial<Record<keyof ChatCapabilities, true>>>({});
  const data = query.data ?? NO_CHAT_CAPABILITIES;
  const capabilities: ChatCapabilities = {
    savedMessages: data.savedMessages && !missing.savedMessages,
    voiceMessages: data.voiceMessages && !missing.voiceMessages,
    messageReplies: data.messageReplies && !missing.messageReplies,
    messageEdits: data.messageEdits && !missing.messageEdits,
  };
  const markMissing = useCallback((feature: keyof ChatCapabilities) => {
    setMissing((current) => (current[feature] ? current : { ...current, [feature]: true }));
  }, []);
  return { capabilities, markMissing };
}

function generateVoiceClientId(): string {
  return generateClientMessageId();
}

/** What the composer is doing on top of a plain message: answering one, or editing my own. */
export type ChatComposerContext =
  | { mode: 'reply'; messageId: string; authorIsMe: boolean; kind: 'text' | 'voice'; snippet: string }
  | { mode: 'edit'; messageId: string; body: string; seed: number };

export function useChatScreen(peerId: string) {
  const { t, i18n } = useTranslation();
  const { session, canUseNetworkSession, isOfflineAuthenticated } = useAuth();
  const { online } = useConnectivity();
  // NetInfo reports offline before the auth layer drops the network session; either one means a
  // queued message cannot leave the device right now.
  const networkAvailable = canUseNetworkSession && online;
  const currentUserId = session?.user?.id ?? '';
  const queryClient = useQueryClient();
  const { pauseUpload, resumeUpload, retryUpload, cancelUpload } = useUploadQueueActions();
  const uploadJobs = useUploadJobs();

  const { setDraft: setPhotoDraft } = usePhotoDraft();
  // The composer text lives in ChatComposer (PERF-10): typing must not re-render this hook, the
  // header or the list. `handleSend(body)` receives the text.
  const sendingRef = useRef(false);
  const [pasteImporting, setPasteImporting] = useState(false);
  const pasteImportingRef = useRef(false);
  const pasteIoRef = useRef<ChatPasteIo | null>(null);
  const [busyUploadActions, setBusyUploadActions] = useState<ReadonlyMap<string, UploadRowAction>>(
    () => new Map(),
  );
  const peerActionBusyRef = useRef(false);
  const busyUploadActionsRef = useRef(new Map<string, UploadRowAction>());

  // Track the visible chat so the foreground notification handler can suppress banners for
  // messages from this peer. Focus-based (NOTIF-11): a chat under the viewer or under another chat
  // is not „visible”, and blurring never clears another chat's claim.
  useFocusEffect(
    useCallback(() => (peerId ? claimActiveChatPeer(peerId) : undefined), [peerId]),
  );

  const { peerProfileQuery, peerAvatarPath, peerAvatarUrls } = useChatPeerQueries(
    peerId,
    canUseNetworkSession,
  );
  const [messagePages, setMessagePages] = useChatMessagePages(peerId);
  const {
    messagesQuery,
    outboxQuery,
    reactionsQuery,
    nixesQuery,
    muteQuery,
    serverMessages,
    outboxJobs,
    nixes,
    reactions,
  } =
    useChatTimelineQueries(peerId, currentUserId, canUseNetworkSession, messagePages);
  const { loadingOlderMessages, onReachedOldestMessage } = useOlderChatMessages({
    peerId,
    messagePages,
    messagesQuery,
    canUseNetworkSession,
    onPagesChange: setMessagePages,
    failureMessage: t('chat.loadOlderFailed'),
  });
  const expiryClock = useTextMessageExpiryClock(serverMessages);
  const { capabilities, markMissing } = useChatCapabilities(canUseNetworkSession);
  // Voice messages being uploaded / sent from this screen (in memory; see chatVoiceOutbox).
  const [pendingVoice, setPendingVoice] = useState<PendingVoiceMessage[]>([]);
  // Swipe / menu „Odpowiedz” and „Edytuj”: shown above the composer until sent or cancelled.
  const [composerContextState, setComposerContext] = useState<{
    peerId: string;
    context: ChatComposerContext;
  } | null>(null);
  const composerContext = composerContextState?.peerId === peerId ? composerContextState.context : null;
  const editSeedRef = useRef(0);
  const pendingVoiceRef = useRef<PendingVoiceMessage[]>(pendingVoice);
  useEffect(() => {
    pendingVoiceRef.current = pendingVoice;
  }, [pendingVoice]);
  // Memoized so that a re-render without new data keeps every list cell's props identical.
  const messages = useMemo(
    () =>
      mergePendingVoiceMessages(
        mergeChatOutboxMessages(serverMessages, outboxJobs, currentUserId, {
          online: networkAvailable,
          now: expiryClock,
        }),
        pendingVoice,
        currentUserId,
        peerId,
      ) as OptimisticTextMessage[],
    [currentUserId, expiryClock, networkAvailable, outboxJobs, peerId, pendingVoice, serverMessages],
  );
  // Leaving the chat drops failed takes (their files would otherwise linger in the cache).
  useEffect(
    () => () => {
      for (const entry of pendingVoiceRef.current) {
        if (entry.status === 'failed') {
          deleteLocalRecording(entry.localUri);
          if (entry.uploadedPath) void discardVoiceUpload(entry.uploadedPath);
        }
      }
    },
    [],
  );
  const uploadClock = useUploadVisibilityClock(uploadJobs, COMPLETED_UPLOAD_VISIBILITY_MS, peerId);
  const chatUploadJobs = useMemo(
    () =>
      selectChatUploadJobs(uploadJobs, peerId, nixes, {
        now: uploadClock,
        completedVisibilityMs: COMPLETED_UPLOAD_VISIBILITY_MS,
      }),
    [nixes, peerId, uploadClock, uploadJobs],
  );
  // Remembers which upload became which server NiX, so the delivered NiX keeps the upload's
  // cell and position (SEND-8).
  const mediaAnchors = useMemo(
    () => rememberChatMediaAnchors(peerId, chatUploadJobs),
    [chatUploadJobs, peerId],
  );
  const reactionsByMessageId = useMemo(() => groupReactionsByMessageId(reactions), [reactions]);

  const typing = useChatTyping({
    peerId,
    currentUserId,
    enabled: networkAvailable,
    onMessageSaveChanged: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.textMessagesWithPeer(peerId) });
    },
  });

  useMarkConversationRead({
    canUseNetworkSession,
    currentUserId,
    messagesPending: messagesQuery.isPending,
    peerId,
    messages,
  });


  const reportReasons = CHAT_REPORT_REASON_IDS.map((id) => ({
    id,
    label: t(`chat.reportReasons.${id}`),
  }));

  const refreshInboxInBackground = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxActivityBundle });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
  };

  const flushOutboxInBackground = () => {
    void flushTextOutbox(currentUserId)
      .then(async (sentIds) => {
        await queryClient.invalidateQueries({ queryKey: ['textOutbox'] });
        if (sentIds.length === 0) return;
        await messagesQuery.refetch();
        refreshInboxInBackground();
      })
      // Per-message failures are stored on the outbox row and shown on its bubble.
      .catch(() => undefined);
  };

  // Only the local enqueue blocks the composer. Delivery (including server-side moderation, which
  // can take seconds) continues in the background while the user keeps typing.
  // Resolves `false` when the text was not accepted, so the composer puts it back.
  const handleSend = async (body: string): Promise<boolean> => {
    const trimmed = body.trim();
    if (!trimmed || sendingRef.current || !peerId) return false;
    if (composerContext?.mode === 'edit') return handleSubmitEdit(composerContext.messageId, trimmed);

    const clientMessageId = generateClientMessageId();
    const replyToMessageId = composerContext?.mode === 'reply' ? composerContext.messageId : null;
    sendingRef.current = true;
    typing.onComposerStop();

    let enqueued = false;
    await runWithFinally(
      async () => {
        try {
          await enqueueTextOutbox(currentUserId, peerId, trimmed, clientMessageId, null, replyToMessageId);
          enqueued = true;
          if (replyToMessageId) setComposerContext(null);
          await outboxQuery.refetch();
        } catch (error) {
          notifyDomainError(error, t('chat.sendFailure'));
        }
      },
      () => {
        sendingRef.current = false;
      },
    );
    if (enqueued && canUseNetworkSession) flushOutboxInBackground();
    return enqueued;
  };

  const handlePaste = useCallback(
    async (payload: ChatPastePayload) => {
      if (!chatPasteFeatures.pasteInput) return;
      if (!pasteIoRef.current) {
        pasteIoRef.current = createDefaultChatPasteIo();
      }
      await handleChatPastePayload(payload, {
        isImporting: () => pasteImportingRef.current,
        setImporting: (value) => {
          pasteImportingRef.current = value;
          setPasteImporting(value);
        },
        setDraft: setPhotoDraft,
        peerId,
        t,
        notifyError: (title) => {
          notifyError(title);
        },
        notifySuccess: (title) => {
          notifySuccess(title);
        },
        openPreview: (recipientId) => {
          router.push({ pathname: '/preview', params: { recipientId } });
        },
        pasteIo: pasteIoRef.current,
      });
    },
    [peerId, setPhotoDraft, t],
  );

  const updatePendingVoice = (clientId: string, patch: Partial<PendingVoiceMessage>) => {
    setPendingVoice((current) =>
      current.map((entry) => (entry.clientId === clientId ? { ...entry, ...patch } : entry)),
    );
  };

  const removePendingVoice = (entry: PendingVoiceMessage) => {
    setPendingVoice((current) => current.filter((candidate) => candidate.clientId !== entry.clientId));
    deleteLocalRecording(entry.localUri);
    if (entry.uploadedPath) void discardVoiceUpload(entry.uploadedPath);
  };

  /** Upload (once) and create the message; failures stay on the bubble for Retry / Delete. */
  const deliverVoice = async (entry: PendingVoiceMessage) => {
    let uploadedPath = entry.uploadedPath;
    try {
      if (!uploadedPath) {
        uploadedPath = await uploadVoiceRecording({
          senderId: currentUserId,
          receiverId: entry.receiverId,
          fileUri: entry.localUri,
        });
        updatePendingVoice(entry.clientId, { uploadedPath });
      }
      const row = await sendVoiceMessage({
        receiverId: entry.receiverId,
        path: uploadedPath,
        durationMs: entry.durationMs,
        waveform: entry.waveform,
        clientMessageId: entry.clientId,
      });
      queryClient.setQueryData<TextMessage[]>(queryKeys.textMessagesWithPeer(entry.receiverId), (rows) =>
        rows && !rows.some((candidate) => candidate.id === row.id) ? [row, ...rows] : rows,
      );
      // The server row (same client id, same list key) replaces the local bubble.
      setPendingVoice((current) => current.filter((candidate) => candidate.clientId !== entry.clientId));
      deleteLocalRecording(entry.localUri);
      void queryClient.invalidateQueries({ queryKey: queryKeys.textMessagesWithPeer(entry.receiverId) });
      refreshInboxInBackground();
    } catch (error) {
      if (isMissingChatFeatureError(error)) {
        // This backend has no voice messages after all: hide the mic, drop the take quietly.
        markMissing('voiceMessages');
        removePendingVoice({ ...entry, uploadedPath });
        notifyError(t('chat.voiceSendFailure'));
        return;
      }
      updatePendingVoice(entry.clientId, { status: 'failed' });
      notifyDomainError(error, t('chat.voiceSendFailure'));
    }
  };

  const handleSendVoice = (recording: VoiceRecordingResult) => {
    if (!peerId || !currentUserId) {
      deleteLocalRecording(recording.uri);
      return;
    }
    if (!canUseNetworkSession) {
      deleteLocalRecording(recording.uri);
      notifyOffline();
      return;
    }
    const entry: PendingVoiceMessage = {
      clientId: generateVoiceClientId(),
      receiverId: peerId,
      localUri: recording.uri,
      durationMs: recording.durationMs,
      waveform: recording.waveform,
      createdAt: Date.now(),
      status: 'sending',
      uploadedPath: null,
    };
    setPendingVoice((current) => [...current, entry]);
    void deliverVoice(entry);
  };

  /** „Zapisz” / „Nie zapisuj”: optimistic, reverted when the server refuses. */
  const handleSetSaved = async (message: OptimisticTextMessage, saved: boolean) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    if (!capabilities.savedMessages || message.id.startsWith('temp-') || message.is_system) return;
    selection();
    const key = queryKeys.textMessagesWithPeer(peerId);
    const previous = queryClient.getQueryData<TextMessage[]>(key);
    const nowIso = new Date().toISOString();
    queryClient.setQueryData<TextMessage[]>(key, (rows) =>
      rows?.map((row) =>
        row.id === message.id ? withSavedState<TextMessage & ChatMessageExtras>(row, saved, currentUserId, nowIso) : row,
      ),
    );
    try {
      const state = await setTextMessageSaved(message.id, saved);
      queryClient.setQueryData<TextMessage[]>(key, (rows) =>
        rows?.map((row) => (row.id === message.id ? { ...row, ...state } : row)),
      );
      if (!saved) notifyInfo(t('chat.unsavedNotice'));
    } catch (error) {
      queryClient.setQueryData(key, previous);
      if (isMissingChatFeatureError(error)) {
        markMissing('savedMessages');
        return;
      }
      notifyDomainError(error, saved ? t('chat.saveFailure') : t('chat.unsaveFailure'));
    }
  };

  const handleRetryTextMessage = async (outboxId: string) => {
    const voiceClientId = voiceClientIdFromOutboxId(outboxId);
    if (voiceClientId) {
      const entry = pendingVoiceRef.current.find((candidate) => candidate.clientId === voiceClientId);
      if (!entry || !canUseNetworkSession) return;
      updatePendingVoice(voiceClientId, { status: 'sending' });
      void deliverVoice({ ...entry, status: 'sending' });
      return;
    }
    if (!currentUserId) return;
    await retryTextOutboxJob(currentUserId, outboxId);
    await outboxQuery.refetch();
    if (canUseNetworkSession) flushOutboxInBackground();
  };

  /** Removes a failed message or the tombstone of an expired one. */
  const handleDeleteOutboxMessage = async (outboxId: string) => {
    const voiceClientId = voiceClientIdFromOutboxId(outboxId);
    if (voiceClientId) {
      const entry = pendingVoiceRef.current.find((candidate) => candidate.clientId === voiceClientId);
      if (entry) removePendingVoice(entry);
      return;
    }
    if (!currentUserId) return;
    await deleteTextOutboxJob(currentUserId, outboxId);
    await outboxQuery.refetch();
  };

  const handleCancelSendingTextMessage = async (outboxId: string) => {
    if (!currentUserId) return;
    if (!canUseNetworkSession) {
      notifyInfo(t('chat.cancelSendOffline'));
      return;
    }
    try {
      // Remove the local row first so no later flush can enqueue it again.
      const removedLocally = await deleteUnclaimedTextOutboxJob(currentUserId, outboxId);
      // 1:1 chat: every outgoing text goes to the peer.
      const result = await cancelOwnTextMessage(peerId, outboxId);
      if (result === 'already_sent') {
        notifyInfo(t('chat.cancelSendTooLate'));
      } else if (result === 'not_found' && !removedLocally) {
        // A flush is sending it right now and the server has no job yet.
        notifyInfo(t('chat.cancelSendRetry'));
      } else {
        await deleteTextOutboxJob(currentUserId, outboxId);
      }
    } catch (error) {
      notifyDomainError(error, t('chat.cancelSendFailed'));
    } finally {
      await Promise.all([outboxQuery.refetch(), messagesQuery.refetch()]);
    }
  };

    const peerUsername = peerProfileQuery.data?.username ?? null;

  const handleReportMessage = async (message: TextMessage, reason: ReportReason) => {
    if (!canUseNetworkSession) {
      notifyOffline();
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

  /**
   * A received NiX, reported from its chip. Its file is the evidence; once the server has deleted
   * it (after the replay period or 30 days), the report goes to the sender with the NiX's id, so
   * it is never refused just because the content is already gone.
   */
  const handleReportNix = async (nix: ChatNixEvent, reason: ReportReason) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    const reportSender = () =>
      reportContent({
        reportedUserId: peerId,
        reason,
        details: `User reported NiX ${nix.id} from the chat screen; its media was no longer available.`,
      });
    try {
      if (nix.status === 'cleaned' || nix.status === 'cleanup_failed') {
        await reportSender();
      } else {
        try {
          await reportNix(nix.id, reason, 'User reported NiX from the chat screen.');
        } catch {
          // Usually the file was deleted in the meantime and no evidence could be secured.
          await reportSender();
        }
      }
      notifySuccess(t('chat.reportNixSuccess'));
    } catch (error) {
      notifyDomainError(error, t('chat.reportFailure'));
    }
  };

  const handleReportPeer = async (reason: ReportReason) => {
    if (!canUseNetworkSession) {
      notifyOffline();
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
      },
    );
  };

  const handleBlockPeer = async () => {
    if (!canUseNetworkSession) {
      notifyOffline();
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
      },
    );
  };

  const handleDeleteConversation = async () => {
    if (!canUseNetworkSession) {
      notifyOffline();
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
          notifySuccess(
            peerUsername
              ? t('inbox.deleteConversationSuccess', { username: peerUsername })
              : t('inbox.deleteConversationSuccessGeneric')
          );
          router.back();
        } catch (error) {
          notifyDomainError(error, t('inbox.deleteConversationFailure'));
        }
      },
      () => {
        peerActionBusyRef.current = false;
      },
    );
  };

  const handleSetReaction = async (message: TextMessage, emoji: MessageReactionEmoji) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    if (!currentUserId || message.id.startsWith('temp-')) return;

    const existing = (reactionsQuery.data ?? []).find(
      (reaction) => reaction.message_id === message.id && reaction.user_id === currentUserId,
    );
    // Tapback: choosing the reaction that is already mine takes it back.
    if (existing?.emoji === emoji) {
      await handleRemoveReaction(message);
      return;
    }

    selection();
    const previous = reactionsQuery.data ?? [];
    const nowIso = new Date().toISOString();
    const optimistic: MessageReaction[] = [
      ...previous.filter(
        (reaction) => !(reaction.message_id === message.id && reaction.user_id === currentUserId),
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
      optimistic,
    );

    try {
      await upsertMessageReaction(message.id, emoji);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.messageReactionsWithPeer(peerId),
      });
    } catch (error) {
      queryClient.setQueryData<MessageReaction[]>(
        queryKeys.messageReactionsWithPeer(peerId),
        previous,
      );
      notifyDomainError(error, t('chat.reactionFailure'));
    }
  };

  const handleRemoveReaction = async (message: TextMessage) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    if (!currentUserId || message.id.startsWith('temp-')) return;

    const existing = (reactionsQuery.data ?? []).find(
      (reaction) => reaction.message_id === message.id && reaction.user_id === currentUserId,
    );
    if (!existing) return;

    selection();
    const previous = reactionsQuery.data ?? [];
    queryClient.setQueryData<MessageReaction[]>(
      queryKeys.messageReactionsWithPeer(peerId),
      previous.filter(
        (reaction) => !(reaction.message_id === message.id && reaction.user_id === currentUserId),
      ),
    );

    try {
      await removeMessageReaction(message.id);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.messageReactionsWithPeer(peerId),
      });
    } catch (error) {
      queryClient.setQueryData<MessageReaction[]>(
        queryKeys.messageReactionsWithPeer(peerId),
        previous,
      );
      notifyDomainError(error, t('chat.reactionFailure'));
    }
  };

  const messagesKey = queryKeys.textMessagesWithPeer(peerId);

  /** What the menu offers for this message right now (windows checked at open time). */
  const messageActions = (message: OptimisticTextMessage): ChatMessageActions =>
    chatMessageActions(message, {
      currentUserId,
      now: Date.now(),
      online: networkAvailable,
      capabilities,
    });

  const handleStartReply = (message: OptimisticTextMessage) => {
    if (!messageActions(message).reply) return;
    selection();
    const isVoice = message.kind === 'voice';
    setComposerContext({
      peerId,
      context: {
        mode: 'reply',
        messageId: message.id,
        authorIsMe: message.sender_id === currentUserId,
        kind: isVoice ? 'voice' : 'text',
        snippet: isVoice ? '' : message.body.replace(/\s+/g, ' ').trim(),
      },
    });
  };

  const handleStartEdit = (message: OptimisticTextMessage) => {
    if (!messageActions(message).edit) return;
    editSeedRef.current += 1;
    setComposerContext({
      peerId,
      context: { mode: 'edit', messageId: message.id, body: message.body, seed: editSeedRef.current },
    });
  };

  const handleCancelComposerContext = () => setComposerContext(null);

  /** Edit: the new text shows at once; a moderated edit is checked in the background. */
  const handleSubmitEdit = async (messageId: string, body: string): Promise<boolean> => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return false;
    }
    const original =
      queryClient.getQueryData<TextMessage[]>(messagesKey)?.find((row) => row.id === messageId)
      ?? messages.find((row) => row.id === messageId);
    if (!original) {
      // Resolve `true`: the composer must not put the edited text back under a plain composer,
      // where the next tap on Send would post it as a new message.
      setComposerContext(null);
      notifyError(t('chat.editFailure'));
      return true;
    }
    if (original.body === body) {
      setComposerContext(null);
      return true;
    }
    typing.onComposerStop();
    const restore = () =>
      queryClient.setQueryData<TextMessage[]>(messagesKey, (rows) =>
        rows?.map((row) => (row.id === messageId ? { ...row, body: original.body, edited_at: original.edited_at } : row)),
      );
    queryClient.setQueryData<TextMessage[]>(messagesKey, (rows) =>
      rows?.map((row) => (row.id === messageId ? { ...row, body, edited_at: new Date().toISOString() } : row)),
    );
    try {
      const result = await editOwnTextMessage(messageId, body);
      // Only now: on a failure the composer puts the text back under the same „Edytowanie” banner,
      // so it can never go out as a new message.
      setComposerContext(null);
      if (result.status === 'pending') {
        void waitForTextEdit(result.jobId)
          .then(() => queryClient.invalidateQueries({ queryKey: messagesKey }))
          .catch((error: unknown) => {
            restore();
            void queryClient.invalidateQueries({ queryKey: messagesKey });
            if (error instanceof DomainError && error.code === 'CONTENT_NOT_ALLOWED') {
              notifyError(t('chat.editRejected'));
            } else {
              notifyDomainError(error, t('chat.editFailure'));
            }
          });
      } else {
        void queryClient.invalidateQueries({ queryKey: messagesKey });
      }
      refreshInboxInBackground();
      return true;
    } catch (error) {
      restore();
      if (isMissingChatFeatureError(error)) {
        markMissing('messageEdits');
        notifyError(t('chat.editFailure'));
        return false;
      }
      notifyDomainError(error, t('chat.editFailure'));
      return false;
    }
  };

  /** Undo Send: gone for both people at once; put back if the server says it is too late. */
  const handleUnsendMessage = async (message: OptimisticTextMessage) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    if (!messageActions(message).unsend) return;
    const previous = queryClient.getQueryData<TextMessage[]>(messagesKey);
    queryClient.setQueryData<TextMessage[]>(messagesKey, (rows) => rows?.filter((row) => row.id !== message.id));
    if (composerContext?.messageId === message.id) setComposerContext(null);
    try {
      const result = await unsendOwnTextMessage(message.id);
      if (result === 'window_closed') {
        queryClient.setQueryData(messagesKey, previous);
        notifyInfo(t('chat.unsendTooLate'));
        return;
      }
      notifySuccess(t('chat.unsent'));
      refreshInboxInBackground();
    } catch (error) {
      queryClient.setQueryData(messagesKey, previous);
      if (isMissingChatFeatureError(error)) {
        markMissing('messageEdits');
        return;
      }
      notifyDomainError(error, t('chat.unsendFailure'));
    }
  };

  const handleForwardMessage = (message: OptimisticTextMessage) => {
    if (!messageActions(message).forward) return;
    router.push({
      pathname: '/forward-message',
      params: { peerId, messageId: message.id },
    });
  };

  const handleCopyMessage = async (message: TextMessage) => {
    const copied = await copyTextToClipboard(message.body);
    if (copied) notifySuccess(t('chat.copied'));
    else notifyError(t('chat.copyFailure'));
  };

  /**
   * The camera is a tab under this chat in the root stack: `dismissTo` pops back to that tab
   * (in expo-router 57 `navigate` from a root-stack screen pushes a second tab navigator on top).
   * The camera forwards `recipientId` to the preview so the NiX goes straight to this peer.
   */
  const handleOpenCamera = () => {
    if (!peerId) return;
    // `returnTo` gives the camera a close button back to this chat.
    router.dismissTo({ pathname: '/(tabs)', params: { recipientId: peerId, returnTo: 'chat' } });
  };

  const handleOpenNix = (nix: ChatNixEvent) => {
    if (isOfflineAuthenticated) {
      notifyOffline('media');
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
    const operation =
      action === 'pause'
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
            action === 'retry' ? RETRY_FEEDBACK_MIN_MS : 0,
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
      },
    );
  };

  const handleSetMute = async (duration: '1h' | '24h' | 'forever' | 'off') => {
    if (!canUseNetworkSession) {
      notifyOffline();
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

  const peerAvatarUrl = peerAvatarPath ? (peerAvatarUrls[peerAvatarPath] ?? null) : null;
  const nixReactions = useNixReactions(nixes.map((nix) => nix.id));

  // Full-screen loader only on cold messages — nixes stream into the timeline.
  const messagesLoading =
    canUseNetworkSession && messagesQuery.isPending && messagesQuery.data === undefined;
  // Offline with nothing cached on this device (OFF-10): „no messages yet” would be a lie.
  const offlineCacheMissing = !canUseNetworkSession && messagesQuery.data === undefined;

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
    mediaAnchors,
    busyUploadActions,
    reactionsByMessageId,
    nixReactionsById: nixReactions.byNixId,
    messagesLoading,
    offlineCacheMissing,
    loadingOlderMessages,
    onReachedOldestMessage,
    messagesError: canUseNetworkSession && (messagesQuery.isError || nixesQuery.isError),
    pasteInputEnabled: chatPasteFeatures.pasteInput,
    pasteImporting,
    handlePaste,
    reportReasons,
    handleSend,
    handleRetryTextMessage,
    handleDeleteOutboxMessage,
    handleCancelSendingTextMessage,
    handleReportMessage,
    handleReportNix,
    handleReportPeer,
    handleBlockPeer,
    handleDeleteConversation,
    handleSetReaction,
    handleRemoveReaction,
    handleCopyMessage,
    handleSetSaved,
    handleSendVoice,
    messageActions,
    composerContext,
    handleStartReply,
    handleStartEdit,
    handleCancelComposerContext,
    handleUnsendMessage,
    handleForwardMessage,
    canReplyToMessages: capabilities.messageReplies,
    canSaveMessages: capabilities.savedMessages && canUseNetworkSession,
    canRecordVoice: capabilities.voiceMessages && networkAvailable,
    voiceMessagesSupported: capabilities.voiceMessages,
    handleOpenCamera,
    canCopyMessages: isClipboardAvailable(),
    peerTyping: typing.peerTyping,
    onComposerInput: typing.onComposerInput,
    onComposerStop: typing.onComposerStop,
    handleOpenNix,
    handleUploadAction,
    isMuted: Boolean(muteQuery.data),
    handleSetMute,
    canPerformNetworkAction: canUseNetworkSession,
    isOfflineAuthenticated,
    refetchMessages: async () => {
      if (!canUseNetworkSession) {
        notifyOffline();
        return;
      }
      await Promise.all([messagesQuery.refetch(), reactionsQuery.refetch(), nixesQuery.refetch()]);
    },
  };
}

export type ChatScreenViewModel = ReturnType<typeof useChatScreen>;
