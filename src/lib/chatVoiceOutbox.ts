import type { ChatTextMessage } from './chatMessageExtras';
import { sortMessagesAscending } from './chatTimeline';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A voice message recorded in this session that is not on the server yet. In memory only: the
 * recording is a cache file, so an app restart drops unsent takes (unlike the text outbox).
 */
export type PendingVoiceMessage = {
  clientId: string;
  receiverId: string;
  localUri: string;
  durationMs: number;
  waveform: readonly number[];
  createdAt: number;
  status: 'sending' | 'failed';
  /** Set once the upload succeeded, so a retry only repeats the RPC. */
  uploadedPath: string | null;
};

export const VOICE_OUTBOX_PREFIX = 'voice:';

export function voiceOutboxId(clientId: string): string {
  return `${VOICE_OUTBOX_PREFIX}${clientId}`;
}

export function voiceClientIdFromOutboxId(outboxId: string): string | null {
  return outboxId.startsWith(VOICE_OUTBOX_PREFIX) ? outboxId.slice(VOICE_OUTBOX_PREFIX.length) : null;
}

export type PendingVoiceBubble = ChatTextMessage & {
  isSending?: boolean;
  sendFailed?: boolean;
  outboxStatus?: 'sending' | 'failed';
  outboxId?: string;
  localVoiceUri?: string;
};

/** Pending takes not yet matched by a server row (`client_message_id`). */
export function unsentPendingVoice(
  pending: readonly PendingVoiceMessage[],
  serverMessages: readonly { client_message_id: string | null }[],
): PendingVoiceMessage[] {
  const delivered = new Set(serverMessages.map((message) => message.client_message_id));
  return pending.filter((entry) => !delivered.has(entry.clientId));
}

export function pendingVoiceBubble(entry: PendingVoiceMessage, currentUserId: string): PendingVoiceBubble {
  return {
    id: `temp-voice-${entry.clientId}`,
    sender_id: currentUserId,
    receiver_id: entry.receiverId,
    body: '',
    created_at: new Date(entry.createdAt).toISOString(),
    expires_at: new Date(entry.createdAt + DAY_MS).toISOString(),
    client_message_id: entry.clientId,
    is_system: false,
    metadata: null,
    kind: 'voice',
    voice_path: null,
    voice_duration_ms: entry.durationMs,
    voice_waveform: entry.waveform,
    isSending: entry.status === 'sending',
    sendFailed: entry.status === 'failed',
    outboxStatus: entry.status,
    outboxId: voiceOutboxId(entry.clientId),
    localVoiceUri: entry.localUri,
  };
}

/** Adds the unsent voice bubbles of this conversation to the (ascending) message list. */
export function mergePendingVoiceMessages<T extends { created_at: string; client_message_id: string | null }>(
  messages: readonly T[],
  pending: readonly PendingVoiceMessage[],
  currentUserId: string,
  peerId: string,
): (T | PendingVoiceBubble)[] {
  const ours = unsentPendingVoice(
    pending.filter((entry) => entry.receiverId === peerId),
    messages,
  );
  if (ours.length === 0) return messages as T[];
  return sortMessagesAscending<T | PendingVoiceBubble>([
    ...messages,
    ...ours.map((entry) => pendingVoiceBubble(entry, currentUserId)),
  ]);
}
