import { useCallback, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToAppForeground } from '../../services/pushNotificationService';
import { flushTextOutbox } from '../../services/textOutboxService';
import { queryKeys } from '../../lib/queryKeys';

export function TextOutboxSync({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const flush = useCallback(async () => {
    const sentIds = await flushTextOutbox(userId);
    if (sentIds.length === 0) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['textOutbox'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'textMessagesWithPeer',
      }),
    ]);
  }, [queryClient, userId]);

  useEffect(() => {
    void flush();
    // Keep delayed exponential-backoff jobs moving while the app remains
    // foregrounded and online; network callbacks alone would not wake them.
    const timer = setInterval(() => {
      void flush();
    }, 30_000);
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected) void flush();
    });
    const unsubscribeForeground = subscribeToAppForeground(() => void flush());
    return () => {
      clearInterval(timer);
      unsubscribeNetwork();
      unsubscribeForeground();
    };
  }, [flush]);

  return null;
}
