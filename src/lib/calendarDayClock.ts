/** Local calendar day of `date`, e.g. `2026-10-10`; changes exactly at local midnight. */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Milliseconds until the next local midnight (plus a small margin so the timer never fires a
 * moment before the day actually changed). DST-safe: built from local date parts, not `+24 h`.
 */
export function msUntilNextLocalMidnight(now: Date, marginMs = 1_000): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return Math.max(0, nextMidnight - now.getTime()) + marginMs;
}
