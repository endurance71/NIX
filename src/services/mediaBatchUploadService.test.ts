import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginMediaUploadBatch, finalizeMediaUploadBatch, waitForOwnMediaJob } from './mediaBatchUploadService';
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
