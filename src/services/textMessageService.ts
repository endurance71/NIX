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

const MODERATION_POLL_INTERVAL_MS = 400;
const MODERATION_POLL_TIMEOUT_MS = 30_000;

type TextModerationJobView = {
  jobId?: string;
  status?: string;
  decision?: string | null;
  messageId?: string | null;
};

function errorText(error: { message?: string; code?: string } | null | undefined): string {
  return `${error?.code ?? ''} ${error?.message ?? ''}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asJobView(data: unknown): TextModerationJobView | null {
  if (!data || typeof data !== 'object') return null;
  return data as TextModerationJobView;
}

async function loadTextMessageById(id: string): Promise<TextMessage | null> {
  const { data, error } = await supabase
    .from('text_messages')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function waitForOwnTextJob(jobId: string): Promise<TextMessage> {
  const deadline = Date.now() + MODERATION_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data, error } = await supabase.rpc('get_own_text_moderation_job', {
      p_job_id: jobId,
    });
    if (error) {
      const text = errorText(error);
      if (text.includes('UNAUTHORIZED')) {
        throw new DomainError('UNAUTHORIZED', 'Wymagane logowanie.');
      }
      throw new DomainError('UNKNOWN', error.message || 'Nie udało się sprawdzić moderacji.');
    }

    const job = asJobView(data);
    const status = job?.status ?? '';
    switch (status) {
      case 'pending':
      case 'processing':
        await sleep(MODERATION_POLL_INTERVAL_MS);
        break;
      case 'approved': {
        const messageId = job?.messageId;
        if (typeof messageId === 'string' && messageId.length > 0) {
          const message = await loadTextMessageById(messageId);
          if (message) return message;
        }
        await sleep(MODERATION_POLL_INTERVAL_MS);
        break;
      }
      case 'rejected':
        throw new DomainError('CONTENT_NOT_ALLOWED', 'Ta wiadomość nie może zostać wysłana.');
      case 'error':
        throw new DomainError('UNKNOWN', 'Moderacja nie powiodła się. Spróbuj ponownie.');
      default:
        throw new DomainError('UNKNOWN', 'Nie udało się wysłać wiadomości.');
    }
  }

  throw new DomainError('UNKNOWN', 'Moderacja trwa zbyt długo. Spróbuj ponownie.');
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

  const { data: enqueueData, error: enqueueError } = await supabase.rpc(
    'enqueue_own_text_moderation_job',
    {
      p_receiver_id: receiverId,
      p_body: trimmedBody,
      p_client_message_id: clientMessageId ?? null,
    }
  );

  if (enqueueError) {
    const text = errorText(enqueueError);
    if (text.includes('NOT_FRIEND')) {
      throw new DomainError(
        'NOT_FRIEND',
        'Nie możesz wysłać wiadomości do tego użytkownika (wymagana relacja znajomości).'
      );
    }
    if (text.includes('CONTENT_NOT_ALLOWED')) {
      throw new DomainError('CONTENT_NOT_ALLOWED', 'Ta wiadomość nie może zostać wysłana.');
    }
    if (text.includes('UNAUTHORIZED')) {
      throw new DomainError('UNAUTHORIZED', 'Wymagane logowanie.');
    }
    if (!text.includes('MODERATION_DISABLED')) {
      throw new DomainError('UNKNOWN', enqueueError.message || 'Nie udało się wysłać wiadomości.');
    }
  } else {
    const job = asJobView(enqueueData);
    const status = job?.status;
    const jobId = job?.jobId;
    if (status === 'rejected') {
      throw new DomainError('CONTENT_NOT_ALLOWED', 'Ta wiadomość nie może zostać wysłana.');
    }
    if (status === 'error') {
      throw new DomainError('UNKNOWN', 'Moderacja nie powiodła się. Spróbuj ponownie.');
    }
    if (status === 'pending' || status === 'processing' || status === 'approved') {
      if (typeof jobId !== 'string' || jobId.length === 0) {
        throw new DomainError('UNKNOWN', 'Nie udało się wysłać wiadomości.');
      }
      return waitForOwnTextJob(jobId);
    }
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
    metadata: any;
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
