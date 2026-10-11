import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  applyNixReactionChange,
  nextNixReactionChange,
  nixReactionsKeyCovers,
  normalizeNixReactionIds,
  type NixReaction,
  type NixReactionsSnapshot,
} from '../lib/nixReactions';
import { queryKeys } from '../lib/queryKeys';
import {
  NIX_REACTION_UNAVAILABLE,
  fetchNixReactions,
  removeNixReaction,
  setNixReaction,
} from '../services/nixReactionService';
import type { MessageReactionEmoji } from '../types/database.types';
import { useAuth } from './useAuth';

const NIX_REACTIONS_STALE_MS = 30_000;
const NO_REACTIONS: Readonly<Record<string, NixReaction>> = {};

export type UseNixReactionsResult = {
  /**
   * True only once the backend answered with the feature present. False while loading, offline
   * or when the migration is not deployed: hide reaction UI (no error states).
   */
  available: boolean;
  byNixId: Readonly<Record<string, NixReaction>>;
  /** The reaction on this NiX (there is at most one: only the receiver reacts), or null. */
  reactionFor: (nixId: string | null | undefined) => NixReaction | null;
};

/**
 * Reactions for a set of NiX ids (chat NiX chips, inbox rows, the viewer queue), batched into one
 * `get_nix_reactions` call. Pass every id currently on screen; order and duplicates do not matter.
 * Live updates: invalidate `queryKeys.nixReactionsAll` on the `nix_reaction_changed` broadcast.
 */
export function useNixReactions(
  nixIds: readonly (string | null | undefined)[],
  options: { enabled?: boolean } = {},
): UseNixReactionsResult {
  const { canUseNetworkSession } = useAuth();
  const ids = normalizeNixReactionIds(nixIds);
  const query = useQuery({
    queryKey: queryKeys.nixReactions(ids),
    queryFn: () => fetchNixReactions(ids),
    enabled: (options.enabled ?? true) && canUseNetworkSession && ids.length > 0,
    staleTime: NIX_REACTIONS_STALE_MS,
    // A new chip/row joining the list must not blank the badges already shown.
    placeholderData: keepPreviousData,
    // Reactions are decoration: a failure is retried once and then stays silent.
    retry: 1,
  });
  const byNixId = query.data?.byNixId ?? NO_REACTIONS;
  return {
    available: query.data?.available === true,
    byNixId,
    reactionFor: (nixId) => (nixId ? (byNixId[nixId] ?? null) : null),
  };
}

export type NixReactionToggleResult =
  | { status: 'added' | 'updated'; emoji: MessageReactionEmoji }
  | { status: 'removed' }
  /** Backend without the migration: the caller may fall back (the viewer sends a text reply). */
  | { status: 'unavailable' }
  | { status: 'failed'; error: unknown };

/**
 * Tapback toggle for the receiver: the same emoji again removes the reaction, another emoji
 * replaces it. Every cached `useNixReactions` list containing the NiX updates optimistically and
 * rolls back on failure.
 */
export function useToggleNixReaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return async function toggleNixReaction(
    nixId: string,
    emoji: MessageReactionEmoji,
  ): Promise<NixReactionToggleResult> {
    const covering = queryClient
      .getQueriesData<NixReactionsSnapshot>({ queryKey: queryKeys.nixReactionsAll })
      .filter(([key]) => nixReactionsKeyCovers(key, nixId));
    const current = covering.find(([, data]) => data?.byNixId[nixId])?.[1]?.byNixId[nixId] ?? null;
    const change = nextNixReactionChange(current?.emoji ?? null, emoji);

    const write = (entries: readonly (readonly [QueryKey, NixReactionsSnapshot | undefined])[]) => {
      for (const [key, data] of entries) queryClient.setQueryData(key, data);
    };
    const applyOptimistic = (next: MessageReactionEmoji | null, now: string) => {
      if (!userId) return;
      for (const [key, data] of covering) {
        if (!data) continue;
        queryClient.setQueryData(
          key,
          applyNixReactionChange(data, { nixId, userId, emoji: next, now }),
        );
      }
    };

    await queryClient.cancelQueries({ queryKey: queryKeys.nixReactionsAll });
    applyOptimistic(change.kind === 'set' ? change.emoji : null, new Date().toISOString());

    try {
      if (change.kind === 'remove') {
        const removed = await removeNixReaction(nixId);
        if (removed === NIX_REACTION_UNAVAILABLE) {
          write(covering);
          return { status: 'unavailable' };
        }
        return { status: 'removed' };
      }
      const saved = await setNixReaction(nixId, change.emoji);
      if (saved === NIX_REACTION_UNAVAILABLE) {
        write(covering);
        return { status: 'unavailable' };
      }
      applyOptimistic(saved.emoji, saved.updatedAt);
      return { status: change.result, emoji: saved.emoji };
    } catch (error) {
      write(covering);
      return { status: 'failed', error };
    }
  };
}
