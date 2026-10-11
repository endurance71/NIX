import { queryKeys } from './queryKeys';

/**
 * `reactions` and `messageRemoval` come from the private `user:<id>` broadcast topic (database
 * triggers, migration 20261011120000) instead of unfiltered `postgres_changes`. They refresh only
 * the open chat, never the six-request inbox bundle.
 */
export type SyncArea = 'inbox' | 'friends' | 'textChat' | 'reactions' | 'messageRemoval' | 'nixReactions';

/** Minimum gap between full foreground syncs (mount, SUBSCRIBED, app activation, reconnect). */
export const FOREGROUND_SYNC_MIN_INTERVAL_MS = 5_000;

/**
 * If SUBSCRIBED has not arrived by then, start degraded polling. A channel can stay silent
 * forever (e.g. an old channel stuck in `leaving`), so polling must not depend on an error status.
 */
export const REALTIME_SUBSCRIBE_WATCHDOG_MS = 10_000;

const APP_SYNC_TOPIC_PREFIX = 'app-sync-';
let appSyncTopicSequence = 0;

/**
 * `supabase.channel(topic)` returns an existing channel with the same topic, so a fast remount
 * used to get the previous channel while it was still leaving, and `subscribe()` was a no-op.
 * A per-mount topic always yields a fresh channel.
 */
export function nextAppSyncTopic(userId: string, now = Date.now()) {
  appSyncTopicSequence += 1;
  return `${APP_SYNC_TOPIC_PREFIX}${userId}-${now.toString(36)}-${appSyncTopicSequence}`;
}

/** Channels left behind by earlier mounts for this user (including the legacy fixed topic). */
export function staleAppSyncChannels<TChannel extends { topic: string }>(
  channels: readonly TChannel[],
  userId: string
): TChannel[] {
  const legacyTopic = `realtime:${APP_SYNC_TOPIC_PREFIX}${userId}`;
  return channels.filter(
    (channel) => channel.topic === legacyTopic || channel.topic.startsWith(`${legacyTopic}-`)
  );
}

const USER_BROADCAST_TOPIC_PREFIX = 'user:';

/**
 * Private per-user topic fed by database triggers. The name must match the `realtime.messages`
 * RLS policy (`'user:' || auth.uid()`), so unlike the app-sync channel it cannot be made unique
 * per mount; stale channels are removed before a new one is created instead.
 */
export function userBroadcastTopic(userId: string) {
  return `${USER_BROADCAST_TOPIC_PREFIX}${userId}`;
}

/** Any private user-topic channel still registered (earlier mount or a previous account). */
export function staleUserBroadcastChannels<TChannel extends { topic: string }>(
  channels: readonly TChannel[]
): TChannel[] {
  const prefix = `realtime:${USER_BROADCAST_TOPIC_PREFIX}`;
  return channels.filter((channel) => channel.topic.startsWith(prefix));
}

/** Broadcast event names sent by the database triggers. */
export const USER_BROADCAST_EVENTS = {
  reactionChanged: 'reaction_changed',
  messagesRemoved: 'messages_removed',
  /** Reactions on NiXes (20261012110000_nix_reactions). */
  nixReactionChanged: 'nix_reaction_changed',
} as const;

export type UserBroadcastEvent = (typeof USER_BROADCAST_EVENTS)[keyof typeof USER_BROADCAST_EVENTS];

export function syncAreaForUserBroadcast(event: string): SyncArea | null {
  if (event === USER_BROADCAST_EVENTS.reactionChanged) return 'reactions';
  if (event === USER_BROADCAST_EVENTS.messagesRemoved) return 'messageRemoval';
  if (event === USER_BROADCAST_EVENTS.nixReactionChanged) return 'nixReactions';
  return null;
}

/**
 * After this many CHANNEL_ERRORs without a SUBSCRIBED in between, the private channel is left
 * instead of letting realtime-js rejoin every ~10 s forever (e.g. the backend migration is not
 * deployed yet, so the join is rejected). It is tried again on reconnect or return from the
 * background; foreground sync still refreshes chats in the meantime.
 */
export const USER_BROADCAST_MAX_CONSECUTIVE_ERRORS = 3;

type RealtimeChannelTeardown = {
  teardown: () => void;
};

export async function finalizeRealtimeChannelUnsubscribe(
  channel: RealtimeChannelTeardown,
  unsubscribeResult: Promise<string>
) {
  if ((await unsubscribeResult) === 'ok') channel.teardown();
}

export function createSyncAreaDebouncer(
  onFlush: (areas: ReadonlySet<SyncArea>) => void,
  delayMs: number
) {
  const pendingAreas = new Set<SyncArea>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const areas = new Set(pendingAreas);
    pendingAreas.clear();
    if (areas.size > 0) onFlush(areas);
  };

  return {
    schedule(area: SyncArea) {
      pendingAreas.add(area);
      if (!timer) timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingAreas.clear();
    },
  };
}

const CHAT_TEXT_KEY = ['textMessagesWithPeer'] as const;
const CHAT_REACTIONS_KEY = ['messageReactionsWithPeer'] as const;
const CHAT_NIXES_KEY = ['chatNixesWithPeer'] as const;

export function realtimeQueryKeysForArea(area: SyncArea): readonly (readonly unknown[])[] {
  if (area === 'reactions') return [CHAT_REACTIONS_KEY];
  if (area === 'messageRemoval') return [CHAT_TEXT_KEY, CHAT_REACTIONS_KEY];
  if (area === 'nixReactions') return [queryKeys.nixReactionsAll];
  if (area === 'inbox' || area === 'textChat') {
    return [
      queryKeys.inboxNixesBundle,
      queryKeys.inboxActivityBundle,
      CHAT_TEXT_KEY,
      CHAT_REACTIONS_KEY,
      CHAT_NIXES_KEY,
      queryKeys.nixReactionsAll,
    ];
  }
  return [
    queryKeys.incomingFriendRequests,
    queryKeys.outgoingFriendRequests,
    queryKeys.acceptedFriends,
    queryKeys.currentUserProfiles,
  ];
}
