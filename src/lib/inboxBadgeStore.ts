import type { QueryClient } from '@tanstack/react-query';
import { fetchInboxNixes } from '../services/nixService';
import { queryKeys } from './queryKeys';

type InboxBadgeState = {
  count: number;
  loading: boolean;
};

const state: InboxBadgeState = {
  count: 0,
  loading: false,
};

const listeners = new Set<() => void>();
let inFlightRefresh: Promise<number> | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeInboxBadge(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInboxBadgeState() {
  return state;
}

export function setInboxBadgeCount(count: number) {
  state.count = Math.max(0, count);
  notify();
}

function countUnreadNixes(nixes: { is_viewed?: boolean }[]) {
  return nixes.filter((nix) => nix.is_viewed !== true).length;
}

type InboxBundleCached = { inboxData: { is_viewed?: boolean }[] };

/** Jeśli podasz `queryClient`, badge aktualizuje się po jednym refetch bundle — bez osobnego `fetchInboxNixes`. */
export async function refreshInboxBadgeCount(
  queryClient?: QueryClient,
  options?: { forceNetwork?: boolean }
) {
  if (inFlightRefresh) return inFlightRefresh;

  state.loading = true;
  notify();

  inFlightRefresh = (async () => {
    try {
      if (queryClient) {
        if (options?.forceNetwork) {
          await queryClient.refetchQueries({ queryKey: queryKeys.inboxNixesBundle, type: 'active' });
        }
        const bundle = queryClient.getQueryData<InboxBundleCached>(queryKeys.inboxNixesBundle);
        const unreadCount = countUnreadNixes(bundle?.inboxData ?? []);
        setInboxBadgeCount(unreadCount);
        return unreadCount;
      }

      const inbox = await fetchInboxNixes();
      const unreadCount = countUnreadNixes(inbox);
      setInboxBadgeCount(unreadCount);
      return unreadCount;
    } catch (error) {
      console.warn('Nie udało się odświeżyć badge skrzynki', error);
      setInboxBadgeCount(0);
      return 0;
    } finally {
      state.loading = false;
      inFlightRefresh = null;
      notify();
    }
  })();

  return inFlightRefresh;
}
