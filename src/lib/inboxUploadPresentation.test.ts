import { describe, expect, it } from 'vitest';

import type { FriendProfile } from '../services/friendService';
import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import type { InboxRowModel } from './inboxPresentation';
import {
  buildRecipientUploadPresentations,
  createInboxRowIdentityCache,
  inboxRowsEqual,
  mergeInboxRowsWithUploads,
  uploadPresentationsEqual,
} from './inboxUploadPresentation';

function job(
  id: string,
  state: UploadJobState,
  {
    progress = 0,
    bytesTotal = 0,
    recipients = ['friend-1'],
    createdAt = 1_000,
    updatedAt = 2_000,
    finishedAt = null,
    mediaType = 'image',
    batchId = null,
  }: {
    progress?: number;
    bytesTotal?: number;
    recipients?: string[];
    createdAt?: number;
    updatedAt?: number;
    finishedAt?: number | null;
    mediaType?: 'image' | 'video';
    batchId?: string | null;
  } = {}
): DurableUploadJob {
  return {
    id,
    idempotencyKey: id,
    ownerId: 'owner',
    mediaType,
    state,
    stagedUri: 'file:///source.jpg',
    preparedUri: null,
    contentType: null,
    fileExtension: null,
    originalSizeBytes: bytesTotal || null,
    finalSizeBytes: bytesTotal || null,
    playbackDurationMs: null,
    sourceWidth: null,
    sourceHeight: null,
    thumbnailB64: null,
    batchId,
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
    bytesSent: progress * bytesTotal,
    bytesTotal,
    retryCount: 0,
    authRefreshAttempted: false,
    nextAttemptAt: null,
    errorCode: state === 'failed' ? 'RAW_BACKEND_ERROR' : null,
    errorMessage: state === 'failed' ? 'Edge Function returned a non-2xx status code' : null,
    createdAt,
    updatedAt,
    expiresAt: 999_999,
    startedAt: null,
    finishedAt,
    recipients: recipients.map((receiverId, sequenceIndex) => ({
      receiverId,
      viewDurationSec: 5,
      sequenceIndex,
    })),
  };
}

function row(peerId = 'friend-1', createdAt = '1970-01-01T00:00:00.500Z'): InboxRowModel {
  return {
    id: `row:${peerId}`,
    peerId,
    kind: 'text',
    username: 'ania',
    display_name: 'Ania',
    direction: 'received',
    unread: false,
    status: 'opened',
    messageStatus: 'received',
    messageKind: 'text',
    createdAt,
    timestampLabel: '00:00',
    avatarStoragePath: null,
    avatarEmoji: null,
    mediaType: null,
    upload: null,
    openParams: null,
  };
}

const mergeOptions = {
  unknownUsername: 'Nieznany',
  locale: 'pl',
  yesterdayLabel: 'Wczoraj',
  now: new Date(10_000),
};

describe('buildRecipientUploadPresentations', () => {
  it('shows one shared job beside every recipient', () => {
    const result = buildRecipientUploadPresentations([
      job('shared', 'uploading', {
        progress: 0.3,
        recipients: ['friend-1', 'friend-2'],
      }),
    ], { now: 3_000 });

    expect(result.get('friend-1')).toMatchObject({
      phase: 'uploading',
      progress: 0.3,
      jobIds: ['shared'],
      sharedRecipientCount: 2,
    });
    expect(result.get('friend-2')).toMatchObject({
      jobIds: ['shared'],
      sharedRecipientCount: 2,
    });
  });

  it('averages segments with equal weight so a size becoming known does not move the ring', () => {
    const sizesKnown = buildRecipientUploadPresentations([
      job('small', 'uploading', { progress: 1, bytesTotal: 100 }),
      job('large', 'uploading', { progress: 0, bytesTotal: 300 }),
    ], { now: 3_000 });
    const oneSizeUnknown = buildRecipientUploadPresentations([
      job('small', 'uploading', { progress: 1, bytesTotal: 100 }),
      job('large', 'uploading', { progress: 0, bytesTotal: 0 }),
    ], { now: 3_000 });

    expect(sizesKnown.get('friend-1')?.progress).toBe(0.5);
    expect(oneSizeUnknown.get('friend-1')?.progress).toBe(0.5);
  });

  it('prioritizes attention states and exposes only safe presentation data', () => {
    const presentation = buildRecipientUploadPresentations([
      job('active', 'uploading', { progress: 0.8 }),
      job('failed', 'failed', { progress: 0.2 }),
    ], { now: 3_000 }).get('friend-1');

    expect(presentation?.phase).toBe('failed');
    expect(presentation?.actions.retryJobIds).toEqual(['failed']);
    expect(JSON.stringify(presentation)).not.toContain('Edge Function');
  });

  it('keeps completion for 4 seconds and hides cancelled or expired work', () => {
    const completed = job('done', 'completed', {
      progress: 1,
      updatedAt: 2_000,
      finishedAt: 2_000,
    });
    expect(buildRecipientUploadPresentations([completed], { now: 5_999 }).has('friend-1')).toBe(true);
    expect(buildRecipientUploadPresentations([completed], { now: 6_001 }).has('friend-1')).toBe(false);
    expect(buildRecipientUploadPresentations([
      job('cancelled', 'cancelled'),
      job('expired', 'expired'),
    ], { now: 3_000 }).size).toBe(0);
  });
});

