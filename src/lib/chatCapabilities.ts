/** Optional chat features a backend may not have yet (production without the migrations). */
export type ChatCapabilities = {
  savedMessages: boolean;
  voiceMessages: boolean;
  /** Swipe / menu „Odpowiedz” quoting a message (20261014100000). */
  messageReplies: boolean;
  /** Edit and unsend own messages (20261014100000). */
  messageEdits: boolean;
};

export const NO_CHAT_CAPABILITIES: ChatCapabilities = {
  savedMessages: false,
  voiceMessages: false,
  messageReplies: false,
  messageEdits: false,
};

/** Reads the `get_chat_capabilities` answer; anything unexpected means „not supported”. */
export function parseChatCapabilities(data: unknown): ChatCapabilities {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return NO_CHAT_CAPABILITIES;
  const value = data as Record<string, unknown>;
  return {
    savedMessages: value.saved_messages === true,
    voiceMessages: value.voice_messages === true,
    messageReplies: value.message_replies === true,
    messageEdits: value.message_edits === true,
  };
}

/**
 * A failed save/voice call that proves the backend lacks the feature (missing RPC, column or
 * bucket) — the client hides the feature instead of showing an error.
 */
export function isMissingChatFeatureError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; postgrestCode?: unknown; message?: unknown };
  const code =
    typeof candidate.postgrestCode === 'string'
      ? candidate.postgrestCode
      : typeof candidate.code === 'string'
        ? candidate.code
        : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return (
    code === 'PGRST202'
    || code === '42883'
    || code === '42703'
    || /could not find the function|bucket not found/i.test(message)
  );
}
