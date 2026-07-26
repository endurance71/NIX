export type NixReplayFields = {
  direction?: 'sent' | 'received';
  is_viewed: boolean;
  is_replayed: boolean;
  replay_expires_at: string | null;
  media_path?: string | null;
  status?: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed' | string | null;
};

/** Czy odbiorca może jeszcze raz otworzyć NiXa (okno replay ×1, 10 min). */
export function isNixReplayAvailable(nix: NixReplayFields, now: Date = new Date()): boolean {
  if (nix.direction === 'sent') return false;
  if (!nix.is_viewed || nix.is_replayed) return false;
  if (!nix.media_path) return false;
  if (nix.status === 'cleaned' || nix.status === 'cleanup_failed') return false;
  if (!nix.replay_expires_at) return false;
  const expiresAt = Date.parse(nix.replay_expires_at);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > now.getTime();
}

/** Pierwsze otwarcie (nieprzeczytany) — tap. */
export function isNixFirstOpenAvailable(nix: NixReplayFields): boolean {
  if (nix.direction === 'sent') return false;
  if (nix.is_viewed) return false;
  if (!nix.media_path) return false;
  if (nix.status === 'cleaned' || nix.status === 'cleanup_failed') return false;
  return true;
}
