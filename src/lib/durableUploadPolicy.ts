import type {
  DurableUploadJob,
  UploadJobState,
  UploadQueueSummary,
} from '../types/uploadQueue';

export const UPLOAD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const UPLOAD_RETRY_DELAYS_MS = [
  5_000,
  15_000,
  60_000,
  300_000,
  900_000,
  3_600_000,
  21_600_000,
] as const;

/** Faster backoff for small image uploads (foreground path). */
export const IMAGE_UPLOAD_RETRY_DELAYS_MS = [
  1_000,
  3_000,
  10_000,
  30_000,
  120_000,
  600_000,
  3_600_000,
] as const;

const TERMINAL_STATES = new Set<UploadJobState>([
  'completed',
  'partially_completed',
  'cancelled',
  'expired',
]);

const STATE_TRANSITIONS: Record<UploadJobState, ReadonlySet<UploadJobState>> = {
  staging: new Set(['queued', 'waiting_network', 'failed', 'cancelled', 'expired']),
  queued: new Set(['preparing', 'requesting_target', 'uploading', 'waiting_network', 'paused', 'failed', 'cancelled', 'expired']),
  preparing: new Set(['requesting_target', 'retry_scheduled', 'waiting_network', 'failed', 'paused', 'cancelled', 'expired']),
  requesting_target: new Set(['uploading', 'retry_scheduled', 'waiting_network', 'waiting_for_auth', 'failed', 'paused', 'cancelled', 'expired']),
  uploading: new Set(['waiting_network', 'waiting_for_auth', 'retry_scheduled', 'finalizing', 'failed', 'paused', 'cancelled', 'expired']),
  waiting_network: new Set(['queued', 'uploading', 'retry_scheduled', 'paused', 'cancelled', 'expired']),
  waiting_for_auth: new Set(['queued', 'requesting_target', 'paused', 'failed', 'cancelled', 'expired']),
  retry_scheduled: new Set(['queued', 'preparing', 'requesting_target', 'uploading', 'waiting_network', 'paused', 'failed', 'cancelled', 'expired']),
  finalizing: new Set(['completed', 'partially_completed', 'retry_scheduled', 'waiting_network', 'waiting_for_auth', 'failed', 'cancelled', 'expired']),
  completed: new Set(),
  partially_completed: new Set(),
  failed: new Set(['queued', 'paused', 'cancelled', 'expired']),
  paused: new Set(['queued', 'waiting_network', 'cancelled', 'expired']),
  cancelled: new Set(),
  expired: new Set(),
};

export function isTerminalUploadState(state: UploadJobState) {
  return TERMINAL_STATES.has(state);
}

export function isAllowedUploadTransition(from: UploadJobState, to: UploadJobState) {
  return from === to || STATE_TRANSITIONS[from].has(to);
}

export function initialDurableUploadState(physicalOnline: boolean, hasNetworkSession: boolean): UploadJobState {
  return physicalOnline && hasNetworkSession ? 'queued' : 'waiting_network';
}

export function mapNativeUploadState(state: string): UploadJobState {
  switch (state) {
    case 'queued':
      // Native "queued" = URLSession task scheduled. JS "queued" means processJob
      // should start — never bounce an in-flight native job back to the JS picker.
      return 'uploading';
    case 'uploading':
    case 'retry_scheduled':
    case 'waiting_network':
    case 'waiting_for_auth':
    case 'finalizing':
    case 'completed':
    case 'failed':
    case 'paused':
    case 'cancelled':
      return state;
    default:
      return 'uploading';
  }
}

export function buildUploadQueueSummary(jobs: DurableUploadJob[]): UploadQueueSummary {
  const visible = jobs.filter((job) => job.state !== 'cancelled' && job.state !== 'expired');
  const active = visible.filter((job) => !isTerminalUploadState(job.state) && job.state !== 'failed');
  const failed = visible.filter((job) => job.state === 'failed');
  const waiting = active.filter((job) =>
    ['waiting_network', 'waiting_for_auth', 'retry_scheduled', 'paused'].includes(job.state)
  );
  const completed = visible.filter((job) =>
    job.state === 'completed' || job.state === 'partially_completed'
  );
  const progress = active.length > 0
    ? active.reduce((sum, job) => sum + job.progress, 0) / active.length
    : completed.length > 0
      ? 1
      : 0;
  const activePhase = [
    'waiting_for_auth',
    'retry_scheduled',
    'waiting_network',
    'paused',
    'preparing',
    'requesting_target',
    'uploading',
    'finalizing',
    'queued',
    'staging',
  ].find((state) => active.some((job) => job.state === state)) as UploadJobState | undefined;

  return {
    activeCount: active.length,
    waitingCount: waiting.length,
    failedCount: failed.length,
    completedCount: completed.length,
    progress,
    phase: failed[0]?.state ?? activePhase ?? completed[0]?.state ?? null,
  };
}

export function uploadRetryDelay(
  retryCount: number,
  random: () => number = Math.random,
  mediaType: 'image' | 'video' = 'video'
) {
  const normalizedCount = Math.max(0, Math.floor(retryCount));
  const table = mediaType === 'image' ? IMAGE_UPLOAD_RETRY_DELAYS_MS : UPLOAD_RETRY_DELAYS_MS;
  const base = table[Math.min(normalizedCount, table.length - 1)];
  return Math.round(base * (0.8 + random() * 0.4));
}

export function isPermanentUploadError(error: unknown) {
  const code =
    typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
  return [
    'INVALID_MEDIA',
    'INVALID_RECEIVER',
    'NOT_FRIEND',
    'CANCELLED',
    'FILE_TOO_LARGE_PERMANENT',
    'FILE_NOT_RECOVERABLE',
  ].includes(code);
}

/** Native enqueue / staging lost the local file copy. */
export function isMissingStagedUploadError(error: unknown) {
  const code =
    typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
  if (code === 'FILE_NOT_RECOVERABLE' || code === 'STAGED_FILE_MISSING') return true;
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  return /staged upload file does not exist/i.test(message);
}

export type VideoCompressionProfile = {
  codec: 'h264' | 'hevc';
  maxSize: 1280 | 960;
  bitrate: 1_800_000 | 1_200_000 | 900_000;
  audioBitrate: 96_000;
  passthrough: boolean;
  aggressive: boolean;
};

export function selectVideoCompressionProfile({
  sourceBitrate,
  sourceSizeBytes,
  hevcEnabled,
  hevcSupported,
}: {
  sourceBitrate: number | null;
  sourceSizeBytes: number | null;
  hevcEnabled: boolean;
  hevcSupported: boolean;
}): VideoCompressionProfile {
  const aggressive = (sourceSizeBytes ?? 0) > 100 * 1024 * 1024;
  const codec = hevcEnabled && hevcSupported ? 'hevc' : 'h264';
  const bitrate = aggressive ? 900_000 : codec === 'hevc' ? 1_200_000 : 1_800_000;
  return {
    codec,
    maxSize: aggressive ? 960 : 1280,
    bitrate,
    audioBitrate: 96_000,
    passthrough: !aggressive
      && typeof sourceBitrate === 'number'
      && sourceBitrate <= bitrate,
    aggressive,
  };
}
