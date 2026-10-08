import type { TextMessage } from '../types/database.types';
import type { TextOutboxJob } from '../services/textOutboxService';
import type { OptimisticTextMessage } from '../hooks/useChatScreen';
import { sortMessagesAscending } from './chatTimeline';

export function mergeChatOutboxMessages(
  serverMessages: TextMessage[],
  jobs: TextOutboxJob[],
  currentUserId: string,
): OptimisticTextMessage[] {
  const outboxMessages: OptimisticTextMessage[] = jobs.map((job) => ({
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
    ...serverMessages,
    ...outboxMessages.filter(
      (local) =>
        !serverMessages.some((server) => server.client_message_id === local.client_message_id),
    ),
  ]);
  return messages;
}
