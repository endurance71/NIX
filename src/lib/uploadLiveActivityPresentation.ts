import type { UploadQueueSummary } from '../types/uploadQueue';

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
};

export function buildUploadLiveActivityProps(
  summary: UploadQueueSummary,
  updatedAt = Date.now()
): UploadLiveActivityProps {
  const phase = summary.failedCount > 0
    || summary.phase === 'failed'
    || summary.phase === 'waiting_for_auth'
    || summary.phase === 'retry_scheduled'
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
  };
}
