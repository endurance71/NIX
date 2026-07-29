import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { countUnreadInboxNixes, inboxNixesBundleQueryOptions } from '../lib/inboxQuery';
import {
  subscribeToAppForeground,
  syncAppIconBadge,
} from '../services/pushNotificationService';

export function useInboxBadgeCount() {
  const query = useQuery(inboxNixesBundleQueryOptions());
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
