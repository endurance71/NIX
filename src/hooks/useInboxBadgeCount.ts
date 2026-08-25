import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { countUnreadInboxNixes, inboxNixesBundleQueryOptions } from '../lib/inboxQuery';
import {
  subscribeToAppForeground,
  syncAppIconBadge,
} from '../services/pushNotificationService';
import { useAuth } from './useAuth';

export function useInboxBadgeCount() {
  const { canUseNetworkSession } = useAuth();
  const query = useQuery({
    ...inboxNixesBundleQueryOptions(),
    enabled: canUseNetworkSession,
  });
  const count = countUnreadInboxNixes(query.data);

  useEffect(() => {
    void syncAppIconBadge(Math.min(99, count));
  }, [count]);

  useEffect(() => {
    return subscribeToAppForeground(() => {
      void syncAppIconBadge(Math.min(99, count));
    });
  }, [count]);

  return {
    count,
    loading: query.isPending,
    refresh: query.refetch,
  };
}
