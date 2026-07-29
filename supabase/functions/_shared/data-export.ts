export const DATA_EXPORT_ANALYTICS_PREFERENCE_COLUMNS =
  'enabled,policy_version,updated_at';

export const DATA_EXPORT_REAUTH_MAX_AGE_SECONDS = 10 * 60;
export const DATA_EXPORT_SIGNED_URL_TTL_SECONDS = 60;

export function isRecentAuthentication(
  issuedAtSeconds: number | null,
  nowSeconds = Date.now() / 1000
) {
  return Boolean(
    issuedAtSeconds &&
    issuedAtSeconds <= nowSeconds &&
    nowSeconds - issuedAtSeconds <= DATA_EXPORT_REAUTH_MAX_AGE_SECONDS
  );
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
