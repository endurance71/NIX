import { describe, expect, it } from 'vitest';

import type { FriendProfile } from '../services/friendService';
import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import type { InboxRowModel } from './inboxPresentation';
import {
  buildRecipientUploadPresentations,
  mergeInboxRowsWithUploads,
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
  }: {
    progress?: number;
    bytesTotal?: number;
    recipients?: string[];
    createdAt?: number;
    updatedAt?: number;
    finishedAt?: number | null;
    mediaType?: 'image' | 'video';
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

  it('weights progress by bytes only when every segment has a known size', () => {
    const weighted = buildRecipientUploadPresentations([
      job('small', 'uploading', { progress: 1, bytesTotal: 100 }),
      job('large', 'uploading', { progress: 0, bytesTotal: 300 }),
    ], { now: 3_000 });
    const equalFallback = buildRecipientUploadPresentations([
      job('known', 'uploading', { progress: 1, bytesTotal: 100 }),
      job('unknown', 'uploading', { progress: 0, bytesTotal: 0 }),
    ], { now: 3_000 });

    expect(weighted.get('friend-1')?.progress).toBe(0.25);
    expect(equalFallback.get('friend-1')?.progress).toBe(0.5);
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

  it('keeps completion for 30 seconds and hides cancelled or expired work', () => {
    const completed = job('done', 'completed', {
      progress: 1,
      updatedAt: 2_000,
      finishedAt: 2_000,
    });
    expect(buildRecipientUploadPresentations([completed], { now: 31_999 }).has('friend-1')).toBe(true);
    expect(buildRecipientUploadPresentations([completed], { now: 32_001 }).has('friend-1')).toBe(false);
    expect(buildRecipientUploadPresentations([
      job('cancelled', 'cancelled'),
      job('expired', 'expired'),
    ], { now: 3_000 }).size).toBe(0);
  });
});

describe('mergeInboxRowsWithUploads', () => {
  it('attaches upload to an existing conversation and moves it to the top', () => {
    const uploads = buildRecipientUploadPresentations([
      job('active', 'uploading', { updatedAt: 5_000 }),
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
});
