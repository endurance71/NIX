import { supabase, captureAccountTransport, type AccountTransport } from '../lib/supabase';
import { getCurrentUser } from './profileService';
import { DomainError } from './errors';
import type { TextMessage } from '../types/database.types';
import { SessionScopeCancelledError } from '../lib/sessionScope';
import { createRpcFallbackGate } from '../lib/rpcFallbackGate';

export type SendTextMessageParams = {
  receiverId: string;
  body: string;
  clientMessageId?: string;
  /** NiX this text answers (20261013100000); dropped on backends without the migration. */
  replyToNixId?: string | null;
  /** Earlier message of the chat this text quotes (20261014100000); dropped likewise. */
  replyToMessageId?: string | null;
  transport?: AccountTransport;
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

function sleep(ms: number, transport: AccountTransport): Promise<void> {
  transport.assertActive();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new SessionScopeCancelledError()); };
    const timer = setTimeout(() => { transport.signal.removeEventListener('abort', abort); resolve(); }, ms);
    transport.signal.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Backends without 20261013100000_text_message_reply_to_nix know neither the RPC parameter
 * (PGRST202) nor the column (PGRST204 / 42703). The text is then sent without its reply context,
 * and the gate skips the doomed first attempt for a while.
 */
const nixReplyGate = createRpcFallbackGate();

export function isMissingNixReplySupportError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === 'PGRST202' || code === '42883') return true;
  return (code === 'PGRST204' || code === '42703') && (error.message ?? '').includes('reply_to_nix_id');
}

/** Same fallback for the quoted message (20261014100000_text_message_reply_edit_unsend). */
const messageReplyGate = createRpcFallbackGate();

export function isMissingMessageReplySupportError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === 'PGRST202' || code === '42883') return true;
  return (code === 'PGRST204' || code === '42703') && (error.message ?? '').includes('reply_to_message_id');
}

type ReplyArgs = { nix: string | null; message: string | null };

/**
 * Runs a send attempt with the reply context, dropping first the quoted message and then the NiX
 * while the backend does not know them. The text itself is always delivered.
 */
async function withReplyFallback<T extends { error: { message?: string; code?: string } | null }>(
  reply: ReplyArgs,
  transport: AccountTransport,
  attempt: (args: ReplyArgs) => PromiseLike<T>
): Promise<T> {
  let args: ReplyArgs = {
    nix: reply.nix && nixReplyGate.shouldTryRpc() ? reply.nix : null,
    message: reply.message && messageReplyGate.shouldTryRpc() ? reply.message : null,
  };
  for (;;) {
    const result = await attempt(args);
    transport.assertActive();
    if (args.message && isMissingMessageReplySupportError(result.error)) {
      messageReplyGate.markUnavailable();
      args = { ...args, message: null };
      continue;
    }
    if (args.nix && isMissingNixReplySupportError(result.error)) {
      nixReplyGate.markUnavailable();
      args = { ...args, nix: null };
      continue;
    }
    return result;
  }
}

function asJobView(data: unknown): TextModerationJobView | null {
  if (!data || typeof data !== 'object') return null;
  return data as TextModerationJobView;
}

function normalizeMessage<T extends { metadata: unknown }>(message: T) {
  const metadata = message.metadata;
  return { ...message, metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? Object.fromEntries(Object.entries(metadata)) : null };
}

async function loadTextMessageById(id: string, transport: AccountTransport): Promise<TextMessage | null> {
  transport.assertActive();
  const { data, error } = await transport.client
    .from('text_messages')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  transport.assertActive();
  if (error || !data) return null;
  return normalizeMessage(data);
}

