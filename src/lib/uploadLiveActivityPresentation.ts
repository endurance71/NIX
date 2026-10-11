import type { DurableUploadJob, UploadJobState, UploadQueueSummary } from '../types/uploadQueue';

export type UploadLiveActivityPhase =
  | 'preparing'
  | 'uploading'
  | 'waiting_network'
  | 'paused'
  | 'finalizing'
  | 'completed'
  | 'failed';

export type UploadLiveActivityProps = {
  phase: UploadLiveActivityPhase;
  progress: number;
  remainingCount: number;
  updatedAt: number;
  locale: 'pl' | 'en';
};

export function buildUploadLiveActivityProps(
  summary: UploadQueueSummary,
  updatedAt = Date.now(),
  locale: 'pl' | 'en' = 'en'
): UploadLiveActivityProps {
  // An automatic retry is still „sending” for the user; only a terminal failure or a lost
  // session needs their attention.
  const phase = summary.failedCount > 0
    || summary.phase === 'failed'
    || summary.phase === 'waiting_for_auth'
    ? 'failed'
    : summary.phase === 'waiting_network'
      ? 'waiting_network'
      : summary.phase === 'paused'
        ? 'paused'
      : summary.phase === 'preparing'
        ? 'preparing'
        : summary.phase === 'finalizing'
          ? 'finalizing'
          : summary.activeCount === 0 && summary.completedCount > 0
            ? 'completed'
            : 'uploading';

  return {
    phase,
    progress: summary.progress,
    remainingCount: summary.activeCount + summary.failedCount,
    updatedAt,
    locale,
  };
}

/**
 * Queue view reported to the native uploader (SEND-2). While the app is in the background the
 * native layer is the only Live Activity writer, but it only sees URLSession transfers — this
 * tells it about compression, `begin` and moderation still pending, so it never shows „Sent”
 * too early. Only unfinished jobs are sent; `progress` is the banded display progress.
 */
export type UploadLiveActivityNativeState = {
  version: 1;
  updatedAt: number;
  locale: 'pl' | 'en';
  jobs: { id: string; state: UploadJobState; progress: number }[];
};

const FINISHED_UPLOAD_STATES = new Set<UploadJobState>([
  'completed',
  'partially_completed',
  'cancelled',
  'expired',
]);

export function buildUploadLiveActivityNativeState(
  jobs: readonly Pick<DurableUploadJob, 'id' | 'state' | 'progress'>[],
  updatedAt = Date.now(),
  locale: 'pl' | 'en' = 'en'
): UploadLiveActivityNativeState {
  return {
    version: 1,
    updatedAt,
    locale,
    jobs: jobs
      .filter((job) => !FINISHED_UPLOAD_STATES.has(job.state))
      .map((job) => ({
        id: job.id,
        state: job.state,
        // Three decimals: enough for a 1 % ring, and identical reports stay identical.
        progress: Math.round(Math.max(0, Math.min(1, Number.isFinite(job.progress) ? job.progress : 0)) * 1000) / 1000,
      })),
  };
}
