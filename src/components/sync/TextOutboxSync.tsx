import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToAppForeground } from '../../services/pushNotificationService';
import { flushTextOutbox, resetTextOutboxBackoff } from '../../services/textOutboxService';
import { queryKeys } from '../../lib/queryKeys';
import { subscribeToReconnect } from '../../lib/connectivity';

export function TextOutboxSync({ userId }: { userId: string }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const flush = async ({ resetBackoff = false } = {}) => {
      if (resetBackoff) await resetTextOutboxBackoff(userId);
      const sentIds = await flushTextOutbox(userId);
      // Failed or rescheduled jobs change their bubble state too, not only sent ones.
      await queryClient.invalidateQueries({ queryKey: ['textOutbox'] });
      if (sentIds.length === 0) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'textMessagesWithPeer',
        }),
      ]);
    };

    const safelyFlush = (options?: { resetBackoff?: boolean }) => {
      void flush(options).catch(() => { /* Next active session retries its own queue. */ });
    };
    // Mounting means the session just became usable online (cold start or reconnect).
    safelyFlush({ resetBackoff: true });
    // Keep delayed exponential-backoff jobs moving while the app remains
    // foregrounded and online; network callbacks alone would not wake them.
    const timer = setInterval(() => {
      safelyFlush();
    }, 30_000);
    // A job that failed while offline may sit on a long backoff; reconnecting sends it now.
    const unsubscribeNetwork = subscribeToReconnect(() => {
      safelyFlush({ resetBackoff: true });
    });
    const unsubscribeForeground = subscribeToAppForeground(() => {
      safelyFlush({ resetBackoff: true });
    });
    return () => {
      clearInterval(timer);
      unsubscribeNetwork();
      unsubscribeForeground();
    };
  }, [queryClient, userId]);

  return null;
}