async function waitForOwnTextJob(jobId: string, transport: AccountTransport): Promise<TextMessage> {
  const deadline = Date.now() + MODERATION_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    transport.assertActive();
    const { data, error } = await transport.client.rpc('get_own_text_moderation_job', {
      p_job_id: jobId,
    });
    transport.assertActive();
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
        await sleep(MODERATION_POLL_INTERVAL_MS, transport);
        break;
      case 'approved': {
        const messageId = job?.messageId;
        if (typeof messageId === 'string' && messageId.length > 0) {
          const message = await loadTextMessageById(messageId, transport);
          if (message) return message;
        }
        await sleep(MODERATION_POLL_INTERVAL_MS, transport);
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

/** Server-enforced limit (the composer caps input at the same length). */
export const TEXT_MESSAGE_MAX_LENGTH = 2000;

export async function sendTextMessage({
  receiverId,
  body,
  clientMessageId,
  replyToNixId = null,
  replyToMessageId = null,
  transport: suppliedTransport,
}: SendTextMessageParams): Promise<TextMessage> {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    throw new DomainError('INVALID_INPUT', 'Wiadomość nie może być pusta.');
  }

  if (trimmedBody.length > TEXT_MESSAGE_MAX_LENGTH) {
    throw new DomainError('INVALID_INPUT', 'Wiadomość przekracza limit 2000 znaków.');
  }

  const transport = suppliedTransport ?? await captureAccountTransport();
  transport.assertActive();

  const enqueueArgs = {
    p_receiver_id: receiverId,
    p_body: trimmedBody,
    p_client_message_id: clientMessageId ?? null,
  };
  const reply: ReplyArgs = { nix: replyToNixId, message: replyToMessageId };
  // Only the parameters in use are sent: older backends never see an unknown one.
  const enqueued = await withReplyFallback(reply, transport, (args) =>
    transport.client.rpc('enqueue_own_text_moderation_job', {
      ...enqueueArgs,
      ...(args.nix ? { p_reply_to_nix_id: args.nix } : {}),
      ...(args.message ? { p_reply_to_message_id: args.message } : {}),
    })
  );
  const { data: enqueueData, error: enqueueError } = enqueued;

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
      return waitForOwnTextJob(jobId, transport);
    }
  }

  transport.assertActive();
  const row = {
    sender_id: transport.ownerId,
    receiver_id: receiverId,
    body: trimmedBody,
    client_message_id: clientMessageId ?? null,
  };
  const inserted = await withReplyFallback(reply, transport, (args) =>
    transport.client
      .from('text_messages')
      // An undefined key is left out of the JSON body: older backends never see the column.
      .insert({
        ...row,
        reply_to_nix_id: args.nix ?? undefined,
        reply_to_message_id: args.message ?? undefined,
      })
      .select('*')
      .single()
  );
  const { data, error } = inserted;

  if (error) {
    if (error.code === '23505' && clientMessageId) {
      const { data: existing } = await transport.client
        .from('text_messages')
        .select('*')
        .eq('sender_id', transport.ownerId)
        .eq('receiver_id', receiverId)
        .eq('client_message_id', clientMessageId)
        .maybeSingle();
      transport.assertActive();

      if (existing) return normalizeMessage(existing);
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

  return normalizeMessage(data);
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

  return (data || []).map(normalizeMessage);
}

/**
 * Newest messages with a peer across `pageCount` pages. Each call walks the
 * pages with fresh cursors, so a refetch never leaves a gap between pages.
 */
export async function fetchRecentTextMessagesWithPeer(
  peerId: string,
  pageCount: number,
  pageSize = 50
): Promise<TextMessage[]> {
  const rows: TextMessage[] = [];
  let beforeCreatedAt: string | undefined;
  for (let page = 0; page < pageCount; page += 1) {
    const batch = await fetchTextMessagesWithPeer({ peerId, beforeCreatedAt, limit: pageSize });
    rows.push(...batch);
    // The RPC returns newest first; the last row is the next page's cursor.
    if (batch.length < pageSize) break;
    beforeCreatedAt = batch[batch.length - 1].created_at;
  }
  return rows;
}

/**
 * `applied`: the new body is live; `pending`: it waits for moderation (`jobId`); `unchanged`: the
 * same text was submitted.
 */
export type EditTextMessageResult =
  | { status: 'applied' | 'unchanged' }
  | { status: 'pending'; jobId: string };

function editErrorFromText(text: string, fallback: string): DomainError {
  if (text.includes('EDIT_WINDOW_CLOSED')) {
    return new DomainError('EDIT_WINDOW_CLOSED', 'Tej wiadomości nie można już edytować.');
  }
  if (text.includes('EDIT_LIMIT_REACHED')) {
    return new DomainError('EDIT_LIMIT_REACHED', 'Tę wiadomość edytowano już maksymalną liczbę razy.');
  }
  if (text.includes('CONTENT_NOT_ALLOWED')) {
    return new DomainError('CONTENT_NOT_ALLOWED', 'Ta wiadomość nie może zostać wysłana.');
  }
  if (text.includes('NOT_FRIEND')) {
    return new DomainError('NOT_FRIEND', 'Nie możesz już pisać do tego użytkownika.');
  }
  if (text.includes('NOT_FOUND') || text.includes('NOT_EDITABLE')) {
    return new DomainError('NOT_FOUND', 'Wiadomość już zniknęła.');
  }
  if (text.includes('INVALID_INPUT')) {
    return new DomainError('INVALID_INPUT', 'Wiadomość nie może być pusta.');
  }
  if (text.includes('UNAUTHORIZED')) return new DomainError('UNAUTHORIZED', 'Wymagane logowanie.');
  return new DomainError('UNKNOWN', fallback);
}

/** Sender edits their own text (within 15 minutes, at most 5 times). */
export async function editOwnTextMessage(messageId: string, body: string): Promise<EditTextMessageResult> {
  const trimmed = body.trim();
  if (!trimmed) throw new DomainError('INVALID_INPUT', 'Wiadomość nie może być pusta.');
  if (trimmed.length > TEXT_MESSAGE_MAX_LENGTH) {
    throw new DomainError('INVALID_INPUT', 'Wiadomość przekracza limit 2000 znaków.');
  }
  const { data, error } = await supabase.rpc('edit_own_text_message', {
    p_message_id: messageId,
    p_body: trimmed,
  });
  if (error) {
    // Keep the PostgREST code: the caller hides the feature when the RPC is not deployed.
    throw Object.assign(editErrorFromText(errorText(error), error.message || 'Nie udało się edytować wiadomości.'), {
      postgrestCode: error.code,
    });
  }
  const view = asJobView(data);
  if (view?.status === 'pending' && typeof view.jobId === 'string' && view.jobId) {
    return { status: 'pending', jobId: view.jobId };
  }
  if (view?.status === 'applied' || view?.status === 'unchanged') return { status: view.status };
  throw new DomainError('UNKNOWN', 'Nie udało się edytować wiadomości.');
}

/**
 * Waits until a moderated edit is applied (`applied`) or turned down (throws). `unknown` when the
 * worker is slow: the chat simply refetches later.
 */
export async function waitForTextEdit(jobId: string): Promise<'applied' | 'unknown'> {
  const transport = await captureAccountTransport();
  const deadline = Date.now() + MODERATION_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    transport.assertActive();
    const { data, error } = await transport.client.rpc('get_own_text_moderation_job', { p_job_id: jobId });
    transport.assertActive();
    if (error) throw editErrorFromText(errorText(error), 'Nie udało się sprawdzić edycji.');
    const job = asJobView(data);
    if (job?.status === 'rejected') {
      throw new DomainError('CONTENT_NOT_ALLOWED', 'Ta wiadomość nie może zostać wysłana.');
    }
    if (job?.status === 'error') throw new DomainError('UNKNOWN', 'Nie udało się edytować wiadomości.');
    if (job?.status === 'approved' && typeof job.messageId === 'string' && job.messageId) return 'applied';
    await sleep(MODERATION_POLL_INTERVAL_MS, transport);
  }
  return 'unknown';
}

