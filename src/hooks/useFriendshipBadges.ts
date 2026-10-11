import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  EMPTY_FRIENDSHIP_OVERVIEW,
  buildFriendshipOverview,
  nextFriendshipBadgeChangeAt,
  type FriendshipBadge,
  type FriendshipOverview,
} from '../lib/friendStreaks';
import { queryKeys } from '../lib/queryKeys';
import { fetchFriendStreaks } from '../services/friendStreakService';
import { useAuth } from './useAuth';

const FRIEND_STREAKS_STALE_MS = 60_000;
/** Cap for one timer so a suspended app re-checks soon after it wakes up. */
const MAX_CLOCK_WAIT_MS = 60 * 60_000;

/**
 * Streak / best-friend badges for every friend, shared by the inbox, friends list, friend detail,
 * send-to and the chat header (one cached `get_friend_streaks` call). The badges are re-evaluated
 * exactly when a streak enters its at-risk window or a day ends, without polling the server.
 * Without the migration (or offline without data) the overview is empty: no badges anywhere.
 */
export function useFriendshipOverview(): FriendshipOverview {
  const { canUseNetworkSession } = useAuth();
  const { data, dataUpdatedAt } = useQuery({
    queryKey: queryKeys.friendStreaks,
    queryFn: fetchFriendStreaks,
    enabled: canUseNetworkSession,
    staleTime: FRIEND_STREAKS_STALE_MS,
    // Decoration only: a failed refresh keeps the last badges and never shows an error.
    retry: false,
  });
  // Badges only change at known moments (risk window, end of day). Between them any moment gives
  // the same result, so "now" is the later of the fetch time and the last timer tick.
  const [clockTick, setClockTick] = useState(0);
  const now = Math.max(dataUpdatedAt, clockTick);

  useEffect(() => {
    if (!data || data.length === 0) return;
    const next = nextFriendshipBadgeChangeAt(data, now);
    if (next === null) return;
    const wait = Math.min(Math.max(next - Date.now(), 1_000), MAX_CLOCK_WAIT_MS);
    const timer = setTimeout(() => setClockTick(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [data, now]);

  return useMemo(
    () => (data && data.length > 0 ? buildFriendshipOverview(data, now) : EMPTY_FRIENDSHIP_OVERVIEW),
    [data, now],
  );
}

/** One friend's badge (chat header, friend detail); `null` when there is nothing to show. */
export function useFriendshipBadge(peerId: string | null | undefined): FriendshipBadge | null {
  const { badges } = useFriendshipOverview();
  return peerId ? (badges.get(peerId) ?? null) : null;
}
