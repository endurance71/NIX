import { MESSAGE_REACTION_EMOJIS, type MessageReactionEmoji } from '../types/database.types';

/**
 * NiX reactions (migration 20261012110000_nix_reactions): the receiver reacts to a NiX with the
 * chat tapback set; both participants read it. Pure helpers shared by the service, the React
 * Query hook and the viewer.
 */
export type NixReaction = {
  nixId: string;
  userId: string;
  emoji: MessageReactionEmoji;
  updatedAt: string;
};

/**
 * `available: false` when the backend has no `get_nix_reactions` yet (production before the
 * migration): every reaction UI hides itself and the viewer falls back to a text reply.
 */
export type NixReactionsSnapshot = {
  available: boolean;
  byNixId: Readonly<Record<string, NixReaction>>;
};

/** Mirrors the `p_nix_ids[1:200]` clamp in `get_nix_reactions`. */
export const NIX_REACTIONS_MAX_IDS = 200;

/** Private `user:<uuid>` broadcast sent by the `nix_reactions` triggers. */
export const NIX_REACTION_BROADCAST_EVENT = 'nix_reaction_changed';

export const EMPTY_NIX_REACTIONS: NixReactionsSnapshot = { available: true, byNixId: {} };
export const UNAVAILABLE_NIX_REACTIONS: NixReactionsSnapshot = { available: false, byNixId: {} };

export function isNixReactionEmoji(value: unknown): value is MessageReactionEmoji {
  return typeof value === 'string' && (MESSAGE_REACTION_EMOJIS as readonly string[]).includes(value);
}

/** Stable, deduplicated id list for a query key and the RPC (order-independent cache hits). */
export function normalizeNixReactionIds(ids: readonly (string | null | undefined)[]): string[] {
  const unique = new Set<string>();
  for (const id of ids) {
    if (id) unique.add(id);
  }
  return Array.from(unique).sort().slice(0, NIX_REACTIONS_MAX_IDS);
}

type NixReactionRow = {
  nix_id?: unknown;
  user_id?: unknown;
  emoji?: unknown;
  updated_at?: unknown;
};

/** Maps one RPC row; rows with an emoji this client does not know are skipped (forward compat). */
export function mapNixReactionRow(row: unknown): NixReaction | null {
  if (!row || typeof row !== 'object') return null;
  const { nix_id, user_id, emoji, updated_at } = row as NixReactionRow;
  if (typeof nix_id !== 'string' || typeof user_id !== 'string' || !isNixReactionEmoji(emoji)) {
    return null;
  }
  return {
    nixId: nix_id,
    userId: user_id,
    emoji,
    updatedAt: typeof updated_at === 'string' ? updated_at : '',
  };
}

/** One reaction per NiX (only the receiver reacts); the newest wins if the data ever has more. */
export function indexNixReactions(rows: readonly unknown[]): Record<string, NixReaction> {
  const byNixId: Record<string, NixReaction> = {};
  for (const raw of rows) {
    const reaction = mapNixReactionRow(raw);
    if (!reaction) continue;
    const existing = byNixId[reaction.nixId];
    if (!existing || existing.updatedAt <= reaction.updatedAt) byNixId[reaction.nixId] = reaction;
  }
  return byNixId;
}

export type NixReactionChange =
  | { kind: 'set'; emoji: MessageReactionEmoji; result: 'added' | 'updated' }
  | { kind: 'remove'; result: 'removed' };

/** Tapback toggle: the same emoji again removes it, another one replaces it. */
export function nextNixReactionChange(
  current: MessageReactionEmoji | null,
  tapped: MessageReactionEmoji,
): NixReactionChange {
  if (current === tapped) return { kind: 'remove', result: 'removed' };
  return { kind: 'set', emoji: tapped, result: current ? 'updated' : 'added' };
}

/** Optimistic cache update for one NiX; other entries keep their identity. */
export function applyNixReactionChange(
  snapshot: NixReactionsSnapshot,
  params: { nixId: string; userId: string; emoji: MessageReactionEmoji | null; now: string },
): NixReactionsSnapshot {
  const { nixId, userId, emoji, now } = params;
  const byNixId = { ...snapshot.byNixId };
  if (emoji) byNixId[nixId] = { nixId, userId, emoji, updatedAt: now };
  else delete byNixId[nixId];
  return { ...snapshot, byNixId };
}

/** Whether a cached `['nixReactions', ids]` entry covers this NiX. */
export function nixReactionsKeyCovers(queryKey: readonly unknown[], nixId: string): boolean {
  const ids = queryKey[1];
  return Array.isArray(ids) && ids.includes(nixId);
}

/** Ids carried by a `nix_reaction_changed` broadcast payload (empty when malformed/truncated). */
export function nixIdsFromReactionBroadcast(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const ids = (payload as { nix_ids?: unknown }).nix_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}
