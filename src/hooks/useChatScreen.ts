import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { useAppTheme } from './useAppTheme';
import { queryKeys } from '../lib/queryKeys';
import {
  fetchTextMessagesWithPeer,
  sendTextMessage,
} from '../services/textMessageService';
import { fetchNixPublicProfiles } from '../services/profileService';
import { reportContent } from '../services/safetyService';
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

export function useChatScreen(peerId: string) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? '';
  const queryClient = useQueryClient();

  const [inputBody, setInputBody] = useState('');
  const [sending, setSending] = useState(false);

  // Peer profile query
  const peerProfileQuery = useQuery({
    queryKey: ['peerProfile', peerId],
    queryFn: async () => {
      const map = await fetchNixPublicProfiles([peerId]);
      return map.get(peerId) ?? null;
    },
    staleTime: 60_000,
    enabled: Boolean(peerId),
  });

  // Messages query
  const messagesQuery = useQuery({
    queryKey: queryKeys.textMessagesWithPeer(peerId),
    queryFn: () => fetchTextMessagesWithPeer({ peerId, limit: 50 }),
    staleTime: 2_000,
    enabled: Boolean(peerId),
    refetchOnWindowFocus: true,
  });

  const messages: OptimisticTextMessage[] = messagesQuery.data ?? [];

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
    setSending(true);

    // Optimistic cache update
    queryClient.setQueryData<TextMessage[]>(
      queryKeys.textMessagesWithPeer(peerId),
      (old = []) => [optimisticMsg, ...old]
    );

    try {
      await sendTextMessage({
        receiverId: peerId,
        body: trimmed,
        clientMessageId,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.textMessagesWithPeer(peerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inboxActivityBundle }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
      ]);
    } catch (error) {
      // Mark failed or revert
      queryClient.setQueryData<TextMessage[]>(
        queryKeys.textMessagesWithPeer(peerId),
        (old = []) => old.filter((m) => m.client_message_id !== clientMessageId)
      );
      notifyDomainError(error, t('chat.sendFailure'));
      setInputBody(trimmed);
    } finally {
      setSending(false);
    }
  }, [inputBody, sending, peerId, currentUserId, queryClient, t]);

  const handleReportMessage = useCallback(
    async (message: TextMessage) => {
      try {
        await reportContent({
          reportedUserId: message.sender_id,
          textMessageId: message.id,
          reason: 'inappropriate_text',
          details: 'User reported text message in chat screen.',
        });
        notifySuccess(t('chat.reportSuccess'));
      } catch (error) {
        notifyDomainError(error, t('chat.reportFailure'));
      }
    },
    [t]
  );

  return {
    t,
    colors,
    currentUserId,
    peerId,
    peerProfile: peerProfileQuery.data,
    peerLoading: peerProfileQuery.isPending,
    messages,
    messagesLoading: messagesQuery.isPending && messagesQuery.data === undefined,
    messagesError: messagesQuery.isError,
    inputBody,
    setInputBody,
    sending,
    handleSend,
    handleReportMessage,
    refetchMessages: messagesQuery.refetch,
  };
}

export type ChatScreenViewModel = ReturnType<typeof useChatScreen>;
