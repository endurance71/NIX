export const DATA_EXPORT_ANALYTICS_PREFERENCE_COLUMNS =
  'enabled,policy_version,updated_at';

export const DATA_EXPORT_REAUTH_MAX_AGE_SECONDS = 10 * 60;
export const DATA_EXPORT_SIGNED_URL_TTL_SECONDS = 60;

export function isRecentAuthentication(
  authenticatedAtSeconds: number | null,
  nowSeconds = Date.now() / 1000
) {
  return Boolean(
    authenticatedAtSeconds &&
    authenticatedAtSeconds <= nowSeconds &&
    nowSeconds - authenticatedAtSeconds <= DATA_EXPORT_REAUTH_MAX_AGE_SECONDS
  );
}

/**
 * Latest sign-in time from the JWT `amr` claim. Unlike `iat`, it survives
 * token refreshes, so only a real sign-in or reauthentication moves it.
 */
export function latestAuthenticationTime(claims: unknown): number | null {
  const amr = (claims as { amr?: unknown } | null)?.amr;
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    const timestamp = (entry as { timestamp?: unknown } | null)?.timestamp;
    if (typeof timestamp === 'number' && (latest === null || timestamp > latest)) {
      latest = timestamp;
    }
  }
  return latest;
}

type ExportNix = { sender_id: string; receiver_id: string };

/**
 * Received media is exported as metadata only until the user views it, so the
 * archive cannot bypass view-once. Conversations with blocked peers are left out.
 */
export function partitionExportNixes<T extends ExportNix>(
  rows: T[],
  userId: string,
  blockedPeerIds: ReadonlySet<string>,
) {
  const withMedia: T[] = [];
  const metadataOnly: T[] = [];
  for (const row of rows) {
    const peerId = row.sender_id === userId ? row.receiver_id : row.sender_id;
    if (blockedPeerIds.has(peerId)) continue;
    if (row.sender_id === userId) withMedia.push(row);
    else metadataOnly.push(row);
  }
  return { withMedia, metadataOnly };
}

export function blockedPeerIdsFor(
  userId: string,
  pairs: { blocker_id: string; blocked_id: string }[],
): Set<string> {
  return new Set(pairs.map((pair) => pair.blocker_id === userId ? pair.blocked_id : pair.blocker_id));
}

type ExportDownloadJob = {
  status?: string | null;
  storage_path?: string | null;
  expires_at?: string | null;
};

export function isExportReadyForDownload(
  job: ExportDownloadJob | null,
  nowMs = Date.now()
): job is ExportDownloadJob & {
  status: 'ready';
  storage_path: string;
  expires_at: string;
} {
  if (!job || job.status !== 'ready' || !job.storage_path || !job.expires_at) return false;
  const expiry = new Date(job.expires_at).getTime();
  return Number.isFinite(expiry) && expiry > nowMs;
}
