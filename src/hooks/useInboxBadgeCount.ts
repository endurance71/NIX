import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getInboxBadgeState,
  refreshInboxBadgeCount,
  subscribeInboxBadge,
} from '../lib/inboxBadgeStore';

type UseInboxBadgeCountOptions = {
  autoRefresh?: boolean;
};

export function useInboxBadgeCount(options: UseInboxBadgeCountOptions = {}) {
  const { autoRefresh = true } = options;
  const queryClient = useQueryClient();
  const [badgeState, setBadgeState] = useState(getInboxBadgeState);

  useEffect(() => {
    const unsubscribe = subscribeInboxBadge(() => {
      setBadgeState({ ...getInboxBadgeState() });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    void refreshInboxBadgeCount(queryClient);
  }, [autoRefresh, queryClient]);

  return {
    count: badgeState.count,
    loading: badgeState.loading,
    refresh: () => refreshInboxBadgeCount(queryClient),
  };
}
