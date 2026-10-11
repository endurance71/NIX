import type { TextMessage } from '../types/database.types';
import type { TextOutboxJob } from '../services/textOutboxService';
import type { OptimisticTextMessage } from '../hooks/useChatScreen';
import { isTextMessageExpired, sortMessagesAscending } from './chatTimeline';

/**
 * What the chat bubble says about a message that is still in the local outbox.
 * - `sending`: online, the outbox will deliver it (spinner)
 * - `waiting_network`: offline, nothing can happen until the network is back (OFF-7)
 * - `failed`: terminal error, the user decides (retry / delete)
 * - `expired`: content TTL passed before delivery; only a tombstone is left (OFF-4)
 */
export type ChatOutboxStatus = 'sending' | 'waiting_network' | 'failed' | 'expired';

export function chatOutboxStatus(job: Pick<TextOutboxJob, 'state'>, online: boolean): ChatOutboxStatus {
  if (job.state === 'expired') return 'expired';
  if (job.state === 'failed') return 'failed';
  return online ? 'sending' : 'waiting_network';
}

export function mergeChatOutboxMessages(
  serverMessages: TextMessage[],
  jobs: TextOutboxJob[],
  currentUserId: string,
  { online = true, now }: { online?: boolean; now?: number } = {},
): OptimisticTextMessage[] {
  // Matched against every server row, expired or not: a delivered message must never come back
  // as an outbox bubble just because its server copy expired.
  const serverClientIds = new Set(serverMessages.map((server) => server.client_message_id));
  // DB-2: an expired message disappears on time locally instead of waiting for the cleanup cron
  // and a realtime DELETE. Outbox rows keep their own TTL / tombstone handling (OFF-4).
  const visibleServerMessages =
    now === undefined ? serverMessages : serverMessages.filter((server) => !isTextMessageExpired(server, now));
  const outboxMessages: OptimisticTextMessage[] = [];
  for (const job of jobs) {
    if (serverClientIds.has(job.id)) continue;
    const outboxStatus = chatOutboxStatus(job, online);
    outboxMessages.push({
      id: `temp-${job.id}`,
      sender_id: currentUserId,
      receiver_id: job.receiverId,
      body: job.body,
      created_at: new Date(job.createdAt).toISOString(),
      expires_at: new Date(job.expiresAt).toISOString(),
      client_message_id: job.id,
      is_system: false,
      metadata: null,
      reply_to_nix_id: job.replyToNixId,
      isSending: outboxStatus === 'sending',
      sendFailed: outboxStatus === 'failed',
      outboxStatus,
      outboxId: job.id,
    });
  }
  return sortMessagesAscending([...visibleServerMessages, ...outboxMessages]);
}
