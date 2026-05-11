export type CleanupPayload = {
  nixId?: string;
  mediaPath?: string;
};

export function isValidCleanupPayload(payload: CleanupPayload) {
  return Boolean(payload.nixId && payload.mediaPath);
}

export function nextCleanupAttemptDelayMs(attemptCount: number) {
  const baseDelay = Math.max(1, attemptCount) * 60_000;
  return Math.min(15 * 60_000, baseDelay);
}
