/**
 * „Pisze…” over Supabase Realtime Broadcast (no database writes). One private topic per friend
 * pair, authorized by RLS on `realtime.messages` (migration `chat_typing_broadcast`).
 */

export const CHAT_TYPING_EVENT = 'typing';
/**
 * Sent by the database (`set_text_message_saved`, 20261012100000) on the same pair topic when
 * either participant saves or unsaves a message; the open chat refetches its messages.
 */
export const CHAT_MESSAGE_SAVED_EVENT = 'message_saved';
/** At most one „typing” broadcast per this window while the user keeps typing. */
export const TYPING_SEND_THROTTLE_MS = 2_000;
/** „Stopped typing” after this long without a keystroke. */
export const TYPING_IDLE_STOP_MS = 4_000;
/** The receiver hides „pisze…” on its own if the „stopped” broadcast was lost. */
export const PEER_TYPING_TIMEOUT_MS = 6_000;

/**
 * The pair topic: `typing:<lower uuid>:<higher uuid>`, both lowercase, so both participants derive
 * the same name and the RLS policy can accept exactly one canonical topic per pair.
 */
export function chatTypingTopic(userA: string, userB: string): string | null {
  const a = userA.trim().toLowerCase();
  const b = userB.trim().toLowerCase();
  if (!a || !b || a === b) return null;
  return a < b ? `typing:${a}:${b}` : `typing:${b}:${a}`;
}

export type ChatTypingPayload = { v: 1; user_id: string; typing: boolean };

export function buildTypingPayload(userId: string, typing: boolean): ChatTypingPayload {
  return { v: 1, user_id: userId, typing };
}

/** Accepts only well-formed broadcasts sent by the peer (never our own other device). */
export function parsePeerTypingPayload(payload: unknown, peerId: string): boolean | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<ChatTypingPayload>;
  if (candidate.v !== 1 || typeof candidate.typing !== 'boolean') return null;
  if (typeof candidate.user_id !== 'string' || candidate.user_id.toLowerCase() !== peerId.toLowerCase()) {
    return null;
  }
  return candidate.typing;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export type TypingSenderOptions = {
  send: (typing: boolean) => void;
  now?: () => number;
  throttleMs?: number;
  idleMs?: number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
};

export type TypingSender = {
  /** Every composer change. Empty text means the user stopped. */
  input: (text: string) => void;
  /** Message sent, input blurred or screen left: „stopped typing” if the peer was told otherwise. */
  stop: () => void;
  /** Drops pending timers without sending anything (channel already gone). */
  dispose: () => void;
};

/**
 * Throttled typing state machine. `true` goes out at most once per `throttleMs` (a burst of
 * keystrokes after a pause waits for the window instead of being dropped); `false` goes out only
 * if the peer was last told `true`.
 */
export function createTypingSender({
  send,
  now = Date.now,
  throttleMs = TYPING_SEND_THROTTLE_MS,
  idleMs = TYPING_IDLE_STOP_MS,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle),
}: TypingSenderOptions): TypingSender {
  let typing = false;
  let peerToldTyping = false;
  let lastTypingSentAt = Number.NEGATIVE_INFINITY;
  let idleTimer: TimerHandle | null = null;
  let pendingTimer: TimerHandle | null = null;

  const clearIdle = () => {
    if (idleTimer !== null) cancel(idleTimer);
    idleTimer = null;
  };
  const clearPending = () => {
    if (pendingTimer !== null) cancel(pendingTimer);
    pendingTimer = null;
  };
  const sendTyping = () => {
    lastTypingSentAt = now();
    peerToldTyping = true;
    send(true);
  };

  const stop = () => {
    clearIdle();
    clearPending();
    typing = false;
    if (peerToldTyping) {
      peerToldTyping = false;
      send(false);
    }
  };

  const input = (text: string) => {
    if (!text.trim()) {
      stop();
      return;
    }
    typing = true;
    clearIdle();
    idleTimer = schedule(stop, idleMs);

    const elapsed = now() - lastTypingSentAt;
    if (elapsed >= throttleMs) {
      clearPending();
      sendTyping();
      return;
    }
    // Inside the window: the peer already shows „pisze…” unless we told them we stopped.
    if (!peerToldTyping && pendingTimer === null) {
      pendingTimer = schedule(() => {
        pendingTimer = null;
        if (typing) sendTyping();
      }, throttleMs - elapsed);
    }
  };

  const dispose = () => {
    clearIdle();
    clearPending();
    typing = false;
    peerToldTyping = false;
  };

  return { input, stop, dispose };
}
