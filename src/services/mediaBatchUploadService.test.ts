import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForOwnMediaJob } from './mediaBatchUploadService';
import { DomainError } from './errors';

const { mockSupabaseRpc } = vi.hoisted(() => ({
  mockSupabaseRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mockSupabaseRpc,
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
