import { describe, expect, it } from 'vitest';
import type { ChatNixEvent } from '../services/nixService';
import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import {
  chatMediaBubblePresentation,
  chatUploadActions,
  chatUploadProgress,
  mergeChatMediaAnchors,
  rememberChatMediaAnchors,
  resetChatMediaAnchorsForTests,
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
    moderationJobId: null,
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

  it('hides a locally failed job once the server already delivered its batch', () => {
    const visible = selectChatUploadJobs(
      [job('timed-out', 'failed'), job('pending', 'finalizing')],
      'peer',
      [serverNix('batch-timed-out')],
      { now: 3_000 }
    );
    expect(visible.map((item) => item.id)).toEqual(['pending']);
  });

  it('exposes only actions the queue honours for the context menu', () => {
    expect(chatUploadActions(job('failed', 'failed'))).toEqual(['retry', 'cancel']);
    expect(
      chatUploadActions(job('permanent', 'failed', { errorCode: 'FILE_TOO_LARGE_PERMANENT' }))
    ).toEqual(['cancel']);
    expect(chatUploadActions(job('active', 'uploading'))).toEqual(['cancel']);
    expect(chatUploadActions(job('paused', 'paused'))).toEqual(['resume', 'cancel']);
    // An automatic retry is already scheduled; „retry” would be a no-op.
    expect(chatUploadActions(job('retrying', 'retry_scheduled'))).toEqual(['cancel']);
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

describe('chatUploadProgress', () => {
  it('is determinate only while bytes are moving', () => {
    expect(chatUploadProgress(job('a', 'uploading', { progress: 0.42 }))).toBe(0.42);
    expect(chatUploadProgress(job('a', 'uploading', { progress: 7 }))).toBe(1);
    expect(chatUploadProgress(job('a', 'uploading', { progress: Number.NaN }))).toBe(0);
    expect(chatUploadProgress(job('a', 'finalizing'))).toBeNull();
    expect(chatUploadProgress(job('a', 'preparing'))).toBeNull();
  });
});

describe('chat media anchors', () => {
  it('records each job with a batch id once and keeps identity when nothing changes', () => {
    const first = mergeChatMediaAnchors([], [job('a', 'uploading'), job('b', 'preparing', { batchId: null })], 1_000);
    expect(first).toEqual([{ jobId: 'a', batchId: 'batch-a', createdAt: 1_000 }]);
    expect(mergeChatMediaAnchors(first, [job('a', 'finalizing')], 2_000)).toBe(first);
  });

  it('drops anchors older than two days', () => {
    const anchors = mergeChatMediaAnchors([], [job('a', 'uploading')], 1_000);
    expect(mergeChatMediaAnchors(anchors, [], 1_000 + 49 * 60 * 60 * 1000)).toEqual([]);
  });

  it('remembers anchors per peer after the job leaves the queue', () => {
    resetChatMediaAnchorsForTests();
    rememberChatMediaAnchors('peer', [job('a', 'uploading')], 1_000);
    expect(rememberChatMediaAnchors('peer', [], 2_000)).toEqual([
      { jobId: 'a', batchId: 'batch-a', createdAt: 1_000 },
    ]);
    expect(rememberChatMediaAnchors('other', [], 2_000)).toEqual([]);
  });
});

describe('chatMediaBubblePresentation', () => {
  it('shows determinate progress while uploading', () => {
    expect(chatMediaBubblePresentation(job('a', 'uploading', { progress: 0.5 }), null, null)).toMatchObject({
      delivered: false,
      tone: 'neutral',
      icon: null,
      progress: 0.5,
      busy: false,
    });
  });

  it('lets the delivered server NiX win over a failed local job', () => {
    const presentation = chatMediaBubblePresentation(
      job('a', 'failed'),
      { media_type: 'video' },
      null
    );
    expect(presentation).toMatchObject({
      mediaType: 'video',
      delivered: true,
      failed: false,
      tone: 'success',
      icon: 'completed',
      actions: [],
    });
  });

  it('offers retry for a failed job and hides the failure while a retry runs', () => {
    expect(chatMediaBubblePresentation(job('a', 'failed'), null, null)).toMatchObject({
      failed: true,
      tone: 'destructive',
      icon: 'retry',
    });
    expect(chatMediaBubblePresentation(job('a', 'failed'), null, 'retry')).toMatchObject({
      failed: false,
      busy: true,
      progress: null,
    });
  });

  it('marks waiting for network and paused with their own icons', () => {
    expect(chatMediaBubblePresentation(job('a', 'waiting_network'), null, null).icon).toBe('offline');
    expect(chatMediaBubblePresentation(job('a', 'paused'), null, null).icon).toBe('paused');
  });
});