export type UnsendTextMessageResult = 'unsent' | 'window_closed' | 'not_found';

/** Sender deletes their own text or voice message for both people (within 5 minutes). */
export async function unsendOwnTextMessage(messageId: string): Promise<UnsendTextMessageResult> {
  const { data, error } = await supabase.rpc('unsend_own_text_message', { p_message_id: messageId });
  if (error) {
    throw Object.assign(editErrorFromText(errorText(error), error.message || 'Nie udało się cofnąć wysłania.'), {
      postgrestCode: error.code,
    });
  }
  if (data === 'unsent' || data === 'window_closed' || data === 'not_found') return data;
  throw new DomainError('UNKNOWN', 'Nie udało się cofnąć wysłania.');
}

export type CancelTextMessageResult = 'cancelled' | 'already_sent' | 'not_sent' | 'not_found';

/** Cancels the sender's text while it still waits for moderation. */
export async function cancelOwnTextMessage(
  receiverId: string,
  clientMessageId: string
): Promise<CancelTextMessageResult> {
  const { data, error } = await supabase.rpc('cancel_own_text_moderation_job', {
    p_receiver_id: receiverId,
    p_client_message_id: clientMessageId,
  });
  if (error) {
    throw new DomainError('UNKNOWN', error.message || 'Nie udało się anulować wysyłania.');
  }
  if (data === 'cancelled' || data === 'already_sent' || data === 'not_sent' || data === 'not_found') {
    return data;
  }
  throw new DomainError('UNKNOWN', 'Nie udało się anulować wysyłania.');
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
  /** Set on inbox rows built from the local text outbox (not yet on the server). */
  outbox_state?: 'pending' | 'sending' | 'failed';
};

