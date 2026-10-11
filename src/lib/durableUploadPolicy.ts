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
  // OFF-11: `preparing` (local compression while offline) and `requesting_target` (begin from
  // the background task) both start from a job parked on the network.
  waiting_network: new Set(['queued', 'preparing', 'requesting_target', 'uploading', 'retry_scheduled', 'paused', 'cancelled', 'expired']),
  waiting_for_auth: new Set(['queued', 'requesting_target', 'paused', 'failed', 'cancelled', 'expired']),
  retry_scheduled: new Set(['queued', 'preparing', 'requesting_target', 'uploading', 'waiting_network', 'paused', 'failed', 'cancelled', 'expired']),
  finalizing: new Set(['completed', 'partially_completed', 'retry_scheduled', 'waiting_network', 'waiting_for_auth', 'failed', 'paused', 'cancelled', 'expired']),
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

/**
 * OFF-11: the pipeline has a local phase (compression, thumbnail, fast-path check → a staged
 * prepared file) and a network phase (begin → native transfer → finalize). Only the network
 * phase needs connectivity and a usable session; the local one also runs offline.
 */
export type UploadProcessingMode = 'full' | 'prepare_only';

/** The job still has no prepared (encoded and staged) file; preparing it needs no network. */
export function needsLocalPreparation(job: Pick<DurableUploadJob, 'preparedUri'>) {
  return !job.preparedUri;
}

const NETWORK_PICKABLE_STATES = new Set<UploadJobState>(['queued', 'retry_scheduled', 'waiting_network']);
/** States in which an unprepared job may be prepared without network. */
const OFFLINE_PREPARABLE_STATES = new Set<UploadJobState>(['queued', 'retry_scheduled', 'waiting_network']);

type UploadSelectionJob = Pick<
  DurableUploadJob,
  'id' | 'ownerId' | 'state' | 'preparedUri' | 'nextAttemptAt' | 'authRefreshAttempted'
>;

/**
 * Next job for the single-flight processor. With network (and a usable session) any pickable
 * job runs the full pipeline; without it only jobs that still need local preparation are picked,
 * and they stop after preparation (`prepare_only`). Prepared jobs never run twice offline.
 */
export function selectNextUploadJob<TJob extends UploadSelectionJob>(
  jobs: readonly TJob[],
  {
    ownerId,
    now,
    networkReady,
    busyJobIds,
  }: { ownerId: string; now: number; networkReady: boolean; busyJobIds?: ReadonlySet<string> },
): { job: TJob; mode: UploadProcessingMode } | null {
  for (const job of jobs) {
    if (job.ownerId !== ownerId || busyJobIds?.has(job.id) || (job.nextAttemptAt ?? 0) > now) continue;
    if (networkReady) {
      if (
        NETWORK_PICKABLE_STATES.has(job.state)
        || (job.state === 'waiting_for_auth' && !job.authRefreshAttempted)
      ) {
        return { job, mode: 'full' };
      }
      continue;
    }
    if (OFFLINE_PREPARABLE_STATES.has(job.state) && needsLocalPreparation(job)) {
      return { job, mode: 'prepare_only' };
    }
  }
  return null;
}

/**
 * Prepared jobs that would otherwise sit in a „queued” / due-retry state while there is no
 * network: they are parked as `waiting_network` so the UI shows „Czeka na sieć” and the
 * reconnect effect wakes them.
 */
export function selectPreparedJobsToPark<TJob extends UploadSelectionJob>(
  jobs: readonly TJob[],
  { ownerId, now, busyJobIds }: { ownerId: string; now: number; busyJobIds?: ReadonlySet<string> },
): TJob[] {
  return jobs.filter((job) =>
    job.ownerId === ownerId
    && !busyJobIds?.has(job.id)
    && !needsLocalPreparation(job)
    && (job.state === 'queued' || (job.state === 'retry_scheduled' && (job.nextAttemptAt ?? 0) <= now))
  );
}

/** State written once the prepared file is staged. */
export function stateAfterLocalPreparation(mode: UploadProcessingMode, networkReady: boolean): UploadJobState {
  return mode === 'full' || networkReady ? 'requesting_target' : 'waiting_network';
}

/**
 * Background (BGProcessingTask) advance of the queue. iOS may expire the task at any moment and
 * expo-background-task resolves it only when the JS callback returns, so the work is bounded:
 * a few jobs, a fixed time budget and no compression (only already-prepared jobs).
 */
export const BACKGROUND_ADVANCE_BUDGET_MS = 20_000;
export const BACKGROUND_ADVANCE_MAX_JOBS = 3;
/** Minimal time left for a single network step (begin, native enqueue). */
export const BACKGROUND_ADVANCE_MIN_STEP_MS = 3_000;
/** The access token must stay valid at least this long; otherwise the task does nothing. */
export const BACKGROUND_SESSION_MIN_VALIDITY_MS = 60_000;
/** An upload URL this close to expiry is requested again instead of being handed to URLSession. */
export const UPLOAD_TARGET_MIN_VALIDITY_MS = 60_000;

export const BACKGROUND_ADVANCEABLE_STATES: UploadJobState[] = ['queued', 'waiting_network', 'retry_scheduled'];

export function selectBackgroundAdvanceJobs<
  TJob extends UploadSelectionJob & Pick<DurableUploadJob, 'createdAt' | 'expiresAt'>,