describe('mergeInboxRowsWithUploads', () => {
  it('attaches upload to an existing conversation and moves it to the top', () => {
    const uploads = buildRecipientUploadPresentations([
      job('active', 'uploading', { createdAt: 5_000, updatedAt: 5_000 }),
    ], { now: 6_000 });
    const merged = mergeInboxRowsWithUploads(
      [row('friend-2', '1970-01-01T00:00:04.000Z'), row('friend-1')],
      uploads,
      [],
      mergeOptions
    );

    expect(merged[0].peerId).toBe('friend-1');
    expect(merged[0].upload?.phase).toBe('uploading');
  });

  it('creates a first-conversation row using the accepted friend profile', () => {
    const uploads = buildRecipientUploadPresentations([
      job('active', 'preparing', { mediaType: 'video' }),
    ], { now: 3_000 });
    const friends: FriendProfile[] = [{
      id: 'friend-1',
      username: 'ola',
      display_name: 'Ola',
      avatar_storage_path: 'avatars/ola.jpg',
      avatar_emoji: '🌿',
    }];
    const merged = mergeInboxRowsWithUploads([], uploads, friends, mergeOptions);

    expect(merged[0]).toMatchObject({
      id: 'upload:friend-1',
      peerId: 'friend-1',
      username: 'ola',
      display_name: 'Ola',
      direction: 'sent',
      mediaType: 'video',
      avatarStoragePath: 'avatars/ola.jpg',
      upload: { phase: 'preparing' },
    });
  });

  it('removes the transient completion overlay once the server row represents it', () => {
    const uploads = buildRecipientUploadPresentations([
      job('done', 'completed', {
        createdAt: 1_000,
        updatedAt: 2_000,
        finishedAt: 2_000,
        progress: 1,
      }),
    ], { now: 3_000 });
    const serverRow = {
      ...row('friend-1', '1970-01-01T00:00:01.500Z'),
      direction: 'sent' as const,
    };

    expect(
      mergeInboxRowsWithUploads([serverRow], uploads, [], mergeOptions)[0].upload
    ).toBeNull();
  });

  it('shows moderation as confirming instead of an upload stuck near 100%', () => {
    const uploads = buildRecipientUploadPresentations([job('moderating', 'finalizing', { progress: 0.97 })]);
    expect(uploads.get('friend-1')?.phase).toBe('confirming');
  });

  it('prefers an active upload over a sibling that is already confirming', () => {
    const uploads = buildRecipientUploadPresentations([
      job('moderating', 'finalizing', { progress: 0.97 }),
      job('sending', 'uploading', { progress: 0.4 }),
    ]);
    expect(uploads.get('friend-1')?.phase).toBe('uploading');
  });

  it('keeps conversation order stable while uploads report progress', () => {
    const options = mergeOptions;
    const order = (updatedA: number, updatedB: number) => mergeInboxRowsWithUploads(
      [],
      buildRecipientUploadPresentations([
        job('a', 'uploading', { recipients: ['friend-a'], createdAt: 1_000, updatedAt: updatedA }),
        job('b', 'uploading', { recipients: ['friend-b'], createdAt: 2_000, updatedAt: updatedB }),
      ], { now: 9_000 }),
      [],
      options
    ).map((merged) => merged.peerId);

    expect(order(3_000, 4_000)).toEqual(['friend-b', 'friend-a']);
    expect(order(8_000, 4_000)).toEqual(['friend-b', 'friend-a']);
  });

  it('confirms a completed upload by client_upload_id instead of comparing clocks', () => {
    const uploads = buildRecipientUploadPresentations([
      job('done', 'completed', { createdAt: 5_000, finishedAt: 6_000, progress: 1, batchId: 'batch-1' }),
    ], { now: 7_000 });
    const sentRow = (clientUploadId: string) => ({
      ...row('friend-1', '1970-01-01T00:00:09.000Z'),
      kind: 'nix' as const,
      direction: 'sent' as const,
      status: 'sent' as const,
      clientUploadId,
    });

    expect(mergeInboxRowsWithUploads([sentRow('batch-1')], uploads, [], mergeOptions)[0].upload).toBeNull();
    // A newer sent NiX from another batch does not confirm this upload yet.
    expect(mergeInboxRowsWithUploads([sentRow('batch-0')], uploads, [], mergeOptions)[0].upload?.phase)
      .toBe('completed');
  });

  it('tolerates a device clock ahead of the server when no client_upload_id is available', () => {
    const uploads = buildRecipientUploadPresentations([
      job('done', 'completed', { createdAt: 40_000, finishedAt: 41_000, progress: 1 }),
    ], { now: 42_000 });
    const serverRow = {
      ...row('friend-1', '1970-01-01T00:00:10.000Z'),
      direction: 'sent' as const,
    };

    expect(mergeInboxRowsWithUploads([serverRow], uploads, [], mergeOptions)[0].upload).toBeNull();
  });
});

