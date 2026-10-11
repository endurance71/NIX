export type CleanupPayload = {
  nixId?: string;
  mediaPath?: string;
};

export type CleanupReplayGuardFields = {
  is_viewed?: boolean | null;
  viewed_at?: string | null;
  is_replayed?: boolean | null;
  replay_expires_at?: string | null;
};

export function isValidCleanupPayload(payload: CleanupPayload) {
  return typeof payload?.nixId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.nixId);
}

/**
 * Cleanup media only after replay is consumed or the 10-minute replay window elapsed.
 * The SQL RPC is authoritative. A legacy viewed row may derive its deadline
 * from viewed_at; missing/invalid timestamps never authorize physical cleanup.
 */
export function canCleanupNixMedia(nix: CleanupReplayGuardFields, now: Date = new Date()): boolean {
  if (nix.is_viewed !== true) return false;
  if (nix.is_replayed === true) return true;
  if (nix.replay_expires_at != null) {
    const expiresAt = Date.parse(nix.replay_expires_at);
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt <= now.getTime();
  }
  const viewedAt = Date.parse(nix.viewed_at ?? '');
  return Number.isFinite(viewedAt) && viewedAt + 10 * 60_000 <= now.getTime();
}

export function nextCleanupAttemptDelayMs(attemptCount: number) {
  const baseDelay = Math.max(1, attemptCount) * 60_000;
  return Math.min(15 * 60_000, baseDelay);
}
