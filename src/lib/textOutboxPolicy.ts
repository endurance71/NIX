const MAX_BACKOFF_MS = 15 * 60 * 1000;

const TERMINAL_CODES = new Set([
  'INVALID_INPUT',
  'INVALID_RECEIVER',
  'NOT_FRIEND',
  'RATE_LIMITED',
  'UNAUTHORIZED',
]);

export function isTerminalTextOutboxCode(code: string | null | undefined) {
  return Boolean(code && TERMINAL_CODES.has(code));
}

export function textOutboxBackoffMs(attemptCount: number) {
  const normalized = Math.max(1, Math.floor(attemptCount));
  return Math.min(MAX_BACKOFF_MS, 2 ** Math.min(normalized, 20) * 1000);
}
