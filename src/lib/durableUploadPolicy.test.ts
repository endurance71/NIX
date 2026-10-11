import { describe, expect, it } from 'vitest';

import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import {
  BACKGROUND_ADVANCE_BUDGET_MS,
  BACKGROUND_ADVANCE_MAX_JOBS,
  BACKGROUND_SESSION_MIN_VALIDITY_MS,
  UPLOAD_RETRY_DELAYS_MS,
  UPLOAD_TARGET_MIN_VALIDITY_MS,
  buildUploadQueueSummary,
  hasReusableUploadTarget,
  isBackgroundSessionUsable,
  needsLocalPreparation,
  remainingBackgroundBudgetMs,
  selectBackgroundAdvanceJobs,
  selectNextUploadJob,
  selectPreparedJobsToPark,
  stateAfterLocalPreparation,
  isAllowedUploadTransition,
  initialDurableUploadState,
  isMissingStagedUploadError,
  isPermanentUploadError,
  mapNativeUploadState,
  needsNativeTransferRecovery,
  selectVideoCompressionProfile,
  parseFinalizeUploadStatus,
  uploadRetryDelay,
} from './durableUploadPolicy';
import {
  PROCESSING_BAND_END,
  createDisplayProgressTracker,
  toDisplayProgress,
} from './uploadProgress';

function job(state: UploadJobState, progress = 0): DurableUploadJob {
  return {
    id: `${state}-${progress}`,
    idempotencyKey: `${state}-${progress}`,
    ownerId: 'owner',
    mediaType: 'image',
    state,
    stagedUri: 'file:///source.jpg',
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
    expiresAt: 2,
    startedAt: null,
    finishedAt: null,
    recipients: [],
  };
}

describe('durable upload state policy', () => {
  it('allows recovery transitions but never revives completed jobs', () => {
    expect(isAllowedUploadTransition('staging', 'queued')).toBe(true);
    expect(isAllowedUploadTransition('staging', 'waiting_network')).toBe(true);
    expect(isAllowedUploadTransition('uploading', 'waiting_network')).toBe(true);
    expect(isAllowedUploadTransition('failed', 'queued')).toBe(true);
    expect(isAllowedUploadTransition('completed', 'queued')).toBe(false);
    expect(isAllowedUploadTransition('finalizing', 'paused')).toBe(true);
    expect(isAllowedUploadTransition('cancelled', 'uploading')).toBe(false);
  });

  it('reconstructs disappeared ephemeral tasks while retaining terminal/control snapshots', () => {
    for (const state of ['queued', 'uploading', 'finalizing', 'retry_scheduled', 'waiting_network']) {
      expect(needsNativeTransferRecovery({ state, hasActiveTask: false })).toBe(true);
      expect(needsNativeTransferRecovery({ state, hasActiveTask: true })).toBe(false);
    }
    for (const state of ['completed', 'failed', 'waiting_for_auth', 'paused', 'cancelled']) {
      expect(needsNativeTransferRecovery({ state, hasActiveTask: false })).toBe(false);
    }
    expect(needsNativeTransferRecovery({ state: 'uploading' })).toBe(false);
  });

  it('queues offline captures without making them processable', () => {
    expect(initialDurableUploadState(false, true)).toBe('waiting_network');
    expect(initialDurableUploadState(true, false)).toBe('waiting_network');
    expect(initialDurableUploadState(true, true)).toBe('queued');
  });

  it('aggregates active progress and exposes failures first', () => {
    expect(buildUploadQueueSummary([
      job('uploading', 0.25),
      job('waiting_network', 0.75),
      job('failed', 0.4),
      job('completed', 1),
      job('cancelled', 0),
    ])).toEqual({
      activeCount: 2,
      waitingCount: 1,
      failedCount: 1,
      completedCount: 1,
      progress: 0.5,
      phase: 'failed',
    });
  });

  it('prioritizes a scheduled retry over concurrent upload progress', () => {
    expect(buildUploadQueueSummary([
      job('uploading', 0.5),
      job('retry_scheduled', 0.25),
    ]).phase).toBe('retry_scheduled');
  });

  it('uses the documented retry ladder, jitter and six-hour tail', () => {
    expect(uploadRetryDelay(0, () => 0.5)).toBe(5_000);
    expect(uploadRetryDelay(5, () => 0.5)).toBe(3_600_000);
    expect(uploadRetryDelay(30, () => 0.5)).toBe(21_600_000);
    expect(uploadRetryDelay(0, () => 0)).toBe(UPLOAD_RETRY_DELAYS_MS[0] * 0.8);
    expect(uploadRetryDelay(0, () => 1)).toBe(UPLOAD_RETRY_DELAYS_MS[0] * 1.2);
    expect(uploadRetryDelay(0, () => 0.5, 'image')).toBe(1_000);
    expect(uploadRetryDelay(2, () => 0.5, 'image')).toBe(10_000);
  });

  it('separates permanent validation failures from transient failures', () => {
    expect(isPermanentUploadError({ code: 'INVALID_RECEIVER' })).toBe(true);
    expect(isPermanentUploadError({ code: 'FILE_TOO_LARGE_PERMANENT' })).toBe(true);
    expect(isPermanentUploadError({ code: 'FILE_NOT_RECOVERABLE' })).toBe(true);
    expect(isPermanentUploadError({ code: 'CONTENT_NOT_ALLOWED' })).toBe(true);
    expect(isPermanentUploadError({ code: 'NETWORK_ERROR' })).toBe(false);
    expect(isPermanentUploadError(new Error('timeout'))).toBe(false);
    expect(isMissingStagedUploadError(new Error('Staged upload file does not exist.'))).toBe(true);
    expect(isMissingStagedUploadError({ code: 'STAGED_FILE_MISSING' })).toBe(true);
  });

  it('does not treat moderation_pending finalize as delivered', () => {
    expect(parseFinalizeUploadStatus(JSON.stringify({
      ok: true,
      status: 'moderation_pending',
      jobId: 'job-1',
    }))).toEqual({ state: 'finalizing', jobId: 'job-1' });
    expect(parseFinalizeUploadStatus(JSON.stringify({
      ok: true,
      status: 'completed',
    }))).toEqual({ state: 'completed', jobId: null });
    expect(parseFinalizeUploadStatus(JSON.stringify({
      ok: true,
      status: 'partially_completed',
    }))).toEqual({ state: 'partially_completed', jobId: null });
  });

  it('maps native queued to uploading so JS does not re-pick the job', () => {
    expect(mapNativeUploadState('queued')).toBe('uploading');
    expect(mapNativeUploadState('uploading')).toBe('uploading');
    expect(mapNativeUploadState('finalizing')).toBe('finalizing');
  });
});