/** Columns selected for the inbox text preview; mirrored by the `get_inbox_bundle` RPC. */
export type RecentTextMessageRow = Pick<
  TextMessage,
  | 'id'
  | 'sender_id'
  | 'receiver_id'
  | 'body'
  | 'created_at'
  | 'expires_at'
  | 'client_message_id'
  | 'is_system'
> & {
  metadata: unknown;
  /** Read receipt; only backends with 20261011160000_message_status_receipts return it. */
  read_at?: string | null;
};

export function mapRecentTextMessageRow(
  msg: RecentTextMessageRow,
  currentUserId: string
): RecentTextMessageItem {
  return {
    ...normalizeMessage(msg),
    peer_id: msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id,
  };
}

/**
 * Rows from `get_inbox_bundle` already carry `peer_id` (computed against `auth.uid()`), so no
 * client-side user lookup is needed.
 */
export function mapRecentTextMessageRpcRow(
  msg: RecentTextMessageRow & { peer_id: string }
): RecentTextMessageItem {
  return {
    ...normalizeMessage(msg),
    peer_id: msg.peer_id,
  };
}

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

  return (data || []).map((msg) => mapRecentTextMessageRow(msg, user.id));
}

export type TextMessageSavedState = {
  id: string;
  saved_at: string | null;
  saved_by: string | null;
  expires_at: string;
};

/**
 * „Zapisz w czacie” / „Nie zapisuj” (migration 20261012100000). Either participant may save or
 * unsave; an unsaved message expires 24 h later.
 */
export async function setTextMessageSaved(messageId: string, saved: boolean): Promise<TextMessageSavedState> {
  const { data, error } = await supabase.rpc('set_text_message_saved', {
    p_message_id: messageId,
    p_saved: saved,
  });
  if (error) {
    const text = errorText(error);
    if (text.includes('NOT_FOUND')) throw new DomainError('NOT_FOUND', 'Wiadomość już zniknęła.');
    if (text.includes('UNAUTHORIZED')) throw new DomainError('UNAUTHORIZED', 'Wymagane logowanie.');
    // Keep the PostgREST code: the caller hides the feature when the RPC is not deployed.
    throw Object.assign(new DomainError('UNKNOWN', error.message || 'Nie udało się zapisać wiadomości.'), {
      postgrestCode: error.code,
    });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new DomainError('NOT_FOUND', 'Wiadomość już zniknęła.');
  return row as TextMessageSavedState;
}
