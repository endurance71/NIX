import type { ChatCapabilities } from './chatCapabilities';
import type { ChatTimelineItem } from './chatTimeline';
import type { TextMessage } from '../types/database.types';

/** Server windows of 20261014100000 (the RPCs enforce them; the client only hides the actions). */
export const TEXT_MESSAGE_EDIT_WINDOW_MS = 15 * 60_000;
export const TEXT_MESSAGE_MAX_EDITS = 5;
export const TEXT_MESSAGE_UNSEND_WINDOW_MS = 5 * 60_000;

type ActionMessage = {
  id: string;
  sender_id: string;
  created_at: string;
  body: string;
  is_system?: boolean | null;
  kind?: string | null;
  edit_count?: number | null;
  /** Set while the message is still only in the local outbox. */
  outboxStatus?: string | null;
};

/** What the long-press menu (and the VoiceOver rotor) offers for one message. */
export type ChatMessageActions = {
  reply: boolean;
  edit: boolean;
  unsend: boolean;
  forward: boolean;
};

export const NO_CHAT_MESSAGE_ACTIONS: ChatMessageActions = {
  reply: false,
  edit: false,
  unsend: false,
  forward: false,
};

function isOnServer(message: ActionMessage): boolean {
  return !message.outboxStatus && !message.id.startsWith('temp-');
}

/**
 * iMessage rules, enforced again by the server: edit own texts for 15 minutes (5 times), unsend
 * own messages for 5 minutes. Reply quotes a delivered message (works offline: the outbox sends
 * it later); forward copies the text to other friends.
 */
export function chatMessageActions(
  message: ActionMessage,
  params: {
    currentUserId: string;
    now: number;
    online: boolean;
    capabilities: Pick<ChatCapabilities, 'messageReplies' | 'messageEdits'>;
  },
): ChatMessageActions {
  if (message.is_system) return NO_CHAT_MESSAGE_ACTIONS;
  const onServer = isOnServer(message);
  const isOwn = message.sender_id === params.currentUserId;
  const isText = (message.kind ?? 'text') === 'text';
  const age = params.now - Date.parse(message.created_at);
  const ownLive = isOwn && onServer && params.online && params.capabilities.messageEdits && Number.isFinite(age);
  return {
    reply: onServer && params.capabilities.messageReplies,
    edit:
      ownLive
      && isText
      && age < TEXT_MESSAGE_EDIT_WINDOW_MS
      && (message.edit_count ?? 0) < TEXT_MESSAGE_MAX_EDITS,
    unsend: ownLive && age < TEXT_MESSAGE_UNSEND_WINDOW_MS,
    forward: isText && message.outboxStatus !== 'expired' && message.body.trim().length > 0,
  };
}

/** Quoted header of a reply: who wrote the quoted message and what to show of it. */
export type ChatMessageReplyContext = {
  messageId: string;
  author: 'me' | 'peer';
  kind: 'text' | 'voice';
  /** First line(s) of a quoted text; empty for a voice message. */
  snippet: string;
};

export function chatMessageReplyContext(
  message: {
    reply_to_message_id?: string | null;
    reply_to_message_sender_id?: string | null;
    reply_to_message_kind?: string | null;
    reply_to_message_body?: string | null;
  },
  currentUserId: string,
): ChatMessageReplyContext | null {
  const messageId = message.reply_to_message_id;
  // The server leaves the preview empty once the quoted message expired.
  if (!messageId || !message.reply_to_message_sender_id) return null;
  const kind = message.reply_to_message_kind === 'voice' ? 'voice' : 'text';
  return {
    messageId,
    author: message.reply_to_message_sender_id === currentUserId ? 'me' : 'peer',
    kind,
    snippet: kind === 'text' ? (message.reply_to_message_body ?? '').replace(/\s+/g, ' ').trim() : '',
  };
}

/** Index of a text / voice message's cell in the timeline, or -1. */
export function chatTimelineMessageIndex<T extends TextMessage>(
  timeline: readonly ChatTimelineItem<T>[],
  messageId: string,
): number {
  return timeline.findIndex((item) => item.type === 'text' && item.message.id === messageId);
}
