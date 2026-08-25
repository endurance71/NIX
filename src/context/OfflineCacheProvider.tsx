import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
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
const EMPTY_CATEGORIES: ReadonlySet<OfflineCacheCategory> = new Set();

type OwnerCacheState = {
  ownerId: string | null;
  isHydrated: boolean;
  lastSyncedAt: number | null;
  availableCategories: ReadonlySet<OfflineCacheCategory>;
};

function subscribeToOfflineCacheWrites({
  queryClient,
  ownerId,
  pendingWrites,
  isOwnerActive,
  onWritten,
}: {
  queryClient: QueryClient;
  ownerId: string;
  pendingWrites: Map<string, ReturnType<typeof setTimeout>>;
  isOwnerActive: () => boolean;
  onWritten: (category: OfflineCacheCategory) => void;
}) {
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    const query = event.query;
    const descriptor = describeOfflineCacheQuery(query.queryKey);
    if (!descriptor || query.state.status !== 'success' || query.state.data === undefined) return;
    const writeKey = JSON.stringify(query.queryKey);
    const previousTimer = pendingWrites.get(writeKey);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      pendingWrites.delete(writeKey);
      void offlineCacheStore.write(
        ownerId,
        query.queryKey,
        query.state.data,
        query.state.dataUpdatedAt
      ).then((written) => {
        if (written && isOwnerActive()) onWritten(descriptor.category);
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
}

export function OfflineCacheProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, canUseNetworkSession } = useAuth();
  const userId = user?.id ?? null;
  const [ownerCache, setOwnerCache] = useState<OwnerCacheState>(() => ({
    ownerId: null,
    isHydrated: true,
    lastSyncedAt: null,
    availableCategories: EMPTY_CATEGORIES,
  }));
  const pendingWritesRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const activeOwnerIdRef = useRef<string | null>(userId);
  const hydrationGenerationRef = useRef(0);

  useLayoutEffect(() => {
    activeOwnerIdRef.current = userId;
    hydrationGenerationRef.current += 1;
    return () => {
      if (activeOwnerIdRef.current === userId) activeOwnerIdRef.current = null;
      hydrationGenerationRef.current += 1;
    };
  }, [userId]);

  const hydrateOwner = useEffectEvent(async (
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
      setOwnerCache({
        ownerId,
        isHydrated: true,
        lastSyncedAt: newestCachedAt,
        availableCategories: categories,
      });
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
      setOwnerCache({
        ownerId,
        isHydrated: true,
        lastSyncedAt: null,
        availableCategories: EMPTY_CATEGORIES,
      });
      trackEvent('offline_cache_hydrated', { result: 'cache_reset' });
    }
  });

  useEffect(() => {
    const generation = hydrationGenerationRef.current;
    if (!userId) return;
    void hydrateOwner(userId, false, generation);
  }, [userId]);

  useEffect(() => {
    if (!userId || !canUseNetworkSession) return;
    const pendingWrites = pendingWritesRef.current;
    return subscribeToOfflineCacheWrites({
      queryClient,
      ownerId: userId,
      pendingWrites,
      isOwnerActive: () => activeOwnerIdRef.current === userId,
      onWritten: (category) => {
        setOwnerCache((current) => ({
          ownerId: userId,
          isHydrated: current.ownerId === userId && current.isHydrated,
          lastSyncedAt: Date.now(),
          availableCategories: new Set(
            current.ownerId === userId ? current.availableCategories : EMPTY_CATEGORIES
          ).add(category),
        }));
      },
    });
  }, [canUseNetworkSession, queryClient, userId]);

  useEffect(() => {
    if (!userId || canUseNetworkSession) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void hydrateOwner(userId, true);
    });
    return () => subscription.remove();
  }, [canUseNetworkSession, userId]);

  const visibleCache = ownerCache.ownerId === userId ? ownerCache : null;
  const availableCategories = visibleCache?.availableCategories ?? EMPTY_CATEGORIES;

  const value = useMemo<OfflineCacheContextValue>(() => ({
    isHydrated: !userId || visibleCache?.isHydrated === true,
    lastSyncedAt: visibleCache?.lastSyncedAt ?? null,
    availableCategories,
    hasCachedData: (category) => availableCategories.has(category),
  }), [availableCategories, userId, visibleCache?.isHydrated, visibleCache?.lastSyncedAt]);

  return <OfflineCacheContext.Provider value={value}>{children}</OfflineCacheContext.Provider>;
}

export function useOfflineCache() {
  const value = useContext(OfflineCacheContext);
  if (!value) throw new Error('useOfflineCache must be used inside OfflineCacheProvider');
  return value;
}
