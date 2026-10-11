import { supabase } from '../lib/supabase';
import { parseFriendStreakRows, type FriendStreakSnapshot } from '../lib/friendStreaks';
import { createRpcFallbackGate } from '../lib/rpcFallbackGate';
import { isMissingRpcError } from './nixService';

const FRIEND_STREAKS_RPC = 'get_friend_streaks';

const friendStreaksRpcGate = createRpcFallbackGate();

/** Test hook: forget the remembered fallback. */
export function resetFriendStreaksRpcFallback() {
  friendStreaksRpcGate.reset();
}

/**
 * Streaks and exchange counts for the caller's friends. Streaks are decoration: a backend without
 * the RPC (production before the migration ships) yields an empty list, so no badges and no
 * best-friends section are shown. Other errors are thrown so React Query keeps the last data.
 */
export async function fetchFriendStreaks(): Promise<FriendStreakSnapshot[]> {
  if (!friendStreaksRpcGate.shouldTryRpc()) return [];
  const { data, error } = await supabase.rpc(FRIEND_STREAKS_RPC);
  if (error) {
    if (isMissingRpcError(error, FRIEND_STREAKS_RPC)) {
      friendStreaksRpcGate.markUnavailable();
      return [];
    }
    throw error;
  }
  return parseFriendStreakRows(data);
}
