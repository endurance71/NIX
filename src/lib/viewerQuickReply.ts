import type { QueryClient } from '@tanstack/react-query';
import { enqueueTextOutbox, flushTextOutbox } from '../services/textOutboxService';
import { TEXT_MESSAGE_MAX_LENGTH } from '../services/textMessageService';
import { queryKeys } from './queryKeys';
import { normalizeViewerReplyBody } from './viewerPresentation';

function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Quick text reply (viewer, notification "Reply" action): the same durable text outbox as the
 * chat composer. Only the local
 * enqueue is awaited; delivery (and moderation) continues in the background like in the chat,
 * and `TextOutboxSync` retries anything that fails.
 */
export async function sendQuickTextReply(params: {
  ownerId: string;
  peerId: string;
  body: string;
  online: boolean;
  queryClient: QueryClient;
}): Promise<boolean> {
  const body = normalizeViewerReplyBody(params.body, TEXT_MESSAGE_MAX_LENGTH);
  if (!body) return false;
  const { ownerId, peerId, online, queryClient } = params;
  await enqueueTextOutbox(ownerId, peerId, body, createClientMessageId());
  await queryClient.invalidateQueries({ queryKey: ['textOutbox'] });
  if (online) {
    void flushTextOutbox(ownerId)
      .then(async (sentIds) => {
        await queryClient.invalidateQueries({ queryKey: ['textOutbox'] });
        if (sentIds.length === 0) return;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.textMessagesWithPeer(peerId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.inboxActivityBundle }),
          queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
        ]);
      })
      // Per-message failures stay on the outbox row and show on its chat bubble.
      .catch(() => undefined);
  }
  return true;
}
