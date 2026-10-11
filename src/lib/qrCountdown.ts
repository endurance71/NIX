/**
 * Whole minutes left on the QR invite token, rounded up so the label never says „0 min” while the
 * code still works. `null` when the expiry is unknown, `0` once it has passed.
 */
export function qrMinutesRemaining(expiresAtMs: number | null, nowMs: number): number | null {
  if (expiresAtMs === null || !Number.isFinite(expiresAtMs)) return null;
  const remainingMs = expiresAtMs - nowMs;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 60_000);
}

/** Next moment the minute label changes, so the screen re-renders once a minute, not every second. */
export function msUntilNextQrMinuteTick(expiresAtMs: number, nowMs: number): number {
  const remainingMs = expiresAtMs - nowMs;
  if (remainingMs <= 0) return 0;
  const intoMinute = remainingMs % 60_000;
  // Exactly on a boundary: the label just changed, wait the full minute.
  return (intoMinute === 0 ? 60_000 : intoMinute) + 50;
}
