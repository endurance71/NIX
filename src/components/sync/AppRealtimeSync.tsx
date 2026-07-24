import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { flushCleanupQueue } from '../../services/nixService';
import { trackEvent } from '../../lib/telemetry';
import { flushPendingViewedAcks } from '../../lib/viewedAckQueue';
import {
  createSyncAreaDebouncer,
  finalizeRealtimeChannelUnsubscribe,
  realtimeQueryKeysForArea,
  type SyncArea,
} from '../../lib/realtimeSyncPolicy';

const EVENT_DEBOUNCE_MS = 150;
const DEGRADED_POLL_INTERVAL_MS = 15_000;

export function AppRealtimeSync({ userId }: { userId: string }) {
  const queryClient = useQueryClient();

  // Every allocation is released by the returned teardown; the rule does not
  // recognize the chained Supabase subscription and asynchronous unsubscribe.
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    let active = AppState.currentState === 'active';
    let channelHealthy = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const refreshAreas = async (areas: ReadonlySet<SyncArea>) => {
      const keys = new Map<string, readonly unknown[]>();
      areas.forEach((area) => {
        realtimeQueryKeysForArea(area).forEach((key) => keys.set(JSON.stringify(key), key));
      });
      const promises: Promise<unknown>[] = [...keys.values()].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey })
      );
      if (areas.has('textChat') || areas.has('inbox')) {
        promises.push(queryClient.invalidateQueries({ queryKey: ['textMessagesWithPeer'] }));
      }
      await Promise.all(promises);
    };

    const refreshScheduler = createSyncAreaDebouncer(
      (areas) => void refreshAreas(areas),
      EVENT_DEBOUNCE_MS
    );

    const syncForeground = () => {
      refreshScheduler.schedule('inbox');
      refreshScheduler.schedule('friends');
      refreshScheduler.schedule('textChat');
      void flushCleanupQueue().catch((error) => {
        console.warn('Nie udało się zsynchronizować kolejki cleanup', error);
      });
      void flushPendingViewedAcks(userId).catch((error) => {
        console.warn('Nie udało się zsynchronizować potwierdzeń odczytu', error);
      });
    };

    const stopDegradedPolling = () => {
      if (!pollTimer) return;
      clearInterval(pollTimer);
      pollTimer = null;
    };

    const startDegradedPolling = () => {
      if (!active || channelHealthy || pollTimer) return;
      pollTimer = setInterval(() => {
        if (active && !channelHealthy) syncForeground();
      }, DEGRADED_POLL_INTERVAL_MS);
    };

    const onInboxChange = () => refreshScheduler.schedule('inbox');
    const onTextChatChange = () => refreshScheduler.schedule('textChat');
    const onFriendshipChange = () => refreshScheduler.schedule('friends');
    const channel = supabase
      .channel(`app-sync-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nixes', filter: `receiver_id=eq.${userId}` },
        onInboxChange
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'nixes', filter: `receiver_id=eq.${userId}` },
        onInboxChange
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nixes', filter: `sender_id=eq.${userId}` },
        onInboxChange
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'nixes', filter: `sender_id=eq.${userId}` },
        onInboxChange
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'text_messages', filter: `receiver_id=eq.${userId}` },
        onTextChatChange
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'text_messages', filter: `receiver_id=eq.${userId}` },
        onTextChatChange
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'text_messages', filter: `sender_id=eq.${userId}` },
        onTextChatChange
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'text_messages', filter: `sender_id=eq.${userId}` },
        onTextChatChange
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friendships', filter: `user_id=eq.${userId}` },
        onFriendshipChange
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `user_id=eq.${userId}` },
        onFriendshipChange
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friendships', filter: `friend_id=eq.${userId}` },
        onFriendshipChange
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `friend_id=eq.${userId}` },
        onFriendshipChange
      )
      .subscribe((status) => {
        channelHealthy = status === 'SUBSCRIBED';
        trackEvent('realtime_connection_status', { status });
        if (channelHealthy) {
          stopDegradedPolling();
          syncForeground();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startDegradedPolling();
        }
      });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      active = state === 'active';
      if (active) {
        syncForeground();
        startDegradedPolling();
      } else {
        stopDegradedPolling();
      }
    });

    let wasOnline: boolean | null = null;
    const networkSubscription = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true;
      if (online && wasOnline === false) syncForeground();
      wasOnline = online;
    });

    return () => {
      refreshScheduler.cancel();
      stopDegradedPolling();
      appStateSubscription.remove();
      networkSubscription();
      void finalizeRealtimeChannelUnsubscribe(channel, channel.unsubscribe());
    };
  }, [queryClient, userId]);

  return null;
}
