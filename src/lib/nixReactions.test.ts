import { describe, expect, it } from 'vitest';
import {
  NIX_REACTIONS_MAX_IDS,
  applyNixReactionChange,
  indexNixReactions,
  mapNixReactionRow,
  nextNixReactionChange,
  nixIdsFromReactionBroadcast,
  nixReactionsKeyCovers,
  normalizeNixReactionIds,
  type NixReactionsSnapshot,
} from './nixReactions';

describe('normalizeNixReactionIds', () => {
  it('dedupes, drops empty ids and sorts for a stable query key', () => {
    expect(normalizeNixReactionIds(['b', null, 'a', 'b', undefined, ''])).toEqual(['a', 'b']);
  });

  it('caps the list at the RPC limit', () => {
    const ids = Array.from({ length: NIX_REACTIONS_MAX_IDS + 5 }, (_, i) => `id-${String(i).padStart(3, '0')}`);
    expect(normalizeNixReactionIds(ids)).toHaveLength(NIX_REACTIONS_MAX_IDS);
  });
});

describe('mapNixReactionRow', () => {
  it('maps a valid RPC row', () => {
    expect(
      mapNixReactionRow({ nix_id: 'n1', user_id: 'u1', emoji: 'heart', updated_at: '2026-10-12T10:00:00Z' }),
    ).toEqual({ nixId: 'n1', userId: 'u1', emoji: 'heart', updatedAt: '2026-10-12T10:00:00Z' });
  });

  it('skips rows with an unknown emoji or missing ids', () => {
    expect(mapNixReactionRow({ nix_id: 'n1', user_id: 'u1', emoji: 'fire' })).toBeNull();
    expect(mapNixReactionRow({ user_id: 'u1', emoji: 'heart' })).toBeNull();
    expect(mapNixReactionRow(null)).toBeNull();
  });
});

describe('indexNixReactions', () => {
  it('indexes by NiX id and keeps the newest reaction', () => {
    const byNixId = indexNixReactions([
      { nix_id: 'n1', user_id: 'u1', emoji: 'heart', updated_at: '2026-10-12T10:00:00Z' },
      { nix_id: 'n1', user_id: 'u2', emoji: 'hahaha', updated_at: '2026-10-12T11:00:00Z' },
      { nix_id: 'n2', user_id: 'u1', emoji: 'question', updated_at: '2026-10-12T09:00:00Z' },
      { nix_id: 'n3', user_id: 'u1', emoji: 'nope', updated_at: '2026-10-12T09:00:00Z' },
    ]);
    expect(Object.keys(byNixId).sort()).toEqual(['n1', 'n2']);
    expect(byNixId.n1?.emoji).toBe('hahaha');
  });
});

describe('nextNixReactionChange', () => {
  it('adds when there is no reaction', () => {
    expect(nextNixReactionChange(null, 'heart')).toEqual({ kind: 'set', emoji: 'heart', result: 'added' });
  });

  it('replaces a different reaction', () => {
    expect(nextNixReactionChange('heart', 'thumbsup')).toEqual({
      kind: 'set',
      emoji: 'thumbsup',
      result: 'updated',
    });
  });

  it('removes when the same emoji is tapped again', () => {
    expect(nextNixReactionChange('heart', 'heart')).toEqual({ kind: 'remove', result: 'removed' });
  });
});

describe('applyNixReactionChange', () => {
  const base: NixReactionsSnapshot = {
    available: true,
    byNixId: { n2: { nixId: 'n2', userId: 'u1', emoji: 'question', updatedAt: 't0' } },
  };

  it('sets a reaction without touching other entries', () => {
    const next = applyNixReactionChange(base, { nixId: 'n1', userId: 'u1', emoji: 'heart', now: 't1' });
    expect(next.byNixId.n1).toEqual({ nixId: 'n1', userId: 'u1', emoji: 'heart', updatedAt: 't1' });
    expect(next.byNixId.n2).toBe(base.byNixId.n2);
    expect(base.byNixId.n1).toBeUndefined();
  });

  it('removes a reaction', () => {
    const next = applyNixReactionChange(base, { nixId: 'n2', userId: 'u1', emoji: null, now: 't1' });
    expect(next.byNixId.n2).toBeUndefined();
    expect(next.available).toBe(true);
  });
});

describe('nixReactionsKeyCovers', () => {
  it('matches only lists that contain the NiX', () => {
    expect(nixReactionsKeyCovers(['nixReactions', ['a', 'b']], 'b')).toBe(true);
    expect(nixReactionsKeyCovers(['nixReactions', ['a']], 'b')).toBe(false);
    expect(nixReactionsKeyCovers(['nixReactions'], 'b')).toBe(false);
  });
});

describe('nixIdsFromReactionBroadcast', () => {
  it('reads string ids from the trigger payload', () => {
    expect(nixIdsFromReactionBroadcast({ v: 1, nix_ids: ['n1', 2, 'n2'] })).toEqual(['n1', 'n2']);
    expect(nixIdsFromReactionBroadcast(null)).toEqual([]);
    expect(nixIdsFromReactionBroadcast({ v: 1 })).toEqual([]);
  });
});
