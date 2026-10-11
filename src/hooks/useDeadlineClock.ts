import { useEffect, useState } from 'react';

// setTimeout delays above 2^31-1 ms overflow and fire immediately.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Nearest deadline after `now`, or null. */
export function nextDeadlineAfter(deadlines: readonly number[], now: number): number | null {
  let next: number | null = null;
  for (const deadline of deadlines) {
    if (Number.isFinite(deadline) && deadline > now && (next === null || deadline < next)) next = deadline;
  }
  return next;
}

/**
 * A clock that ticks (re-renders with a fresh `Date.now()`) when the nearest deadline passes, with
 * one timer. A deadline that passed between the last tick and new data gets a 0 ms timer, so
 * filters using the clock never run on a stale value. Pass a memoized array.
 */
export function useDeadlineClock(deadlines: readonly number[]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const next = nextDeadlineAfter(deadlines, now);
    if (next === null) return;
    const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, next - Date.now()));
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [deadlines, now]);
  return now;
}
