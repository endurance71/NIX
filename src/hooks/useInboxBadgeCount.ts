import { useQuery } from '@tanstack/react-query';
import { countUnreadInboxNixes, inboxNixesBundleQueryOptions } from '../lib/inboxQuery';

export function useInboxBadgeCount() {
  const query = useQuery(inboxNixesBundleQueryOptions());

  return {
    count: countUnreadInboxNixes(query.data),
    loading: query.isPending,
    refresh: query.refetch,
  };
}
