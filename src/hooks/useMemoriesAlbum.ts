import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import type { MemoriesPreference, MemoryEntry } from '../lib/memories';
import {
  deleteAllMemories,
  deleteMemory,
  getMemoriesPreference,
  listMemories,
  setMemoriesPreference,
  subscribeMemories,
  tidyMemories,
} from '../services/memoriesStore';

type AlbumState = {
  ownerId: string | null;
  entries: MemoryEntry[] | null;
  preference: MemoriesPreference;
  failed: boolean;
};

/** The signed-in user's local Memories album and its saving preference. */
export function useMemoriesAlbum() {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const [state, setState] = useState<AlbumState>({ ownerId: null, entries: null, preference: 'unset', failed: false });

  const load = useCallback(async (owner: string) => {
    try {
      const [entries, preference] = await Promise.all([listMemories(owner), getMemoriesPreference(owner)]);
      setState({ ownerId: owner, entries, preference, failed: false });
    } catch {
      setState((current) => ({ ...current, ownerId: owner, entries: current.ownerId === owner ? current.entries : [], failed: true }));
    }
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    void tidyMemories(ownerId)
      .catch(() => undefined)
      .then(() => (active ? load(ownerId) : undefined));
    const unsubscribe = subscribeMemories((changedOwner) => {
      if (changedOwner === ownerId) void load(ownerId);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [load, ownerId]);

  const current = state.ownerId === ownerId ? state : null;

  return {
    ownerId,
    entries: current?.entries ?? null,
    preference: current?.preference ?? 'unset',
    failed: current?.failed ?? false,
    setSavingEnabled: (enabled: boolean) => {
      if (!ownerId) return Promise.resolve();
      // Optimistic: the switch moves at once; the store emits a reload afterwards.
      setState((value) => (value.ownerId === ownerId ? { ...value, preference: enabled ? 'on' : 'off' } : value));
      return setMemoriesPreference(ownerId, enabled);
    },
    remove: (id: string) => (ownerId ? deleteMemory(ownerId, id) : Promise.resolve()),
    removeAll: () => (ownerId ? deleteAllMemories(ownerId) : Promise.resolve()),
  };
}
