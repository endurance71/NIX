import { useEffect } from 'react';
import { reconcilePrivatePhotoCache } from '../../services/photoCacheService';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { flushCleanupQueue } from '../../services/nixService';
import { trackEvent } from '../../lib/telemetry';
import { flushPendingViewedAcks } from '../../lib/viewedAckQueue';
import { subscribeToReconnect } from '../../lib/connectivity';
import {
  FOREGROUND_SYNC_MIN_INTERVAL_MS,
  REALTIME_SUBSCRIBE_WATCHDOG_MS,
  USER_BROADCAST_EVENTS,
  USER_BROADCAST_MAX_CONSECUTIVE_ERRORS,
  createSyncAreaDebouncer,
  finalizeRealtimeChannelUnsubscribe,
  nextAppSyncTopic,
  realtimeQueryKeysForArea,
  staleAppSyncChannels,
  staleUserBroadcastChannels,
  syncAreaForUserBroadcast,
  userBroadcastTopic,
  type SyncArea,
} from '../../lib/realtimeSyncPolicy';

const EVENT_DEBOUNCE_MS = 150;
const DEGRADED_POLL_INTERVAL_MS = 15_000;

export function AppRealtimeSync({ userId }: { userId: string }) {
  // Renders nothing; all work is one imperative effect the React Compiler cannot lower.
  'use no memo';
  const queryClient = useQueryClient();

  // Every allocation is released by the returned teardown; the rule does not
  // recognize the chained Supabase subscription and asynchronous unsubscribe.
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    let appState = AppState.currentState;
    let active = appState === 'active';
    let channelHealthy = false;
    let lastForegroundSyncAt = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    let userChannel: RealtimeChannel | null = null;
    let userChannelJoining = false;
    let userChannelErrors = 0;

    const refreshAreas = async (areas: ReadonlySet<SyncArea>) => {
      const keys = new Map<string, readonly unknown[]>();
      areas.forEach((area) => {
        realtimeQueryKeysForArea(area).forEach((key) => keys.set(JSON.stringify(key), key));
      });
      // cancelRefetch:false — a fetch already in flight (screen mount, badge, foreground) is
      // reused instead of being aborted and started again.
      const promises: Promise<unknown>[] = [...keys.values()].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false })
      );
      if (areas.has('inbox')) promises.push(reconcilePrivatePhotoCache(userId).catch(() => {}));
      await Promise.all(promises);
    };

    const refreshScheduler = createSyncAreaDebouncer(
      (areas) => void refreshAreas(areas),
      EVENT_DEBOUNCE_MS
    );

    // Mount, SUBSCRIBED, app activation and reconnect usually fire within a second or two of each
    // other; one full sync covers them all.
    const syncForeground = ({ force = false } = {}) => {
      const now = Date.now();
      if (!force && now - lastForegroundSyncAt < FOREGROUND_SYNC_MIN_INTERVAL_MS) return;
      lastForegroundSyncAt = now;
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
    syncForeground();

    const stopDegradedPolling = () => {
      if (!pollTimer) return;
      clearInterval(pollTimer);
      pollTimer = null;
    };

    const startDegradedPolling = () => {
      if (!active || channelHealthy || pollTimer) return;
      pollTimer = setInterval(() => {
        if (active && !channelHealthy) syncForeground({ force: true });
      }, DEGRADED_POLL_INTERVAL_MS);
    };

    const onInboxChange = () => refreshScheduler.schedule('inbox');
    const onTextChatChange = () => refreshScheduler.schedule('textChat');
    const onFriendshipChange = () => refreshScheduler.schedule('friends');
    // Leave whatever an earlier mount could not (its unsubscribe may have timed out offline), so
    // the server stops streaming duplicate changes to a channel nobody listens to.
    for (const stale of staleAppSyncChannels(supabase.getChannels(), userId)) {
      void supabase.removeChannel(stale).catch(() => undefined);
    }
    const channel = supabase
      .channel(nextAppSyncTopic(userId))
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
        { event: 'INSERT', schema: 'public', table: 'text_messages', filter: `sender_id=eq.${userId}` },
        onTextChatChange
      )
      // Read receipts: the receiver's read stamps read_at on my messages (Delivered → Opened).
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'text_messages', filter: `sender_id=eq.${userId}` },
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

    // Reactions and message removals (including the expiry cron) arrive as Broadcast on the
    // private `user:<id>` topic, sent by database triggers to both participants only. It is a
    // separate channel so a rejected private join (backend migration not deployed yet) cannot
    // take the INSERT/UPDATE subscriptions above down with it; foreground sync still refreshes
    // open chats in that case.
    const leaveUserChannel = () => {
      const current = userChannel;
      userChannel = null;
      if (current) void finalizeRealtimeChannelUnsubscribe(current, current.unsubscribe());
    };

    // Fallback while the private channel is unavailable (backend not deployed yet, private
    // channels rejected): RLS-filtered reaction INSERT/UPDATE, so live reactions keep working.
    // DELETEs stay out on purpose (they skip RLS and would reach every client); expired messages
    // already disappear locally by `expires_at`.
    let reactionsFallback: RealtimeChannel | null = null;
    const stopReactionsFallback = () => {
      const current = reactionsFallback;
      reactionsFallback = null;
      if (current) void finalizeRealtimeChannelUnsubscribe(current, current.unsubscribe());
    };
    const startReactionsFallback = () => {
      if (disposed || reactionsFallback) return;
      const onReactionChange = () => refreshScheduler.schedule('reactions');
      trackEvent('realtime_connection_status', { status: 'REACTIONS_FALLBACK', channel: 'user' });
      reactionsFallback = supabase
        .channel(nextAppSyncTopic(userId))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, onReactionChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions' }, onReactionChange)
        .subscribe();
    };

    const joinUserChannel = async () => {
      if (disposed || userChannel || userChannelJoining) return;
      userChannelJoining = true;
      // oxlint-disable-next-line react-hooks-js/todo -- opted out of compilation ('use no memo') above
      try {
        // The topic is fixed by the RLS policy, and `supabase.channel(topic)` would hand back a
        // channel that is still leaving, so wait until leftovers are gone.
        await Promise.all(
          staleUserBroadcastChannels(supabase.getChannels()).map((stale) =>
            supabase.removeChannel(stale).catch(() => undefined)
          )
        );
        // Private channels are authorized by the JWT sent with the join.
        await supabase.realtime.setAuth().catch(() => undefined);
        if (disposed) return;
        const topic = userBroadcastTopic(userId);
        if (supabase.getChannels().some((existing) => existing.topic === `realtime:${topic}`)) {
          trackEvent('realtime_connection_status', { status: 'USER_CHANNEL_BUSY', channel: 'user' });
          return;
        }
        userChannelErrors = 0;
        let subscribedBefore = false;
        const onUserBroadcast = ({ event }: { event: string }) => {
          const area = syncAreaForUserBroadcast(event);
          if (area) refreshScheduler.schedule(area);
        };
        const channel = supabase
          .channel(topic, { config: { private: true } })
          .on('broadcast', { event: USER_BROADCAST_EVENTS.reactionChanged }, onUserBroadcast)
          .on('broadcast', { event: USER_BROADCAST_EVENTS.messagesRemoved }, onUserBroadcast)
          .on('broadcast', { event: USER_BROADCAST_EVENTS.nixReactionChanged }, onUserBroadcast);
        userChannel = channel;
        channel.subscribe((status) => {
          if (userChannel !== channel) return;
          if (status === 'SUBSCRIBED') {
            userChannelErrors = 0;
            stopReactionsFallback();
            // A rejoin may have missed removals or reactions; refresh only the open chat.
            if (subscribedBefore) refreshScheduler.schedule('messageRemoval');
            subscribedBefore = true;
            return;
          }
          if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
          userChannelErrors += 1;
          trackEvent('realtime_connection_status', { status, channel: 'user' });
          if (userChannelErrors >= USER_BROADCAST_MAX_CONSECUTIVE_ERRORS) {
            leaveUserChannel();
            startReactionsFallback();
          }
        });
      } catch (error) {
        console.warn('Nie udało się połączyć z prywatnym kanałem realtime', error);
      } finally {
        userChannelJoining = false;
      }
    };
    void joinUserChannel();

    const subscribeWatchdog = setTimeout(() => {
      if (channelHealthy) return;
      trackEvent('realtime_connection_status', { status: 'SUBSCRIBE_TIMEOUT' });
      startDegradedPolling();
    }, REALTIME_SUBSCRIBE_WATCHDOG_MS);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      const previous = appState;
      appState = state;
      active = state === 'active';
      if (active) {
        // inactive → active (Control Center, Face ID, a permission prompt) is not a return from
        // the background; nothing could have been missed.
        if (previous === 'background') {
          syncForeground();
          void joinUserChannel();
        }
        startDegradedPolling();
      } else {
        stopDegradedPolling();
      }
    });

    const networkSubscription = subscribeToReconnect(() => {
      syncForeground();
      void joinUserChannel();
    });

    return () => {
      disposed = true;
      leaveUserChannel();
      stopReactionsFallback();
      clearTimeout(subscribeWatchdog);
      refreshScheduler.cancel();
      stopDegradedPolling();
      appStateSubscription.remove();
      networkSubscription();
      void finalizeRealtimeChannelUnsubscribe(channel, channel.unsubscribe());
    };
  }, [queryClient, userId]);

  return null;
}
