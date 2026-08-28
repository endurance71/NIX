import { describe, expect, it, vi } from 'vitest';
import { reauthenticateForAccountDeletion } from './accountDeletionReauthentication';

describe('reauthenticateForAccountDeletion', () => {
  it('używa hasła dla konta e-mail i nie żąda kodu Apple', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: null });
    const requestAppleAuthorization = vi.fn();

    const result = await reauthenticateForAccountDeletion({
      hasPassword: true,
      hasApple: false,
      email: 'tester@example.com',
      password: 'secret',
      signIn,
      requestAppleAuthorization,
    });

    expect(signIn).toHaveBeenCalledWith('tester@example.com', 'secret');
    expect(requestAppleAuthorization).not.toHaveBeenCalled();
    expect(result.appleAuthorizationCode).toBeNull();
  });

  it('wymaga świeżego authorizationCode dla konta Apple', async () => {
    const signIn = vi.fn();
    const requestAppleAuthorization = vi.fn().mockResolvedValue({
      authorizationCode: 'fresh-apple-code',
      error: null,
    });

    const result = await reauthenticateForAccountDeletion({
      hasPassword: false,
      hasApple: true,
      email: null,
      password: '',
      signIn,
      requestAppleAuthorization,
    });

    expect(signIn).not.toHaveBeenCalled();
    expect(requestAppleAuthorization).toHaveBeenCalledOnce();
    expect(result.appleAuthorizationCode).toBe('fresh-apple-code');
  });

  it('zatrzymuje usuwanie gdy Apple nie zwróci authorizationCode', async () => {
    await expect(
      reauthenticateForAccountDeletion({
        hasPassword: false,
        hasApple: true,
        email: null,
        password: '',
        signIn: vi.fn(),
        requestAppleAuthorization: vi.fn().mockResolvedValue({
          authorizationCode: null,
          error: null,
        }),
      })
    ).rejects.toThrow('APPLE_SIGN_IN_NO_AUTHORIZATION_CODE');
  });

  it('dla konta z hasłem i Apple robi oba kroki', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: null });
    const requestAppleAuthorization = vi.fn().mockResolvedValue({
      authorizationCode: 'fresh-apple-code',
      error: null,
    });

    const result = await reauthenticateForAccountDeletion({
      hasPassword: true,
      hasApple: true,
      email: 'tester@example.com',
      password: 'secret',
      signIn,
      requestAppleAuthorization,
    });

    expect(signIn).toHaveBeenCalledWith('tester@example.com', 'secret');
    expect(requestAppleAuthorization).toHaveBeenCalledOnce();
    expect(result.appleAuthorizationCode).toBe('fresh-apple-code');
  });

  it('przekazuje błąd dostawcy uwierzytelnienia', async () => {
    const authError = new Error('reauth failed');

    await expect(
      reauthenticateForAccountDeletion({
        hasPassword: true,
        hasApple: false,
        email: 'tester@example.com',
        password: 'wrong',
        signIn: vi.fn().mockResolvedValue({ error: authError }),
        requestAppleAuthorization: vi.fn(),
      })
    ).rejects.toBe(authError);
  });
});
