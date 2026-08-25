import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { offlineCacheStore } from '../lib/offlineCacheStore';
import {
  describeOfflineCacheQuery,
  type OfflineCacheCategory,
} from '../lib/offlineCachePolicy';
import { trackEvent } from '../lib/telemetry';
import { clearRecipientSnapshot, readRecipientSnapshot } from '../lib/recipientSnapshot';

type OfflineCacheContextValue = {
  isHydrated: boolean;
  lastSyncedAt: number | null;
  availableCategories: ReadonlySet<OfflineCacheCategory>;
  hasCachedData: (category: OfflineCacheCategory) => boolean;
};

const OfflineCacheContext = createContext<OfflineCacheContextValue | null>(null);

export function OfflineCacheProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, canUseNetworkSession } = useAuth();
  const userId = user?.id ?? null;
  const [hydratedOwnerId, setHydratedOwnerId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [availableCategories, setAvailableCategories] = useState<ReadonlySet<OfflineCacheCategory>>(
    () => new Set()
  );
  const pendingWritesRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const activeOwnerIdRef = useRef<string | null>(userId);
  const hydrationGenerationRef = useRef(0);
  // Identity changes must invalidate an in-flight decrypt before passive effects run.
  // eslint-disable-next-line react-hooks/refs
  activeOwnerIdRef.current = userId;

  const hydrateOwner = useCallback(async (
    ownerId: string,
    force = false,
    generation = hydrationGenerationRef.current
  ) => {
    try {
      let entries = await offlineCacheStore.read(ownerId);
      if (
        activeOwnerIdRef.current !== ownerId
        || hydrationGenerationRef.current !== generation
      ) return;
      const hasEncryptedRecipients = entries.some(
        (entry) => entry.queryKey[0] === 'acceptedFriends'
      );
      if (!hasEncryptedRecipients) {
        const legacyRecipients = await readRecipientSnapshot(ownerId);
        if (legacyRecipients) {
          await offlineCacheStore.write(
            ownerId,
            ['acceptedFriends'],
            legacyRecipients.recipients,
            Date.parse(legacyRecipients.writtenAt) || Date.now()
          );
          await clearRecipientSnapshot(ownerId);
          entries = await offlineCacheStore.read(ownerId);
          if (
            activeOwnerIdRef.current !== ownerId
            || hydrationGenerationRef.current !== generation
          ) {
            await offlineCacheStore.clear(ownerId).catch(() => undefined);
            return;
          }
        }
      } else {
        await clearRecipientSnapshot(ownerId).catch(() => undefined);
      }
      if (
        activeOwnerIdRef.current !== ownerId
        || hydrationGenerationRef.current !== generation
      ) return;
      const categories = new Set<OfflineCacheCategory>();
      let newestCachedAt: number | null = null;
      for (const entry of entries) {
        const current = queryClient.getQueryState(entry.queryKey);
        if (force || !current || current.dataUpdatedAt <= entry.dataUpdatedAt) {
          queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.dataUpdatedAt });
        }
        categories.add(entry.category);
        newestCachedAt = Math.max(newestCachedAt ?? 0, entry.cachedAt);
      }
      setAvailableCategories(categories);
      setLastSyncedAt(newestCachedAt);
      trackEvent('offline_cache_hydrated', {
        result: 'success',
        entry_count: entries.length,
        category_count: categories.size,
      });
    } catch {
      if (
        activeOwnerIdRef.current !== ownerId
        || hydrationGenerationRef.current !== generation
      ) return;
      setAvailableCategories(new Set());
      setLastSyncedAt(null);
      trackEvent('offline_cache_hydrated', { result: 'cache_reset' });
    } finally {
      if (
        activeOwnerIdRef.current === ownerId
        && hydrationGenerationRef.current === generation
      ) setHydratedOwnerId(ownerId);
    }
  }, [queryClient]);

  useEffect(() => {
    hydrationGenerationRef.current += 1;
    const generation = hydrationGenerationRef.current;
    if (!userId) return;
    void hydrateOwner(userId, false, generation);
  }, [hydrateOwner, userId]);

  useEffect(() => {
    const pendingWrites = pendingWritesRef.current;
    const unsubscribe = !userId || !canUseNetworkSession
      ? () => undefined
      : queryClient.getQueryCache().subscribe((event) => {
        const query = event.query;
        const descriptor = describeOfflineCacheQuery(query.queryKey);
        if (!descriptor || query.state.status !== 'success' || query.state.data === undefined) return;
        const writeKey = JSON.stringify(query.queryKey);
        const previousTimer = pendingWrites.get(writeKey);
        if (previousTimer) clearTimeout(previousTimer);
        const timer = setTimeout(() => {
          pendingWrites.delete(writeKey);
          void offlineCacheStore.write(
            userId,
            query.queryKey,
            query.state.data,
            query.state.dataUpdatedAt
          ).then((written) => {
            if (!written || activeOwnerIdRef.current !== userId) return;
            setAvailableCategories((current) => new Set(current).add(descriptor.category));
            setLastSyncedAt(Date.now());
          }).catch(() => {
            trackEvent('offline_cache_write', { result: 'failed', category: descriptor.category });
          });
        }, 300);
        pendingWrites.set(writeKey, timer);
      });
    return () => {
      unsubscribe();
      for (const timer of pendingWrites.values()) clearTimeout(timer);
      pendingWrites.clear();
    };
  }, [canUseNetworkSession, queryClient, userId]);

  useEffect(() => {
    if (!userId || canUseNetworkSession) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void hydrateOwner(userId, true);
    });
    return () => subscription.remove();
  }, [canUseNetworkSession, hydrateOwner, userId]);

  const value = useMemo<OfflineCacheContextValue>(() => ({
    isHydrated: !userId || hydratedOwnerId === userId,
    lastSyncedAt,
    availableCategories,
    hasCachedData: (category) => availableCategories.has(category),
  }), [availableCategories, hydratedOwnerId, lastSyncedAt, userId]);

  return <OfflineCacheContext.Provider value={value}>{children}</OfflineCacheContext.Provider>;
}

export function useOfflineCache() {
  const value = useContext(OfflineCacheContext);
  if (!value) throw new Error('useOfflineCache must be used inside OfflineCacheProvider');
  return value;
}