describe('createInboxRowIdentityCache', () => {
  const pipeline = (cache: ReturnType<typeof createInboxRowIdentityCache>, progress: number) =>
    cache.reconcile(
      mergeInboxRowsWithUploads(
        // Fresh objects each time, like `buildInboxRowModel` after any inbox query update.
        [row('friend-1', '1970-01-01T00:00:04.000Z'), row('friend-2'), row('friend-3')],
        buildRecipientUploadPresentations(
          [job('active', 'uploading', { recipients: ['friend-2'], progress, createdAt: 1_000 })],
          { now: 9_000 },
        ),
        [],
        mergeOptions,
      ),
    );

  it('keeps unchanged rows while the uploading row gets a new object', () => {
    const cache = createInboxRowIdentityCache();
    const first = pipeline(cache, 0.2);
    const second = pipeline(cache, 0.6);
    const byPeer = (rows: InboxRowModel[], peerId: string) =>
      rows.find((candidate) => candidate.peerId === peerId);

    expect(second).not.toBe(first);
    expect(byPeer(second, 'friend-1')).toBe(byPeer(first, 'friend-1'));
    expect(byPeer(second, 'friend-3')).toBe(byPeer(first, 'friend-3'));
    expect(byPeer(second, 'friend-2')).not.toBe(byPeer(first, 'friend-2'));
    expect(byPeer(second, 'friend-2')?.upload?.progress).toBe(0.6);
  });

  it('returns the previous array when nothing changed', () => {
    const cache = createInboxRowIdentityCache();
    const first = pipeline(cache, 0.2);
    expect(pipeline(cache, 0.2)).toBe(first);
  });

  it('replaces a row whose own fields changed and follows the new order', () => {
    const cache = createInboxRowIdentityCache();
    const first = cache.reconcile([row('friend-1'), row('friend-2')]);
    const renamed = { ...row('friend-2'), username: 'ola' };
    const second = cache.reconcile([renamed, row('friend-1')]);

    expect(second.map((candidate) => candidate.peerId)).toEqual(['friend-2', 'friend-1']);
    expect(second[0]).toBe(renamed);
    expect(second[1]).toBe(first[0]);
  });

  it('compares upload actions and open params by value', () => {
    const upload = buildRecipientUploadPresentations([job('a', 'paused')], { now: 3_000 }).get('friend-1')!;
    const base = { ...row('friend-1'), upload, openParams: null };
    expect(inboxRowsEqual(base, { ...base, upload: { ...upload, actions: { ...upload.actions } } }))
      .toBe(true);
    expect(inboxRowsEqual(base, {
      ...base,
      upload: { ...upload, actions: { ...upload.actions, resumeJobIds: [] } },
    })).toBe(false);
    expect(uploadPresentationsEqual(upload, null)).toBe(false);
  });

  it('keeps the server row object when it has no upload to attach', () => {
    const serverRow = row('friend-1');
    expect(mergeInboxRowsWithUploads([serverRow], new Map(), [], mergeOptions)[0]).toBe(serverRow);
  });
});
