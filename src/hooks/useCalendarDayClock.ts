import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { localDayKey, msUntilNextLocalMidnight } from '../lib/calendarDayClock';

/**
 * A `Date` that is replaced only when the local calendar day changes: at midnight, when the screen
 * regains focus and when the app returns to the foreground (timers do not run in the background).
 * Relative labels („Dziś”, „Wczoraj”) built from it never go stale, and a re-render within the same
 * day keeps the same object, so memoized timelines are not rebuilt.
 */
export function useCalendarDayClock(): Date {
  const [now, setNow] = useState(() => new Date());

  const refreshIfDayChanged = useCallback(() => {
    setNow((current) => {
      const next = new Date();
      return localDayKey(next) === localDayKey(current) ? current : next;
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(refreshIfDayChanged, msUntilNextLocalMidnight(now));
    return () => clearTimeout(timer);
  }, [now, refreshIfDayChanged]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshIfDayChanged();
    });
    return () => subscription.remove();
  }, [refreshIfDayChanged]);

  useFocusEffect(refreshIfDayChanged);

  return now;
}
