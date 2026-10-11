import { describe, expect, it } from 'vitest';

import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import {
  applyDisplayProgress,
  createDisplayProgressTracker,
  nativeSnapshotDisplayProgress,
  toDisplayProgress,
} from './uploadProgress';

function job(
  state: UploadJobState,
  progress: number,
  overrides: Partial<DurableUploadJob> = {},
): DurableUploadJob {
  return {
    id: 'job',
    idempotencyKey: 'job',
    ownerId: 'owner',
    mediaType: 'video',
    state,
    stagedUri: 'file:///source.mp4',
    preparedUri: null,
    contentType: null,
    fileExtension: null,
    originalSizeBytes: null,
    finalSizeBytes: null,
    playbackDurationMs: null,
    sourceWidth: null,
    sourceHeight: null,
    thumbnailB64: null,
    batchId: null,
    assetId: null,
    storagePath: null,
    uploadUrl: null,
    uploadHeaders: null,
    uploadUrlExpiresAt: null,
    finalizeUrl: null,
    finalizeHeaders: null,
    finalizeToken: null,
    moderationJobId: null,
    progress,
    bytesSent: 0,
    bytesTotal: 0,
    retryCount: 0,
    authRefreshAttempted: false,
    nextAttemptAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: 1,
    updatedAt: 1,
    expiresAt: 999_999,
    startedAt: null,
    finishedAt: null,
    recipients: [],
    ...overrides,
  };
}

describe('toDisplayProgress', () => {
  it('maps every phase into its own band', () => {
    expect(toDisplayProgress('processing', 0)).toBe(0);
    expect(toDisplayProgress('processing', 1)).toBe(0.25);
    expect(toDisplayProgress('sending', 0)).toBe(0.25);
    expect(toDisplayProgress('sending', 1)).toBeCloseTo(0.95);
    expect(toDisplayProgress('sending', 0.5)).toBeCloseTo(0.6);
    expect(toDisplayProgress('confirming')).toBe(0.95);
    expect(toDisplayProgress('done')).toBe(1);
  });

  it('clamps invalid phase progress', () => {
    expect(toDisplayProgress('sending', Number.NaN)).toBe(0.25);
    expect(toDisplayProgress('processing', 3)).toBe(0.25);
    expect(toDisplayProgress('processing', -1)).toBe(0);
  });
});

describe('nativeSnapshotDisplayProgress', () => {
  it('keeps the current value for paused, waiting and queued snapshots', () => {
    expect(nativeSnapshotDisplayProgress('paused', 0.1, 0.7)).toBe(0.7);
    expect(nativeSnapshotDisplayProgress('waiting_network', 0, 0.7)).toBe(0.7);
    expect(nativeSnapshotDisplayProgress('retry_scheduled', 0, 0.6)).toBe(0.6);
    expect(nativeSnapshotDisplayProgress('queued', 0, 0.6)).toBe(0.6);
    expect(nativeSnapshotDisplayProgress('queued', 0, 0.1)).toBe(0.25);
  });

  it('maps transfer, moderation and completion into their bands', () => {
    expect(nativeSnapshotDisplayProgress('uploading', 0.5, 0.3)).toBeCloseTo(0.6);
    expect(nativeSnapshotDisplayProgress('finalizing', 1, 0.9)).toBe(0.95);
    expect(nativeSnapshotDisplayProgress('completed', 1, 0.95)).toBe(1);
  });
});

describe('display progress tracker', () => {
  it('never moves backwards within one attempt', () => {
    const tracker = createDisplayProgressTracker();
    expect(tracker.apply(job('uploading', 0.6))).toBe(0.6);
    expect(tracker.apply(job('paused', 0.1))).toBe(0.6);
    expect(tracker.apply(job('waiting_network', 0))).toBe(0.6);
    expect(tracker.apply(job('uploading', 0.7))).toBe(0.7);
  });

  it('restarts on a new attempt and on an explicit reset', () => {
    const tracker = createDisplayProgressTracker();
    tracker.apply(job('uploading', 0.8));
    expect(tracker.apply(job('uploading', 0.3, { idempotencyKey: 'job:aggressive:1' }))).toBe(0.3);
    tracker.apply(job('uploading', 0.8, { retryCount: 1 }));
    expect(tracker.apply(job('uploading', 0.3, { retryCount: 2 }))).toBe(0.3);
    tracker.apply(job('uploading', 0.9, { retryCount: 2 }));
    tracker.reset('job');
    expect(tracker.apply(job('queued', 0.25, { retryCount: 2 }))).toBe(0.25);
  });

  it('uses live compression progress only while the job is processing', () => {
    const tracker = createDisplayProgressTracker();
    expect(tracker.apply(job('preparing', 0.01), 0.12)).toBe(0.12);
    expect(tracker.apply(job('queued', 0.01), 0.2)).toBe(0.2);
    // The prepared copy now exists (new attempt key) — live value from the old phase is ignored.
    expect(tracker.apply(job('requesting_target', 0.25, { preparedUri: 'file:///p.mp4' }), 0.24)).toBe(0.25);
  });

  it('shows completion as full', () => {
    expect(createDisplayProgressTracker().apply(job('completed', 0.95))).toBe(1);
  });

  it('keeps unchanged job identities and drops forgotten jobs', () => {
    const tracker = createDisplayProgressTracker();
    const unchanged = job('uploading', 0.5);
    const [published] = applyDisplayProgress([unchanged], tracker);
    expect(published).toBe(unchanged);

    applyDisplayProgress([job('uploading', 0.9)], tracker);
    applyDisplayProgress([], tracker);
    expect(applyDisplayProgress([job('uploading', 0.4)], tracker)[0].progress).toBe(0.4);
  });

  it('publishes the monotonic value through job.progress', () => {
    const tracker = createDisplayProgressTracker();
    applyDisplayProgress([job('uploading', 0.8)], tracker);
    const [published] = applyDisplayProgress([job('paused', 0.2)], tracker);
    expect(published.progress).toBe(0.8);
    expect(published.state).toBe('paused');
  });
});
