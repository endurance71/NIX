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

export function pushCopy(
  type: PushEventType,
  actorLabel: string,
  locale: 'pl' | 'en',
  emoji?: string | null
) {
  const actor = actorLabel.trim() || '@nix_user';
  if (locale === 'pl') {
    if (type === 'new_nix') return { title: 'NiX', body: `${actor} wysyła Ci nowy NiX` };
    if (type === 'new_text_message') return { title: 'Wiadomość', body: `${actor} wysyła Ci wiadomość` };
    if (type === 'message_reaction') {
      return { title: 'Wiadomość', body: `${actor} zareagował(a): ${reactionGlyph(emoji)}` };
    }
    if (type === 'capture_attempt') return { title: 'NiX', body: `${actor} próbował(a) zrobić zrzut lub nagrać ekran` };
    if (type === 'friend_request') return { title: 'Nowe zaproszenie', body: `${actor} chce dodać Cię do znajomych` };
    return { title: 'Nowa znajomość', body: `Ty i ${actor} jesteście teraz znajomymi` };
  }
  if (type === 'new_nix') return { title: 'NiX', body: `${actor} sent you a new NiX` };
  if (type === 'new_text_message') return { title: 'Message', body: `${actor} sent you a message` };
  if (type === 'message_reaction') {
    return { title: 'Message', body: `${actor} reacted: ${reactionGlyph(emoji)}` };
  }
  if (type === 'capture_attempt') return { title: 'NiX', body: `${actor} tried to screenshot or record the screen` };
  if (type === 'friend_request') return { title: 'New friend request', body: `${actor} wants to add you as a friend` };
  return { title: 'New friend', body: `You and ${actor} are now friends` };
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
