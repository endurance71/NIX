import { normalizeInboxSearch } from './inboxSearch';

export type RecipientProfile = {
  id: string;
  username: string;
  display_name?: string | null;
};

export type RecentRecipientActivity = { peerId: string; at: string };

/** Display name, else `@username`, else the given fallback. */
export function recipientDisplayName(profile: RecipientProfile, fallback: string): string {
  const displayName = profile.display_name?.trim();
  if (displayName) return displayName;
  return profile.username ? `@${profile.username}` : fallback;
}

/**
 * Same matching as the inbox search: diacritics-insensitive, a leading `@` is ignored, matches
 * the display name or the username. Returns the same array when the query is empty.
 */
export function filterRecipients<T extends RecipientProfile>(
  profiles: readonly T[],
  query: string,
): readonly T[] {
  const normalized = normalizeInboxSearch(query);
  if (!normalized) return profiles;
  return profiles.filter(
    (profile) =>
      normalizeInboxSearch(profile.username).includes(normalized) ||
      normalizeInboxSearch(profile.display_name ?? '').includes(normalized),
  );
}

type InboxBundleLike = {
  inboxData?: readonly { sender_id: string; created_at: string }[];
  sentData?: readonly { receiver_id: string; created_at: string }[];
  textMessagesData?: readonly { peer_id: string; created_at: string }[];
};

/** Every conversation touch (received, sent, text) from the cached inbox bundle. */
export function collectInboxRecentActivity(
  bundle: InboxBundleLike | null | undefined,
): RecentRecipientActivity[] {
  if (!bundle) return [];
  return [
    ...(bundle.sentData ?? []).map((row) => ({ peerId: row.receiver_id, at: row.created_at })),
    ...(bundle.inboxData ?? []).map((row) => ({ peerId: row.sender_id, at: row.created_at })),
    ...(bundle.textMessagesData ?? []).map((row) => ({ peerId: row.peer_id, at: row.created_at })),
  ];
}

/** Most recent conversation partners first, de-duplicated, accepted friends only. */
export function recentRecipientIds(
  activity: readonly RecentRecipientActivity[],
  acceptedIds: readonly string[],
  limit = 5,
): string[] {
  if (limit <= 0) return [];
  const accepted = new Set(acceptedIds);
  const latestByPeer = new Map<string, number>();
  for (const { peerId, at } of activity) {
    if (!peerId || !accepted.has(peerId)) continue;
    const time = Date.parse(at);
    if (!Number.isFinite(time)) continue;
    const previous = latestByPeer.get(peerId);
    if (previous === undefined || time > previous) latestByPeer.set(peerId, time);
  }
  return [...latestByPeer.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([peerId]) => peerId);
}

/**
 * „Best friends” (top exchanges, from the streak RPC) on top, then „Recent”, then everyone else
 * (keeping the server order). Each person appears once: a best friend is not repeated under
 * „Recent”. While searching there is one flat filtered list, so a match never shows up twice.
 */
export function buildRecipientSections<T extends RecipientProfile>({
  profiles,
  bestFriendIds = [],
  recentIds,
  query,
}: {
  profiles: readonly T[];
  bestFriendIds?: readonly string[];
  recentIds: readonly string[];
  query: string;
}): { best: T[]; recent: T[]; others: T[] } {
  if (normalizeInboxSearch(query)) {
    return { best: [], recent: [], others: [...filterRecipients(profiles, query)] };
  }
  const byId = new Map(profiles.map((profile) => [profile.id, profile] as const));
  const placed = new Set<string>();
  const pick = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const profile = byId.get(id);
      if (!profile || placed.has(id)) return [];
      placed.add(id);
      return [profile];
    });
  const best = pick(bestFriendIds);
  const recent = pick(recentIds);
  return { best, recent, others: profiles.filter((profile) => !placed.has(profile.id)) };
}

/** „Anna, Bartek” + how many more were selected beyond the named ones. */
export function summarizeRecipientNames(
  names: readonly string[],
  maxNames = 2,
): { names: string; extra: number } | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, Math.max(1, maxNames));
  return { names: shown.join(', '), extra: names.length - shown.length };
}
