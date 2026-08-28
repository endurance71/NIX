import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCurrentAccount } from './accountService';

const mockInvoke = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

describe('deleteCurrentAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('wysyła authorizationCode wyłącznie w body delete-account', async () => {
    await deleteCurrentAccount({ appleAuthorizationCode: 'fresh-apple-code' });

    expect(mockInvoke).toHaveBeenCalledWith('delete-account', {
      method: 'POST',
      body: { appleAuthorizationCode: 'fresh-apple-code' },
    });
  });

  it('nie dodaje kodu Apple dla konta e-mail', async () => {
    await deleteCurrentAccount();

    expect(mockInvoke).toHaveBeenCalledWith('delete-account', {
      method: 'POST',
      body: {},
    });
  });
});
