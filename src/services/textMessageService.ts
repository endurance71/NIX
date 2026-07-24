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

export async function sendTextMessage({
  receiverId,
  body,
  clientMessageId,
}: SendTextMessageParams): Promise<TextMessage> {
  const user = await getCurrentUser();
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    throw new DomainError('MESSAGE_EMPTY', 'Wiadomość nie może być pusta.');
  }

  if (trimmedBody.length > 2000) {
    throw new DomainError('MESSAGE_TOO_LONG', 'Wiadomość przekracza limit 2000 znaków.');
  }

  const { data, error } = await supabase
    .from('text_messages')
    .insert({
      sender_id: user.id,
      receiver_id: receiverId,
      body: trimmedBody,
      client_message_id: clientMessageId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' && clientMessageId) {
      // Duplicate client_message_id (idempotency key already inserted)
      const { data: existing } = await supabase
        .from('text_messages')
        .select('*')
        .eq('sender_id', user.id)
        .eq('receiver_id', receiverId)
        .eq('client_message_id', clientMessageId)
        .maybeSingle();

      if (existing) return existing;
    }

    if (error.message.includes('can_send_text_message') || error.code === '42501') {
      throw new DomainError(
        'NOT_FRIENDS_OR_RESTRICTED',
        'Nie możesz wysłać wiadomości do tego użytkownika (wymagana relacja znajomości).'
      );
    }

    throw new DomainError('SEND_MESSAGE_FAILED', error.message || 'Nie udało się wysłać wiadomości.');
  }

  return data;
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
    throw new DomainError('FETCH_MESSAGES_FAILED', error.message || 'Błąd pobierania wiadomości.');
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    body: row.body,
    created_at: row.created_at,
    expires_at: row.expires_at,
    client_message_id: row.client_message_id,
  }));
}

export async function deleteTextMessageConversation(peerId: string): Promise<number> {
  const { data, error } = await supabase.rpc('delete_my_conversation_with_peer', {
    peer_profile_id: peerId,
  });

  if (error) {
    throw new DomainError('DELETE_CONVERSATION_FAILED', error.message || 'Nie udało się usunąć rozmowy.');
  }

  return data ?? 0;
}

export type RecentTextMessageItem = TextMessage & {
  peer_id: string;
};

export async function fetchRecentTextMessagesForInbox(): Promise<RecentTextMessageItem[]> {
  const user = await getCurrentUser();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('text_messages')
    .select('*')
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
