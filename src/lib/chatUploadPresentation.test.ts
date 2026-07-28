import { describe, expect, it } from 'vitest';
import type { ChatNixEvent } from '../services/nixService';
import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import {
  chatUploadActions,
  selectChatUploadJobs,
  sharedRecipientCount,
} from './chatUploadPresentation';

function job(
  id: string,
  state: UploadJobState,
  overrides: Partial<DurableUploadJob> = {}
): DurableUploadJob {
  return {
    id,
    idempotencyKey: `key-${id}`,
    ownerId: 'sender',
    mediaType: 'image',
    state,
    stagedUri: `file:///${id}.jpg`,
    preparedUri: null,
    contentType: 'image/jpeg',
    fileExtension: 'jpg',
    originalSizeBytes: 100,
    finalSizeBytes: 80,
    playbackDurationMs: null,
    sourceWidth: 100,
    sourceHeight: 100,
    thumbnailB64: null,
    batchId: `batch-${id}`,
    assetId: null,
    storagePath: null,
    uploadUrl: null,
    uploadHeaders: null,
    uploadUrlExpiresAt: null,
    finalizeUrl: null,
    finalizeHeaders: null,
    finalizeToken: null,
    progress: 0.3,
    bytesSent: 30,
    bytesTotal: 100,
    retryCount: 0,
    authRefreshAttempted: false,
    nextAttemptAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: 1_000,
    updatedAt: 2_000,
    expiresAt: 99_000,
    startedAt: null,
    finishedAt: null,
    recipients: [{ receiverId: 'peer', viewDurationSec: 5, sequenceIndex: 0 }],
    ...overrides,
  };
}

function serverNix(clientUploadId: string): ChatNixEvent {
  return {
    id: 'nix-1',
    direction: 'sent',
    created_at: new Date(2_000).toISOString(),
    media_type: 'image',
    media_path: 'nixes/a.jpg',
    thumbnail_b64: null,
    is_viewed: false,
    is_replayed: false,
    replay_expires_at: null,
    status: 'sent',
    view_duration_sec: 5,
    client_upload_id: clientUploadId,
  };
}

describe('chat upload presentation', () => {
  it('keeps a failed job visible in the matching conversation', () => {
    expect(selectChatUploadJobs([job('failed', 'failed')], 'peer', [])).toHaveLength(1);
    expect(selectChatUploadJobs([job('failed', 'failed')], 'other', [])).toHaveLength(0);
  });

  it('hides cancelled and expired jobs', () => {
    expect(
      selectChatUploadJobs(
        [job('cancelled', 'cancelled'), job('expired', 'expired')],
        'peer',
        []
      )
    ).toEqual([]);
  });

  it('keeps completion briefly, then replaces it with the finalized server NiX', () => {
    const completed = job('done', 'completed', {
      batchId: 'batch-done',
      finishedAt: 10_000,
      updatedAt: 10_000,
      progress: 1,
    });
    expect(
      selectChatUploadJobs([completed], 'peer', [], { now: 20_000 })
    ).toHaveLength(1);
    expect(
      selectChatUploadJobs([completed], 'peer', [serverNix('batch-done')], { now: 20_000 })
    ).toHaveLength(0);
    expect(
      selectChatUploadJobs([completed], 'peer', [], { now: 50_001 })
    ).toHaveLength(0);
  });

  it('exposes direct recovery actions without exposing internal errors', () => {
    expect(chatUploadActions(job('failed', 'failed'))).toEqual(['retry', 'cancel']);
    expect(
      chatUploadActions(job('permanent', 'failed', { errorCode: 'FILE_TOO_LARGE_PERMANENT' }))
    ).toEqual(['cancel']);
    expect(chatUploadActions(job('active', 'uploading'))).toEqual(['pause', 'cancel']);
    expect(chatUploadActions(job('paused', 'paused'))).toEqual(['resume', 'cancel']);
  });

  it('reports how many recipients share the same underlying upload', () => {
    expect(
      sharedRecipientCount(job('shared', 'failed', {
        recipients: [
          { receiverId: 'peer', viewDurationSec: 5, sequenceIndex: 0 },
          { receiverId: 'other', viewDurationSec: 5, sequenceIndex: 1 },
          { receiverId: 'peer', viewDurationSec: 10, sequenceIndex: 2 },
        ],
      }))
    ).toBe(2);
  });
});
