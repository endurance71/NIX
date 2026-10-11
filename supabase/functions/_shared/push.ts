export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export type PushEventType =
  | 'new_nix'
  | 'friend_request'
  | 'friend_accepted'
  | 'new_text_message'
  | 'message_reaction'
  | 'capture_attempt';

export type MessageReactionEmojiToken =
  | 'heart'
  | 'thumbsup'
  | 'thumbsdown'
  | 'hahaha'
  | 'exclamation'
  | 'question';

const MESSAGE_REACTION_GLYPHS: Record<MessageReactionEmojiToken, string> = {
  heart: '❤️',
  thumbsup: '👍',
  thumbsdown: '👎',
  hahaha: '😂',
  exclamation: '‼️',
  question: '❓',
};

export type PushJob = {
  id: string;
  event_type: PushEventType;
  event_key: string;
  recipient_id: string;
  actor_id: string;
  entity_id: string;
  attempts: number;
  created_at: string;
};

export type PushDevice = {
  id: string;
  expo_push_token: string;
  locale: 'pl' | 'en';
};

/** Display name if set; otherwise `@username` (inbox-style). */
export function formatPushActorLabel(
  displayName: string | null | undefined,
  username: string | null | undefined
): string {
  const trimmedDisplay = typeof displayName === 'string' ? displayName.trim() : '';
  if (trimmedDisplay) return trimmedDisplay;
  const handle = (typeof username === 'string' ? username : '').replace(/^@/, '').trim();
  return `@${handle || 'nix_user'}`;
}

export function reactionGlyph(emoji: string | null | undefined): string {
  if (emoji && emoji in MESSAGE_REACTION_GLYPHS) {
    return MESSAGE_REACTION_GLYPHS[emoji as MessageReactionEmojiToken];
  }
  return '💬';
}

/**
 * Title = who (actor label), body = what, in gender-neutral wording (no
 * „zareagował(a)”): Polish uses impersonal/3rd-person present forms that do
 * not inflect for gender.
 */
export function pushCopy(
  type: PushEventType,
  actorLabel: string,
  locale: 'pl' | 'en',
  emoji?: string | null
) {
  const title = actorLabel.trim() || '@nix_user';
  if (locale === 'pl') {
    if (type === 'new_nix') return { title, body: 'Wysyła Ci nowy NiX' };
    if (type === 'new_text_message') return { title, body: 'Wysyła Ci wiadomość' };
    if (type === 'message_reaction') {
      return { title, body: `Reakcja na Twoją wiadomość: ${reactionGlyph(emoji)}` };
    }
    if (type === 'capture_attempt') return { title, body: 'Próba zrobienia zrzutu lub nagrania ekranu' };
    if (type === 'friend_request') return { title, body: 'Chce dodać Cię do znajomych' };
    return { title, body: 'Jesteście teraz znajomymi' };
  }
  if (type === 'new_nix') return { title, body: 'Sent you a new NiX' };
  if (type === 'new_text_message') return { title, body: 'Sent you a message' };
  if (type === 'message_reaction') {
    return { title, body: `Reacted to your message: ${reactionGlyph(emoji)}` };
  }
  if (type === 'capture_attempt') return { title, body: 'Tried to screenshot or record the screen' };
  if (type === 'friend_request') return { title, body: 'Wants to add you as a friend' };
  return { title, body: 'You are now friends' };
}

/**
 * Conversation events go stale quickly. Their push lifetime is counted from the
 * event (job.created_at), not from the send attempt, so a job retried for up to
 * an hour cannot surface an old message later. Friend events and capture alerts
 * keep the provider default.
 */
export const PUSH_EVENT_TTL_SECONDS: Partial<Record<PushEventType, number>> = {
  new_nix: 3600,
  new_text_message: 3600,
  message_reaction: 3600,
};

/**
 * Expo `ttl` for this job: `undefined` when the type has no limit, otherwise the
 * remaining seconds of the event lifetime. `0` means the event already expired
 * and must not be sent (Expo treats ttl 0 as "now or never", not as "expired").
 */
export function pushTtlSeconds(
  type: PushEventType,
  createdAt: string | null | undefined,
  now = Date.now()
): number | undefined {
  const lifetime = PUSH_EVENT_TTL_SECONDS[type];
  if (lifetime === undefined) return undefined;
  const created = createdAt ? new Date(createdAt).getTime() : Number.NaN;
  if (!Number.isFinite(created)) return lifetime;
  const ageSeconds = Math.max(0, Math.floor((now - created) / 1000));
  return Math.max(0, lifetime - ageSeconds);
}

export function retryAt(attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

export type PushPreferenceSnapshot = {
  messages_enabled?: boolean | null;
  reactions_enabled?: boolean | null;
  friends_enabled?: boolean | null;
} | null;

export function isPushCategoryEnabled(
  type: PushEventType,
  preferences: PushPreferenceSnapshot
) {
  if (type === 'capture_attempt') return true;
  if (type === 'new_nix' || type === 'new_text_message') {
    return preferences?.messages_enabled !== false;
  }
  if (type === 'message_reaction') return preferences?.reactions_enabled !== false;
  return preferences?.friends_enabled !== false;
}

export function isConversationMuteActive(
  mute: { muted_until?: string | null } | null,
  now = Date.now()
) {
  return Boolean(
    mute &&
    (!mute.muted_until || new Date(mute.muted_until).getTime() > now)
  );
}

export function cappedPushBadge(count: unknown) {
  return Math.max(0, Math.min(99, Number(count) || 0));
}

export function expoHeaders(accessToken: string) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}
