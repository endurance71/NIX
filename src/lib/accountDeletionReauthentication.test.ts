import { describe, expect, it, vi } from 'vitest';
import { reauthenticateForAccountDeletion } from './accountDeletionReauthentication';

describe('reauthenticateForAccountDeletion', () => {
  it('używa hasła dla konta z tożsamością e-mail', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: null });
    const signInWithApple = vi.fn().mockResolvedValue({ error: null });

    await reauthenticateForAccountDeletion({
      hasPassword: true,
      email: 'tester@example.com',
      password: 'secret',
      signIn,
      signInWithApple,
    });

    expect(signIn).toHaveBeenCalledWith('tester@example.com', 'secret');
    expect(signInWithApple).not.toHaveBeenCalled();
  });

  it('używa Apple dla konta bez hasła', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: null });
    const signInWithApple = vi.fn().mockResolvedValue({ error: null });

    await reauthenticateForAccountDeletion({
      hasPassword: false,
      email: null,
      password: '',
      signIn,
      signInWithApple,
    });

    expect(signIn).not.toHaveBeenCalled();
    expect(signInWithApple).toHaveBeenCalledOnce();
  });

  it('przekazuje błąd dostawcy uwierzytelnienia', async () => {
    const authError = new Error('reauth failed');

    await expect(
      reauthenticateForAccountDeletion({
        hasPassword: true,
        email: 'tester@example.com',
        password: 'wrong',
        signIn: vi.fn().mockResolvedValue({ error: authError }),
        signInWithApple: vi.fn(),
      })
    ).rejects.toBe(authError);
  });
});
