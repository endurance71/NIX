import { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { queryKeys, avatarSignedUrlsQueryKey } from '../lib/queryKeys';
import { sortMessagesAscending } from '../lib/chatTimeline';
import {
  fetchTextMessagesWithPeer,
  sendTextMessage,
} from '../services/textMessageService';
import { fetchChatNixesWithPeer, fetchNixPublicProfiles, type ChatNixEvent } from '../services/nixService';
import { createSignedAvatarUrls } from '../services/avatarService';
import { reportContent, type ReportReason } from '../services/safetyService';
import { notifyDomainError, notifySuccess } from '../lib/appNotify';
import type { TextMessage } from '../types/database.types';

function generateClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type OptimisticTextMessage = TextMessage & {
  isSending?: boolean;
  sendFailed?: boolean;
};

const CHAT_REPORT_REASON_IDS = ['harassment', 'spam', 'other'] as const satisfies readonly ReportReason[];

export function useChatScreen(peerId: string) {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? '';
  const queryClient = useQueryClient();

  const [inputBody, setInputBody] = useState('');
  const [composerKey, setComposerKey] = useState(0);
  const [sending, setSending] = useState(false);

  const peerProfileQuery = useQuery({
    queryKey: ['peerProfile', peerId],
    queryFn: async () => {
      const map = await fetchNixPublicProfiles([peerId]);
      return map.get(peerId) ?? null;
    },
    staleTime: 60_000,
    enabled: Boolean(peerId),
  });

  const peerAvatarPath = peerProfileQuery.data?.avatar_storage_path ?? null;
  const peerAvatarQuery = useQuery({
    queryKey: avatarSignedUrlsQueryKey(peerAvatarPath ? [peerAvatarPath] : []),
    queryFn: () => createSignedAvatarUrls(peerAvatarPath ? [peerAvatarPath] : []),
    staleTime: 5 * 60_000,
    enabled: Boolean(peerAvatarPath),
  });

  const messagesQuery = useQuery({
    queryKey: queryKeys.textMessagesWithPeer(peerId),
    queryFn: () => fetchTextMessagesWithPeer({ peerId, limit: 50 }),
    staleTime: 2_000,
    enabled: Boolean(peerId),
    refetchOnWindowFocus: true,
    select: (rows) => sortMessagesAscending(rows),
  });

  const nixesQuery = useQuery({
    queryKey: ['chatNixesWithPeer', peerId] as const,
    queryFn: () => fetchChatNixesWithPeer(peerId, 50),
    staleTime: 2_000,
    enabled: Boolean(peerId),
    refetchOnWindowFocus: true,
  });

  const messages: OptimisticTextMessage[] = messagesQuery.data ?? [];
  const nixes: ChatNixEvent[] = nixesQuery.data ?? [];

  const reportReasons = useMemo(
    () =>
      CHAT_REPORT_REASON_IDS.map((id) => ({
        id,
        label: t(`chat.reportReasons.${id}`),
      })),
    [t]
  );

  const invalidateChat = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.textMessagesWithPeer(peerId) }),
      queryClient.invalidateQueries({ queryKey: ['chatNixesWithPeer', peerId] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxActivityBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
    ]);
  }, [peerId, queryClient]);

  const handleSend = useCallback(async () => {
    const trimmed = inputBody.trim();
    if (!trimmed || sending || !peerId) return;

    const clientMessageId = generateClientMessageId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const optimisticMsg: OptimisticTextMessage = {
      id: `temp-${clientMessageId}`,
      sender_id: currentUserId,
      receiver_id: peerId,
      body: trimmed,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      client_message_id: clientMessageId,
      isSending: true,
    };

    setInputBody('');
    setComposerKey((key) => key + 1);
    setSending(true);

    queryClient.setQueryData<TextMessage[]>(queryKeys.textMessagesWithPeer(peerId), (old = []) =>
      sortMessagesAscending([...old, optimisticMsg])
    );

    try {
      await sendTextMessage({
        receiverId: peerId,
        body: trimmed,
        clientMessageId,
      });
      await invalidateChat();
    } catch (error) {
      queryClient.setQueryData<TextMessage[]>(queryKeys.textMessagesWithPeer(peerId), (old = []) =>
        old.filter((m) => m.client_message_id !== clientMessageId)
      );
      notifyDomainError(error, t('chat.sendFailure'));
      setInputBody(trimmed);
      setComposerKey((key) => key + 1);
    } finally {
      setSending(false);
    }
  }, [inputBody, sending, peerId, currentUserId, queryClient, t, invalidateChat]);

  const handleReportMessage = useCallback(
    async (message: TextMessage, reason: ReportReason) => {
      try {
        await reportContent({
          reportedUserId: message.sender_id,
          textMessageId: message.id,
          reason,
          details: 'User reported text message in chat screen.',
        });
        notifySuccess(t('chat.reportSuccess'));
      } catch (error) {
        notifyDomainError(error, t('chat.reportFailure'));
      }
    },
    [t]
  );

  const handleOpenNix = useCallback(
    (nix: ChatNixEvent) => {
      if (nix.direction !== 'received' || nix.is_viewed || !nix.media_path) return;
      if (nix.status === 'cleaned' || nix.status === 'cleanup_failed') return;
      router.push({
        pathname: '/viewer',
        params: {
          id: nix.id,
          path: nix.media_path,
          senderId: peerId,
        },
      });
    },
    [peerId]
  );

  const peerAvatarUrl = peerAvatarPath ? peerAvatarQuery.data?.[peerAvatarPath] ?? null : null;
  const messagesLoading =
    (messagesQuery.isPending && messagesQuery.data === undefined) ||
    (nixesQuery.isPending && nixesQuery.data === undefined);

  return {
    t,
    locale: i18n.language || 'pl',
    currentUserId,
    peerId,
    peerProfile: peerProfileQuery.data,
    peerAvatarUrl,
    peerAvatarPath,
    peerLoading: peerProfileQuery.isPending,
    messages,
    nixes,
    messagesLoading,
    messagesError: messagesQuery.isError || nixesQuery.isError,
    inputBody,
    setInputBody,
    composerKey,
    sending,
    reportReasons,
    handleSend,
    handleReportMessage,
    handleOpenNix,
    refetchMessages: async () => {
      await Promise.all([messagesQuery.refetch(), nixesQuery.refetch()]);
    },
  };
}

export type ChatScreenViewModel = ReturnType<typeof useChatScreen>;
