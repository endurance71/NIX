import { describe, expect, it } from 'vitest';

import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import {
  UPLOAD_RETRY_DELAYS_MS,
  buildUploadQueueSummary,
  isAllowedUploadTransition,
  isMissingStagedUploadError,
  isPermanentUploadError,
  mapNativeUploadState,
  selectVideoCompressionProfile,
  uploadRetryDelay,
} from './durableUploadPolicy';

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
    expect(isAllowedUploadTransition('uploading', 'waiting_network')).toBe(true);
    expect(isAllowedUploadTransition('failed', 'queued')).toBe(true);
    expect(isAllowedUploadTransition('completed', 'queued')).toBe(false);
    expect(isAllowedUploadTransition('cancelled', 'uploading')).toBe(false);
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
    expect(isPermanentUploadError({ code: 'NETWORK_ERROR' })).toBe(false);
    expect(isPermanentUploadError(new Error('timeout'))).toBe(false);
    expect(isMissingStagedUploadError(new Error('Staged upload file does not exist.'))).toBe(true);
    expect(isMissingStagedUploadError({ code: 'STAGED_FILE_MISSING' })).toBe(true);
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
