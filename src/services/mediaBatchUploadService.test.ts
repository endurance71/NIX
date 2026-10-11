import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ModerationPendingError,
  beginMediaUploadBatch,
  finalizeMediaUploadBatch,
  isModerationStillUnknown,
  moderationPendingBackoffMs,
  waitForOwnMediaJob,
} from './mediaBatchUploadService';
import { DomainError } from './errors';

const { mockSupabaseRpc, invoke } = vi.hoisted(() => ({
  mockSupabaseRpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mockSupabaseRpc,
    functions: { invoke },
  },
}));

describe('waitForOwnMediaJob', () => {
  beforeEach(() => {
    mockSupabaseRpc.mockReset();
  });

  it('returns after approved materializes a nix', async () => {
    mockSupabaseRpc
      .mockResolvedValueOnce({
        data: { jobId: 'job-1', status: 'pending' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          jobId: 'job-1',
          status: 'approved',
          nixId: 'nix-1',
          batchStatus: 'completed',
        },
        error: null,
      });

    await expect(waitForOwnMediaJob('job-1')).resolves.toEqual({
      status: 'completed',
      nixId: 'nix-1',
    });
    expect(mockSupabaseRpc).toHaveBeenCalledWith('get_own_media_moderation_job', {
      p_job_id: 'job-1',
    });
  });

  it('rejects blocked content without treating it as delivered', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: { jobId: 'job-1', status: 'rejected', decision: 'CONTENT_NOT_ALLOWED' },
      error: null,
    });

    await expect(waitForOwnMediaJob('job-1')).rejects.toMatchObject({
      code: 'CONTENT_NOT_ALLOWED',
    });
    expect.assertions(1);
  });

  it('maps unauthorized poll errors', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'UNAUTHORIZED' },
    });

    await expect(waitForOwnMediaJob('job-1')).rejects.toBeInstanceOf(DomainError);
    await expect(waitForOwnMediaJob('job-1')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('treats a lost connection while polling as still pending, not as a failed send', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: null,
      error: { code: '', message: 'TypeError: Network request failed' },
    });

    const error = await waitForOwnMediaJob('job-1').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModerationPendingError);
    expect(isModerationStillUnknown(error)).toBe(true);
  });

  it('treats a slow moderation queue as still pending', async () => {
    vi.useFakeTimers();
    try {
      mockSupabaseRpc.mockResolvedValue({ data: { jobId: 'job-1', status: 'processing' }, error: null });
      const settled = waitForOwnMediaJob('job-1').catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(31_000);
      expect(await settled).toBeInstanceOf(ModerationPendingError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('checks exactly once in a backed-off round', async () => {
    mockSupabaseRpc.mockResolvedValue({ data: { jobId: 'job-1', status: 'pending' }, error: null });
    const error = await waitForOwnMediaJob('job-1', { timeoutMs: 0 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModerationPendingError);
    expect(mockSupabaseRpc).toHaveBeenCalledTimes(1);
  });

  it('backs off between pending rounds and caps the delay', () => {
    expect([0, 1, 2, 3, 10].map(moderationPendingBackoffMs)).toEqual([5_000, 15_000, 30_000, 60_000, 60_000]);
  });

  it('keeps server verdicts terminal', () => {
    expect(isModerationStillUnknown(new DomainError('CONTENT_NOT_ALLOWED', 'blocked'))).toBe(false);
  });
});

describe('terminal media size errors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['INVALID_SIZE', 'MEDIA_TOO_LARGE', 'OBJECT_SIZE_MISMATCH'])('decodes %s from an opaque Edge transport error', async (code) => {
    invoke.mockResolvedValueOnce({ data: null, error: {
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ code }), { status: 400 }),
    } });
    await expect(beginMediaUploadBatch({ idempotencyKey: 'batch', mediaType: 'image', contentType: 'image/jpeg',
      sizeBytes: 32, fileExtension: 'jpg', recipients: [] })).rejects.toMatchObject({ code, messageKey: `domainErrors.${code}` });
  });

  it.each(['INVALID_SIZE', 'MEDIA_TOO_LARGE', 'OBJECT_SIZE_MISMATCH'])('preserves %s from native finalize responses', async (code) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code }), { status: 400 })));
    await expect(finalizeMediaUploadBatch({ url: 'https://test.supabase.co/finalize', headers: {},
      batchId: 'batch', token: 'finalize-token' })).rejects.toMatchObject({ code, messageKey: `domainErrors.${code}` });
  });
});

describe('beginMediaUploadBatch request body', () => {
  const baseInput = {
    idempotencyKey: 'batch-key',
    mediaType: 'video' as const,
    contentType: 'video/mp4',
    sizeBytes: 2048,
    fileExtension: 'mp4',
    playbackDurationMs: 1234.6,
    thumbnailB64: null,
    recipients: [{ receiverId: 'peer-1', viewDurationSec: 5, sequenceIndex: 0 }],
  };
  const response = { batchId: 'b', assetId: 'a', storagePath: 'p', status: 'pending' };

  beforeEach(() => invoke.mockReset());

  it('sends the durable job creation time as an ISO timestamp', async () => {
    invoke.mockResolvedValueOnce({ data: response, error: null });
    const createdAt = Date.UTC(2026, 9, 10, 11, 58, 30, 125);

    await beginMediaUploadBatch({ ...baseInput, clientCreatedAt: createdAt });

    expect(invoke).toHaveBeenCalledWith('begin-media-upload', {
      body: {
        idempotencyKey: 'batch-key',
        mediaType: 'video',
        contentType: 'video/mp4',
        sizeBytes: 2048,
        fileExtension: 'mp4',
        playbackDurationMs: 1235,
        thumbnailB64: null,
        recipients: baseInput.recipients,
        clientCreatedAt: '2026-10-10T11:58:30.125Z',
      },
    });
  });

  it.each([undefined, null, Number.NaN, 1e20])('omits the creation time when it is %s', async (clientCreatedAt) => {
    invoke.mockResolvedValueOnce({ data: response, error: null });

    await beginMediaUploadBatch({ ...baseInput, clientCreatedAt });

    const body = invoke.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('clientCreatedAt');
  });
});
