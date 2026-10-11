const MAX_BACKOFF_MS = 15 * 60 * 1000;
/** A rate limit is temporary but the server asked us to slow down: never retry sooner than this. */
const RATE_LIMITED_MIN_BACKOFF_MS = 60 * 1000;

// RATE_LIMITED is deliberately absent: it clears by itself, so the outbox retries it with a longer
// backoff instead of asking the user to tap „retry” (audit OFF-6 / P2-3). UNAUTHORIZED stays
// terminal because a stale session will not fix itself by waiting.
const TERMINAL_CODES = new Set([
  'INVALID_INPUT',
  'INVALID_RECEIVER',
  'NOT_FRIEND',
  'UNAUTHORIZED',
  'CONTENT_NOT_ALLOWED',
]);

export function isTerminalTextOutboxCode(code: string | null | undefined) {
  return Boolean(code && TERMINAL_CODES.has(code));
}

export function textOutboxBackoffMs(attemptCount: number, errorCode?: string | null) {
  const normalized = Math.max(1, Math.floor(attemptCount));
  const exponential = Math.min(MAX_BACKOFF_MS, 2 ** Math.min(normalized, 20) * 1000);
  if (errorCode === 'RATE_LIMITED') {
    return Math.min(MAX_BACKOFF_MS, Math.max(RATE_LIMITED_MIN_BACKOFF_MS, exponential));
  }
  return exponential;
}
