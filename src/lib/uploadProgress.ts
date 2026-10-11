import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';

/**
 * One progress model for every upload consumer (inbox ring, chat, Live Activity) — SEND-3.
 *
 * Each phase owns a fixed band of the 0…1 ring, so a phase change never moves it backwards:
 * processing (compression, thumbnail) 0–0.25, sending (URLSession bytes) 0.25–0.95,
 * confirming (moderation, no measurable progress) 0.95, done 1.
 */
export const PROCESSING_BAND_END = 0.25;
export const SENDING_BAND_END = 0.95;

export type UploadProgressBand = 'processing' | 'sending' | 'confirming' | 'done';

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function toDisplayProgress(band: UploadProgressBand, phaseProgress = 0): number {
  const progress = clamp01(phaseProgress);
  switch (band) {
    case 'processing':
      return progress * PROCESSING_BAND_END;
    case 'sending':
      return PROCESSING_BAND_END + progress * (SENDING_BAND_END - PROCESSING_BAND_END);
    case 'confirming':
      return SENDING_BAND_END;
    case 'done':
      return 1;
  }
}

/**
 * Display progress for a native URLSession snapshot. Snapshots of non-transfer states
 * (paused, waiting_network, retry_scheduled, failed…) carry the raw transfer fraction and must
 * not overwrite the ring — they keep the job's current value.
 */
export function nativeSnapshotDisplayProgress(
  snapshotState: string,
  snapshotProgress: number,
  currentProgress: number,
): number {
  switch (snapshotState) {
    case 'uploading':
      return toDisplayProgress('sending', snapshotProgress);
    case 'queued':
      return Math.max(currentProgress, toDisplayProgress('sending', 0));
    case 'finalizing':
      return toDisplayProgress('confirming');
    case 'completed':
      return toDisplayProgress('done');
    default:
      return currentProgress;
  }
}

const COMPLETED_STATES = new Set<UploadJobState>(['completed', 'partially_completed']);
/** States in which in-memory compression progress (not persisted) is the freshest value. */
const PROCESSING_STATES = new Set<UploadJobState>(['queued', 'preparing']);

/**
 * Progress may only restart when this key changes: a new idempotency key (aggressive re-encode),
 * another attempt (retryCount) or a re-prepare from the source file (prepared copy dropped).
 */
export function uploadAttemptKey(
  job: Pick<DurableUploadJob, 'idempotencyKey' | 'retryCount' | 'preparedUri'>,
) {
  return `${job.idempotencyKey}:${job.retryCount}:${job.preparedUri ? 'prepared' : 'source'}`;
}

export type DisplayProgressTracker = {
  /** Monotonic (per attempt) display progress for a job. */
  apply(job: DurableUploadJob, liveProgress?: number): number;
  /** Explicit new attempt (manual retry) — the next value is taken as is. */
  reset(jobId: string): void;
  /** Drops entries for jobs no longer listed. */
  retain(jobIds: ReadonlySet<string>): void;
  clear(): void;
};

export function createDisplayProgressTracker(): DisplayProgressTracker {
  const entries = new Map<string, { attempt: string; max: number }>();
  return {
    apply(job, liveProgress) {
      const raw = COMPLETED_STATES.has(job.state)
        ? 1
        : clamp01(
            liveProgress !== undefined && PROCESSING_STATES.has(job.state)
              ? Math.max(job.progress, liveProgress)
              : job.progress,
          );
      const attempt = uploadAttemptKey(job);
      const entry = entries.get(job.id);
      if (!entry || entry.attempt !== attempt) {
        entries.set(job.id, { attempt, max: raw });
        return raw;
      }
      entry.max = Math.max(entry.max, raw);
      return entry.max;
    },
    reset(jobId) {
      entries.delete(jobId);
    },
    retain(jobIds) {
      for (const jobId of entries.keys()) {
        if (!jobIds.has(jobId)) entries.delete(jobId);
      }
    },
    clear() {
      entries.clear();
    },
  };
}

/**
 * Jobs as published to the UI: `progress` is replaced by the monotonic display value, so existing
 * consumers that read `job.progress` (inbox, chat, summary) get the same semantics without
 * changes. Unchanged jobs keep their identity.
 */
export function applyDisplayProgress(
  jobs: readonly DurableUploadJob[],
  tracker: DisplayProgressTracker,
  liveProgress: ReadonlyMap<string, number> = new Map(),
): DurableUploadJob[] {
  tracker.retain(new Set(jobs.map((job) => job.id)));
  return jobs.map((job) => {
    const progress = tracker.apply(job, liveProgress.get(job.id));
    return progress === job.progress ? job : { ...job, progress };
  });
}