describe('video compression policy', () => {
  it('keeps HEVC disabled unless both flag and device support are present', () => {
    expect(selectVideoCompressionProfile({
      sourceBitrate: 3_000_000,
      sourceSizeBytes: 20_000_000,
      hevcEnabled: false,
      hevcSupported: true,
    })).toMatchObject({ codec: 'h264', bitrate: 1_800_000, maxSize: 1280 });
  });

  it('uses HEVC only when explicitly enabled', () => {
    expect(selectVideoCompressionProfile({
      sourceBitrate: 2_000_000,
      sourceSizeBytes: 20_000_000,
      hevcEnabled: true,
      hevcSupported: true,
    })).toMatchObject({ codec: 'hevc', bitrate: 1_200_000, maxSize: 1280 });
  });

  it('passes a camera clip through when audio and container overhead push it over the video bitrate', () => {
    // 720p camera recording: 1.8 Mb/s video + ~128 kb/s AAC + MP4 atoms ≈ 1.97 Mb/s for the whole file.
    expect(selectVideoCompressionProfile({
      sourceBitrate: 1_970_000,
      sourceSizeBytes: 5_000_000,
      sourceWidth: 720,
      sourceHeight: 1280,
      hevcEnabled: false,
      hevcSupported: false,
    }).passthrough).toBe(true);
    // Above video + audio + 10% it is re-encoded.
    expect(selectVideoCompressionProfile({
      sourceBitrate: 2_100_000,
      sourceSizeBytes: 5_000_000,
      sourceWidth: 720,
      sourceHeight: 1280,
      hevcEnabled: false,
      hevcSupported: false,
    }).passthrough).toBe(false);
  });

  it('keeps the strict video-only limit when dimensions are unknown', () => {
    const profile = (sourceBitrate: number) => selectVideoCompressionProfile({
      sourceBitrate,
      sourceSizeBytes: 5_000_000,
      hevcEnabled: false,
      hevcSupported: false,
    });
    expect(profile(1_800_000).passthrough).toBe(true);
    expect(profile(1_970_000).passthrough).toBe(false);
  });

  it('never passes through a frame larger than the profile, whatever the bitrate', () => {
    expect(selectVideoCompressionProfile({
      sourceBitrate: 1_000_000,
      sourceSizeBytes: 5_000_000,
      sourceWidth: 1080,
      sourceHeight: 1920,
      hevcEnabled: false,
      hevcSupported: false,
    }).passthrough).toBe(false);
  });

  it('selects the aggressive profile over 100 MB and passes through low bitrate input', () => {
    expect(selectVideoCompressionProfile({
      sourceBitrate: 800_000,
      sourceSizeBytes: 101 * 1024 * 1024,
      hevcEnabled: false,
      hevcSupported: false,
    })).toMatchObject({
      codec: 'h264',
      bitrate: 900_000,
      maxSize: 960,
      audioBitrate: 96_000,
      aggressive: true,
      passthrough: false,
    });
  });
});

