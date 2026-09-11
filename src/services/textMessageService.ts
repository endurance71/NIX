import { supabase } from '../lib/supabase';
import { getCurrentUser } from './profileService';
import { DomainError } from './errors';
import type { TextMessage } from '../types/database.types';

export type SendTextMessageParams = {
  receiverId: string;
  body: string;
  clientMessageId?: string;
};

export type FetchTextMessagesParams = {
  peerId: string;
  beforeCreatedAt?: string;
  limit?: number;
};

async function invokeSendTextMessage(input: SendTextMessageParams): Promise<TextMessage> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    status?: string;
    code?: string;
    jobId?: string;
    message?: TextMessage;
  }>('send-text-message', {
    body: {
      receiverId: input.receiverId,
      body: input.body,
      clientMessageId: input.clientMessageId ?? null,
    },
  });

  if (error) {
    const context = error.context instanceof Response ? error.context : null;
    let serverCode = '';
    if (context) {
      const payload = await context.clone().json().catch(() => null) as { code?: string } | null;
      serverCode = payload?.code ?? '';
    }
    if (serverCode === 'MODERATION_DISABLED') {
      throw new DomainError('MODERATION_DISABLED', 'Moderacja pre-delivery jest wyłączona.');
    }
    if (serverCode === 'CONTENT_NOT_ALLOWED') {
      throw new DomainError('CONTENT_NOT_ALLOWED', 'Ta wiadomość nie może zostać wysłana.');
    }
    if (serverCode === 'MODERATION_RETRYABLE') {
      throw new DomainError('MODERATION_RETRYABLE', 'Weryfikacja treści jest chwilowo niedostępna.');
    }
    if (serverCode === 'NOT_FRIEND') {
      throw new DomainError('NOT_FRIEND', 'Nie możesz wysłać wiadomości do tego użytkownika (wymagana relacja znajomości).');
    }
    throw new DomainError('UNKNOWN', error.message || 'Nie udało się wysłać wiadomości.');
  }

  if (data?.code === 'MODERATION_PENDING' || data?.status === 'moderation_pending') {
    throw new DomainError('MODERATION_PENDING', 'Wiadomość oczekuje na weryfikację.');
  }
  if (data?.message) return data.message;
  if (data?.status === 'approved') {
    throw new DomainError('MODERATION_PENDING', 'Wiadomość oczekuje na weryfikację.');
  }
  throw new DomainError('MODERATION_RETRYABLE', 'Weryfikacja treści jest chwilowo niedostępna.');
}

async function insertTextMessageDirect(input: SendTextMessageParams, userId: string): Promise<TextMessage> {
  const trimmedBody = input.body.trim();
  const { data, error } = await supabase
    .from('text_messages')
    .insert({
      sender_id: userId,
      receiver_id: input.receiverId,
      body: trimmedBody,
      client_message_id: input.clientMessageId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' && input.clientMessageId) {
      const { data: existing } = await supabase
        .from('text_messages')
        .select('*')
        .eq('sender_id', userId)
        .eq('receiver_id', input.receiverId)
        .eq('client_message_id', input.clientMessageId)
        .maybeSingle();

      if (existing) return existing;
    }

    if (error.message.includes('can_send_text_message') || error.code === '42501') {
      throw new DomainError(
        'NOT_FRIEND',
        'Nie możesz wysłać wiadomości do tego użytkownika (wymagana relacja znajomości).'
      );
    }

    if (error.message.includes('text_messages_safety_filter_chk')) {
      throw new DomainError('CONTENT_NOT_ALLOWED', 'Ta wiadomość nie może zostać wysłana.');
    }

    throw new DomainError('UNKNOWN', error.message || 'Nie udało się wysłać wiadomości.');
  }

  return data;
}

export async function sendTextMessage({
  receiverId,
  body,
  clientMessageId,
}: SendTextMessageParams): Promise<TextMessage> {
  const user = await getCurrentUser();
  if (!user) {
    throw new DomainError('UNAUTHORIZED', 'Wymagane logowanie.');
  }

  const trimmedBody = body.trim();

  if (!trimmedBody) {
    throw new DomainError('INVALID_INPUT', 'Wiadomość nie może być pusta.');
  }

  if (trimmedBody.length > 2000) {
    throw new DomainError('INVALID_INPUT', 'Wiadomość przekracza limit 2000 znaków.');
  }

  const input = { receiverId, body: trimmedBody, clientMessageId };
  try {
    return await invokeSendTextMessage(input);
  } catch (error) {
    // Direct INSERT is allowed only while the Edge kill-switch reports
    // MODERATION_DISABLED (flag off, contract not yet live). Retryable,
    // pending and reject never fall back to client INSERT.
    if (error instanceof DomainError && error.code === 'MODERATION_DISABLED') {
      return insertTextMessageDirect(input, user.id);
    }
    throw error instanceof DomainError
      ? error
      : new DomainError('UNKNOWN', 'Nie udało się wysłać wiadomości.');
  }
}

export async function fetchTextMessagesWithPeer({
  peerId,
  beforeCreatedAt,
  limit = 50,
}: FetchTextMessagesParams): Promise<TextMessage[]> {
  const { data, error } = await supabase.rpc('fetch_text_messages_with_peer', {
    peer_id: peerId,
    before_created_at: beforeCreatedAt ?? null,
    msg_limit: limit,
  });

  if (error) {
    throw new DomainError('UNKNOWN', error.message || 'Błąd pobierania wiadomości.');
  }

  return (data || []).map((row: {
    id: string;
    sender_id: string;
    receiver_id: string;
    body: string;
    created_at: string;
    expires_at: string;
    client_message_id: string | null;
    metadata: unknown;
    is_system: boolean;
  }) => ({
    id: row.id,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    body: row.body,
    created_at: row.created_at,
    expires_at: row.expires_at,
    client_message_id: row.client_message_id,
    metadata: row.metadata,
    is_system: row.is_system,
  }));
}

export async function deleteTextMessageConversation(peerId: string): Promise<number> {
  const { data, error } = await supabase.rpc('delete_my_conversation_with_peer', {
    peer_profile_id: peerId,
  });

  if (error) {
    throw new DomainError('UNKNOWN', error.message || 'Nie udało się usunąć rozmowy.');
  }

  return data ?? 0;
}

export type RecentTextMessageItem = TextMessage & {
  peer_id: string;
  is_unread?: boolean;
};

export async function fetchRecentTextMessagesForInbox(): Promise<RecentTextMessageItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('text_messages')
    .select('id, sender_id, receiver_id, body, created_at, expires_at, client_message_id, is_system, metadata')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Failed to fetch recent text messages for inbox', error);
    return [];
  }

  return (data || []).map((msg) => ({
    ...msg,
    peer_id: msg.sender_id === user.id ? msg.receiver_id : msg.sender_id,
  }));
}
