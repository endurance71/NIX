import { describe, expect, it, vi } from 'vitest';
import { toReportContentBody, type ReportContentParams } from './safetyService';

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('toReportContentBody', () => {
  it('sends only nixId for a NiX report', () => {
    expect(
      toReportContentBody({ reason: 'spam', nixId: 'nix-1', details: 'from viewer' })
    ).toEqual({
      reason: 'spam',
      nixId: 'nix-1',
      details: 'from viewer',
    });
  });

  it('does not send reportedUserId for a text report', () => {
    const params: ReportContentParams = {
      reason: 'harassment',
      textMessageId: 'text-1',
      details: 'from chat',
    };
    expect(toReportContentBody(params)).toEqual({
      reason: 'harassment',
      textMessageId: 'text-1',
      details: 'from chat',
    });
    expect(toReportContentBody(params)).not.toHaveProperty('reportedUserId');
  });

  it('sends only reportedUserId for a user report', () => {
    expect(toReportContentBody({ reason: 'spam', reportedUserId: 'user-1' })).toEqual({
      reason: 'spam',
      reportedUserId: 'user-1',
      details: undefined,
    });
  });
});
