export type CleanupPayload = {
  nixId?: string;
  mediaPath?: string;
};

export type CleanupReplayGuardFields = {
  is_replayed?: boolean | null;
  replay_expires_at?: string | null;
};

export function isValidCleanupPayload(payload: CleanupPayload) {
  return Boolean(payload.nixId && payload.mediaPath);
}

/**
 * Cleanup media only after replay is consumed or the 10-minute replay window elapsed.
 * Legacy rows without a replay deadline remain eligible (queued jobs from older clients).
 */
export function canCleanupNixMedia(nix: CleanupReplayGuardFields, now: Date = new Date()): boolean {
  if (nix.is_replayed === true) return true;
  if (nix.replay_expires_at != null) {
    const expiresAt = Date.parse(nix.replay_expires_at);
    if (!Number.isFinite(expiresAt)) return true;
    return expiresAt <= now.getTime();
  }
  return true;
}

export function nextCleanupAttemptDelayMs(attemptCount: number) {
  const baseDelay = Math.max(1, attemptCount) * 60_000;
  return Math.min(15 * 60_000, baseDelay);
}