describe('offline preparation pipeline (OFF-11)', () => {
  const NOW = 1_000_000;
  function pipelineJob(
    id: string,
    state: UploadJobState,
    patch: Partial<DurableUploadJob> = {},
  ): DurableUploadJob {
    return { ...job(state), id, idempotencyKey: id, expiresAt: NOW * 10, ...patch };
  }
  const prepared = { preparedUri: 'file:///prepared.mp4' };

  it('prepares unprepared jobs offline but never sends or re-prepares', () => {
    const jobs = [
      pipelineJob('ready', 'waiting_network', prepared),
      pipelineJob('raw', 'waiting_network'),
    ];
    expect(selectNextUploadJob(jobs, { ownerId: 'owner', now: NOW, networkReady: false }))
      .toEqual({ job: jobs[1], mode: 'prepare_only' });
    expect(selectNextUploadJob([jobs[0]], { ownerId: 'owner', now: NOW, networkReady: false })).toBeNull();
  });

  it('offline: honours retry backoff, ownership, busy jobs and non-preparable states', () => {
    const options = { ownerId: 'owner', now: NOW, networkReady: false };
    expect(selectNextUploadJob([pipelineJob('later', 'waiting_network', { nextAttemptAt: NOW + 1 })], options)).toBeNull();
    expect(selectNextUploadJob([pipelineJob('other', 'queued', { ownerId: 'someone' })], options)).toBeNull();
    expect(selectNextUploadJob([pipelineJob('busy', 'queued')], { ...options, busyJobIds: new Set(['busy']) })).toBeNull();
    for (const state of ['paused', 'failed', 'waiting_for_auth', 'preparing', 'uploading', 'cancelled'] as const) {
      expect(selectNextUploadJob([pipelineJob(state, state)], options)).toBeNull();
    }
    for (const state of ['queued', 'retry_scheduled', 'waiting_network'] as const) {
      expect(selectNextUploadJob([pipelineJob(state, state)], options)?.mode).toBe('prepare_only');
    }
  });

  it('online: runs the full pipeline, including prepared jobs parked on the network', () => {
    const options = { ownerId: 'owner', now: NOW, networkReady: true };
    expect(selectNextUploadJob([pipelineJob('ready', 'waiting_network', prepared)], options)?.mode).toBe('full');
    expect(selectNextUploadJob([pipelineJob('auth', 'waiting_for_auth')], options)?.mode).toBe('full');
    expect(selectNextUploadJob([
      pipelineJob('auth', 'waiting_for_auth', { authRefreshAttempted: true }),
    ], options)).toBeNull();
    expect(selectNextUploadJob([pipelineJob('paused', 'paused', prepared)], options)).toBeNull();
  });

  it('parks prepared jobs on the network only while offline-pickable', () => {
    const jobs = [
      pipelineJob('queued', 'queued', prepared),
      pipelineJob('due-retry', 'retry_scheduled', { ...prepared, nextAttemptAt: NOW }),
      pipelineJob('future-retry', 'retry_scheduled', { ...prepared, nextAttemptAt: NOW + 1 }),
      pipelineJob('raw', 'queued'),
      pipelineJob('uploading', 'uploading', prepared),
      pipelineJob('busy', 'queued', prepared),
    ];
    expect(selectPreparedJobsToPark(jobs, { ownerId: 'owner', now: NOW, busyJobIds: new Set(['busy']) })
      .map((candidate) => candidate.id)).toEqual(['queued', 'due-retry']);
  });

  it('ends preparation parked on the network only when it cannot continue', () => {
    expect(stateAfterLocalPreparation('prepare_only', false)).toBe('waiting_network');
    expect(stateAfterLocalPreparation('prepare_only', true)).toBe('requesting_target');
    expect(stateAfterLocalPreparation('full', false)).toBe('requesting_target');
    expect(needsLocalPreparation({ preparedUri: null })).toBe(true);
    expect(needsLocalPreparation(prepared)).toBe(false);
    expect(isAllowedUploadTransition('waiting_network', 'preparing')).toBe(true);
    expect(isAllowedUploadTransition('preparing', 'waiting_network')).toBe(true);
    expect(isAllowedUploadTransition('waiting_network', 'requesting_target')).toBe(true);
  });

  it('keeps the ring at the end of processing across offline wait and reconnect', () => {
    const tracker = createDisplayProgressTracker();
    const base = pipelineJob('nix', 'preparing', { progress: toDisplayProgress('processing', 0.04) });
    // Compression progress is live-only while preparing.
    expect(tracker.apply(base, toDisplayProgress('processing', 0.8))).toBeCloseTo(0.2);
    const parked = { ...base, ...prepared, state: 'waiting_network' as const, progress: PROCESSING_BAND_END };
    expect(tracker.apply(parked)).toBe(PROCESSING_BAND_END);
    // Back online: woken to queued, then begin. Never restarts at 0.
    expect(tracker.apply({ ...parked, state: 'queued' })).toBe(PROCESSING_BAND_END);
    expect(tracker.apply({ ...parked, state: 'requesting_target' })).toBe(PROCESSING_BAND_END);
    expect(tracker.apply({ ...parked, state: 'uploading', progress: toDisplayProgress('sending', 0.5) }))
      .toBeCloseTo(0.6);
  });
});

