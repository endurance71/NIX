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
import { captureSessionScope } from '../lib/sessionScope';

type OfflineCacheContextValue = {
  isHydrated: boolean;
  lastSyncedAt: number | null;
  availableCategories: ReadonlySet<OfflineCacheCategory>;
  hasCachedData: (category: OfflineCacheCategory) => boolean;
};

const OfflineCacheContext = createContext<OfflineCacheContextValue | null>(null);
const EMPTY_CATEGORIES: ReadonlySet<OfflineCacheCategory> = new Set();

type PendingWrite = { timer: ReturnType<typeof setTimeout>; run: () => void };

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
  pendingWrites: Map<string, PendingWrite>;
  isOwnerActive: () => boolean;
  onWritten: (category: OfflineCacheCategory) => void;
}) {
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    // Only new data matters. Observer events (`observerOptionsUpdated` fires on every render of a
    // screen with an inline queryFn) used to re-encrypt and rewrite the same bundle constantly.
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const query = event.query;
    const descriptor = describeOfflineCacheQuery(query.queryKey);
    if (!descriptor || query.state.status !== 'success' || query.state.data === undefined) return;
    const writeKey = JSON.stringify(query.queryKey);
    const previous = pendingWrites.get(writeKey);
    if (previous) clearTimeout(previous.timer);
    const run = () => {
      pendingWrites.delete(writeKey);
      if (!isOwnerActive()) return;
      try { captureSessionScope(ownerId).assertActive(); } catch { return; }
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
    };
    pendingWrites.set(writeKey, { timer: setTimeout(run, 300), run });
  });
  return () => {
    unsubscribe();
    // Going offline must not drop the newest data (e.g. a message received just before):
    // flush instead of cancelling. Each write re-checks the owner, so logout still skips them.
    const pending = [...pendingWrites.values()];
    pendingWrites.clear();
    for (const write of pending) {
      clearTimeout(write.timer);
      write.run();
    }
  };
}

export function OfflineCacheProvider({ children }: { children: ReactNode }) {
  // Async hydration the React Compiler cannot lower; the context value is memoized by hand.
  'use no memo';
  const queryClient = useQueryClient();
  const { user, canUseNetworkSession } = useAuth();
  const userId = user?.id ?? null;
  const [ownerCache, setOwnerCache] = useState<OwnerCacheState>(() => ({
    ownerId: null,
    isHydrated: true,
    lastSyncedAt: null,
    availableCategories: EMPTY_CATEGORIES,
  }));
  const pendingWritesRef = useRef(new Map<string, PendingWrite>());
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
    // oxlint-disable-next-line react-hooks-js/todo -- opted out of compilation ('use no memo') above
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
        // Never let disk data replace something newer already in memory (e.g. a realtime update
        // received right before the app went offline and to the background).
        if (!current || current.dataUpdatedAt <= entry.dataUpdatedAt) {
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
    void hydrateOwner(userId, generation);
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
      if (state === 'active') void hydrateOwner(userId);
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
