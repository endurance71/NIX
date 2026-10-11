import { supabase } from '../lib/supabase';
import { createRpcFallbackGate } from '../lib/rpcFallbackGate';
import {
  EMPTY_NIX_REACTIONS,
  UNAVAILABLE_NIX_REACTIONS,
  indexNixReactions,
  mapNixReactionRow,
  normalizeNixReactionIds,
  type NixReaction,
  type NixReactionsSnapshot,
} from '../lib/nixReactions';
import type { MessageReactionEmoji } from '../types/database.types';
import { DomainError } from './errors';
import { isMissingRpcError } from './nixService';

/**
 * NiX reactions backend (migration 20261012110000_nix_reactions). Production may not have it
 * yet: a missing RPC is remembered for a while (`createRpcFallbackGate`) and reported as
 * "unavailable", never thrown, so callers hide the feature instead of showing an error.
 */
const reactionsGate = createRpcFallbackGate();

export const NIX_REACTION_UNAVAILABLE = 'unavailable' as const;
export type NixReactionUnavailable = typeof NIX_REACTION_UNAVAILABLE;

/** False while the backend is known not to have the reaction RPCs. */
export function nixReactionsMaybeAvailable(): boolean {
  return reactionsGate.shouldTryRpc();
}

function missing(error: unknown, rpc: string): boolean {
  if (!isMissingRpcError(error, rpc)) return false;
  reactionsGate.markUnavailable();
  return true;
}

function reactionError(error: { code?: string; message?: string }, fallback: string): DomainError {
  // P0002: the NiX is gone, blocked, restricted or not addressed to the caller.
  if (error.code === 'P0002') return new DomainError('NOT_FOUND', error.message || fallback);
  if (error.code === '28000') return new DomainError('UNAUTHORIZED', error.message || fallback);
  return new DomainError('UNKNOWN', error.message || fallback);
}

export async function fetchNixReactions(nixIds: readonly string[]): Promise<NixReactionsSnapshot> {
  const ids = normalizeNixReactionIds(nixIds);
  if (!reactionsGate.shouldTryRpc()) return UNAVAILABLE_NIX_REACTIONS;
  if (ids.length === 0) return EMPTY_NIX_REACTIONS;
  const { data, error } = await supabase.rpc('get_nix_reactions', { p_nix_ids: ids });
  if (error) {
    if (missing(error, 'get_nix_reactions')) return UNAVAILABLE_NIX_REACTIONS;
    throw reactionError(error, 'Błąd pobierania reakcji.');
  }
  return { available: true, byNixId: indexNixReactions(Array.isArray(data) ? data : []) };
}

export async function setNixReaction(
  nixId: string,
  emoji: MessageReactionEmoji,
): Promise<NixReaction | NixReactionUnavailable> {
  const { data, error } = await supabase.rpc('set_nix_reaction', {
    p_nix_id: nixId,
    p_emoji: emoji,
  });
  if (error) {
    if (missing(error, 'set_nix_reaction')) return NIX_REACTION_UNAVAILABLE;
    throw reactionError(error, 'Nie udało się dodać reakcji.');
  }
  const reaction = mapNixReactionRow(data);
  if (!reaction) throw new DomainError('UNKNOWN', 'Nie udało się dodać reakcji.');
  return reaction;
}

export async function removeNixReaction(nixId: string): Promise<boolean | NixReactionUnavailable> {
  const { data, error } = await supabase.rpc('remove_nix_reaction', { p_nix_id: nixId });
  if (error) {
    if (missing(error, 'remove_nix_reaction')) return NIX_REACTION_UNAVAILABLE;
    throw reactionError(error, 'Nie udało się usunąć reakcji.');
  }
  return Boolean(data);
}
