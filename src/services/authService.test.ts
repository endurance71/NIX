import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  signInWithPassword,
  signUpWithPassword,
  requestPasswordReset,
  updatePassword,
  signInWithAppleIdToken,
  signOut,
} from './authService';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signInWithIdToken: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: mockAuth,
  },
}));

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loguje przez e-mail i hasło', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: null, error: null });

    await signInWithPassword('test@example.com', 'password123');

    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('rejestruje konto z redirect url', async () => {
    mockAuth.signUp.mockResolvedValue({ data: null, error: null });

    await signUpWithPassword('test@example.com', 'password123');

    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
      options: { emailRedirectTo: 'nix://auth/callback' },
    });
  });

  it('wysyła e-mail resetu hasła', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ data: null, error: null });

    await requestPasswordReset('test@example.com');

    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
      redirectTo: 'nix://auth/callback',
    });
  });

  it('aktualizuje hasło użytkownika', async () => {
    mockAuth.updateUser.mockResolvedValue({ data: null, error: null });

    await updatePassword('new-password-123');

    expect(mockAuth.updateUser).toHaveBeenCalledWith({
      password: 'new-password-123',
    });
  });

  it('loguje przez Apple Id token', async () => {
    mockAuth.signInWithIdToken.mockResolvedValue({ data: null, error: null });

    await signInWithAppleIdToken('token-value', 'nonce-value');

    expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'token-value',
      nonce: 'nonce-value',
    });
  });

  it('wywołuje signOut', async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });

    await signOut();

    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  });
});