describe('background queue advance (OFF-11)', () => {
  const NOW = 5_000_000;
  function candidate(id: string, state: UploadJobState, patch: Partial<DurableUploadJob> = {}): DurableUploadJob {
    return {
      ...job(state),
      id,
      idempotencyKey: id,
      preparedUri: `file:///${id}.mp4`,
      expiresAt: NOW + 1_000,
      ...patch,
    };
  }

  it('advances only prepared, due, unexpired jobs of the session owner, oldest first and bounded', () => {
    const jobs = [
      candidate('newest', 'waiting_network', { createdAt: 50 }),
      candidate('oldest', 'queued', { createdAt: 10 }),
      candidate('retry', 'retry_scheduled', { createdAt: 20, nextAttemptAt: NOW }),
      candidate('mid', 'waiting_network', { createdAt: 30 }),
      candidate('raw', 'waiting_network', { preparedUri: null }),
      candidate('backoff', 'retry_scheduled', { nextAttemptAt: NOW + 1 }),
      candidate('expired', 'queued', { expiresAt: NOW }),
      candidate('foreign', 'queued', { ownerId: 'someone' }),
      candidate('auth', 'waiting_for_auth'),
      candidate('paused', 'paused'),
      candidate('busy', 'queued', { createdAt: 1 }),
    ];
    const selected = selectBackgroundAdvanceJobs(jobs, {
      ownerId: 'owner',
      now: NOW,
      busyJobIds: new Set(['busy']),
    });
    expect(selected.map((selectedJob) => selectedJob.id)).toEqual(['oldest', 'retry', 'mid']);
    expect(selected).toHaveLength(BACKGROUND_ADVANCE_MAX_JOBS);
    expect(selectBackgroundAdvanceJobs(jobs, { ownerId: 'owner', now: NOW, limit: 0 })).toEqual([]);
  });

  it('does nothing without a locally valid session', () => {
    expect(isBackgroundSessionUsable(null, NOW)).toBe(false);
    expect(isBackgroundSessionUsable({ userId: null, expiresAtSec: NOW }, NOW)).toBe(false);
    expect(isBackgroundSessionUsable({ userId: 'owner', expiresAtSec: undefined }, NOW)).toBe(false);
    const expiresAtSec = (NOW + BACKGROUND_SESSION_MIN_VALIDITY_MS) / 1000;
    expect(isBackgroundSessionUsable({ userId: 'owner', expiresAtSec }, NOW)).toBe(true);
    expect(isBackgroundSessionUsable({ userId: 'owner', expiresAtSec }, NOW + 1)).toBe(false);
  });

  it('keeps the work inside the time budget', () => {
    expect(remainingBackgroundBudgetMs(NOW, NOW)).toBe(BACKGROUND_ADVANCE_BUDGET_MS);
    expect(remainingBackgroundBudgetMs(NOW, NOW + 5_000)).toBe(BACKGROUND_ADVANCE_BUDGET_MS - 5_000);
    expect(remainingBackgroundBudgetMs(NOW, NOW + BACKGROUND_ADVANCE_BUDGET_MS + 1)).toBe(0);
  });

  it('reuses a begin result only while URLSession can still use it', () => {
    const target = {
      batchId: 'batch',
      uploadUrl: 'https://upload',
      uploadHeaders: {},
      finalizeUrl: 'https://finalize',
      finalizeHeaders: {},
      finalizeToken: 'token',
      uploadUrlExpiresAt: NOW + UPLOAD_TARGET_MIN_VALIDITY_MS,
    };
    expect(hasReusableUploadTarget(target, NOW)).toBe(true);
    expect(hasReusableUploadTarget(target, NOW + 1)).toBe(false);
    expect(hasReusableUploadTarget({ ...target, finalizeToken: null }, NOW)).toBe(false);
    expect(hasReusableUploadTarget({ ...target, uploadUrlExpiresAt: null }, NOW)).toBe(false);
  });
});