>(
  jobs: readonly TJob[],
  {
    ownerId,
    now,
    limit = BACKGROUND_ADVANCE_MAX_JOBS,
    busyJobIds,
  }: { ownerId: string; now: number; limit?: number; busyJobIds?: ReadonlySet<string> },
): TJob[] {
  return jobs
    .filter((job) =>
      job.ownerId === ownerId
      && !busyJobIds?.has(job.id)
      && !needsLocalPreparation(job)
      && BACKGROUND_ADVANCEABLE_STATES.includes(job.state)
      && (job.nextAttemptAt ?? 0) <= now
      && job.expiresAt > now
    )
    // Oldest first: the NiX recorded first should be delivered first.
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(0, Math.max(0, limit));
}

/** `expiresAtSec` as in a Supabase session (`expires_at`, seconds since epoch). */
export function isBackgroundSessionUsable(
  session: { userId: string | null | undefined; expiresAtSec: number | null | undefined } | null,
  now: number,
) {
  if (!session?.userId || typeof session.expiresAtSec !== 'number') return false;
  return session.expiresAtSec * 1000 - now >= BACKGROUND_SESSION_MIN_VALIDITY_MS;
}

export function remainingBackgroundBudgetMs(
  startedAt: number,
  now: number,
  budgetMs = BACKGROUND_ADVANCE_BUDGET_MS,
) {
  return Math.max(0, startedAt + budgetMs - now);
}

/** The job already holds a begin result that URLSession can still use. */
export function hasReusableUploadTarget(
  job: Pick<
    DurableUploadJob,
    'batchId' | 'uploadUrl' | 'uploadHeaders' | 'uploadUrlExpiresAt' | 'finalizeUrl' | 'finalizeHeaders' | 'finalizeToken'
  >,
  now: number,
) {
  return Boolean(
    job.batchId
    && job.uploadUrl
    && job.uploadHeaders
    && job.finalizeUrl
    && job.finalizeHeaders
    && job.finalizeToken
    && typeof job.uploadUrlExpiresAt === 'number'
    && job.uploadUrlExpiresAt - now >= UPLOAD_TARGET_MIN_VALIDITY_MS
  );
}

export function needsNativeTransferRecovery(snapshot: { state: string; hasActiveTask?: boolean }) {
  return snapshot.hasActiveTask === false
    && ['queued', 'uploading', 'finalizing', 'retry_scheduled', 'waiting_network'].includes(snapshot.state);
}

export function parseFinalizeUploadStatus(
  responseBody: string | null | undefined
): { state: UploadJobState; jobId: string | null } {
  if (!responseBody) return { state: 'completed', jobId: null };
  try {
    const payload = JSON.parse(responseBody) as { status?: unknown; jobId?: unknown };
    const jobId = typeof payload.jobId === 'string' && payload.jobId.length > 0
      ? payload.jobId
      : null;
    if (payload.status === 'partially_completed') {
      return { state: 'partially_completed', jobId };
    }
    if (payload.status === 'moderation_pending') {
      return { state: 'finalizing', jobId };
    }
    if (payload.status === 'failed') {
      return { state: 'failed', jobId };
    }
    return { state: 'completed', jobId };
  } catch {
    return { state: 'completed', jobId: null };
  }
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
    'INVALID_SIZE',
    'MEDIA_TOO_LARGE',
    'OBJECT_SIZE_MISMATCH',
    'INVALID_RECEIVER',
    'NOT_FRIEND',
    'CANCELLED',
    'CONTENT_NOT_ALLOWED',
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

/** Container (MP4 atoms) overhead tolerated on top of the video + audio bitrate. */
const PASSTHROUGH_CONTAINER_OVERHEAD = 0.1;

/**
 * Highest whole-file bitrate (size × 8 / duration) that can be sent without re-encoding.
 *
 * The estimate covers video, audio and the container, so comparing it with the video bitrate
 * alone rejected every camera clip recorded at exactly the target video bitrate (PERF-22). The
 * tolerance applies only when the source dimensions are known to fit the profile; otherwise
 * the strict video-only limit stays, since a low bitrate can hide an oversized frame.
 */
function passthroughBitrateLimit(
  profile: Pick<VideoCompressionProfile, 'bitrate' | 'audioBitrate'>,
  dimensionsWithinLimit: boolean,
) {
  return dimensionsWithinLimit
    ? (profile.bitrate + profile.audioBitrate) * (1 + PASSTHROUGH_CONTAINER_OVERHEAD)
    : profile.bitrate;
}

export function selectVideoCompressionProfile({
  sourceBitrate,
  sourceSizeBytes,
  sourceWidth,
  sourceHeight,
  hevcEnabled,
  hevcSupported,
}: {
  sourceBitrate: number | null;
  sourceSizeBytes: number | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  hevcEnabled: boolean;
  hevcSupported: boolean;
}): VideoCompressionProfile {
  const aggressive = (sourceSizeBytes ?? 0) > 100 * 1024 * 1024;
  const codec = hevcEnabled && hevcSupported ? 'hevc' : 'h264';
  const bitrate = aggressive ? 900_000 : codec === 'hevc' ? 1_200_000 : 1_800_000;
  const maxSize = aggressive ? 960 : 1280;
  const audioBitrate = 96_000;
  const dimensionsKnown = typeof sourceWidth === 'number'
    && typeof sourceHeight === 'number'
    && sourceWidth > 0
    && sourceHeight > 0;
  const dimensionsWithinLimit = dimensionsKnown && Math.max(sourceWidth, sourceHeight) <= maxSize;
  return {
    codec,
    maxSize,
    bitrate,
    audioBitrate,
    passthrough: !aggressive
      && (!dimensionsKnown || dimensionsWithinLimit)
      && typeof sourceBitrate === 'number'
      && sourceBitrate <= passthroughBitrateLimit({ bitrate, audioBitrate }, dimensionsWithinLimit),
    aggressive,
  };
}
