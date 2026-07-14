import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPLE_SIGN_IN_ERROR_CODES,
  signInWithApple,
  signInWithGoogle,
} from './socialAuthService';

const { mockAuth, mockAppleAuth, mockCrypto, mockSaveAppleId } = vi.hoisted(() => ({
  mockAuth: {
    signInWithIdToken: vi.fn(),
    updateUser: vi.fn(),
    generateRawNonce: vi.fn(() => 'raw-nonce-123'),
  },
  mockAppleAuth: {
    isAvailableAsync: vi.fn(),
    signInAsync: vi.fn(),
    AppleAuthenticationScope: {
      FULL_NAME: 0,
      EMAIL: 1,
    },
  },
  mockCrypto: {
    randomUUID: vi.fn(() => 'uuid-nonce'),
    digestStringAsync: vi.fn(async () => 'hashed-nonce'),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  },
  mockSaveAppleId: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: mockAuth,
  },
}));

vi.mock('expo-apple-authentication', () => mockAppleAuth);
vi.mock('expo-crypto', () => mockCrypto);
vi.mock('./profileService', () => ({
  saveAppleIdForCurrentUser: mockSaveAppleId,
}));

describe('socialAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('EXPO_OS', 'ios');
    mockAppleAuth.isAvailableAsync.mockResolvedValue(true);
    mockAuth.signInWithIdToken.mockResolvedValue({
      data: { session: { access_token: 'token' }, user: { id: 'user-1' } },
      error: null,
    });
    mockAuth.updateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSaveAppleId.mockResolvedValue(undefined);
  });

  it('signInWithGoogle pozostaje stubem', async () => {
    const { error } = await signInWithGoogle();
    expect(error?.message).toBe('SOCIAL_AUTH_NOT_CONFIGURED');
  });

  it('loguje przez Apple i zapisuje apple_id oraz metadata', async () => {
    mockAppleAuth.signInAsync.mockResolvedValue({
      identityToken: 'identity-token',
      user: 'apple-user-123',
      fullName: {
        givenName: 'Jan',
        familyName: 'Kowalski',
        middleName: null,
      },
    });

    const { data, error } = await signInWithApple();

    expect(error).toBeNull();
    expect(data?.session).toBeTruthy();
    expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'identity-token',
      nonce: 'raw-nonce-123',
    });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({
      data: {
        full_name: 'Jan Kowalski',
        given_name: 'Jan',
        family_name: 'Kowalski',
      },
    });
    expect(mockSaveAppleId).toHaveBeenCalledWith('apple-user-123');
  });

  it('ignoruje anulowanie Apple bez błędu', async () => {
    mockAppleAuth.signInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });

    const { data, error } = await signInWithApple();

    expect(error).toBeNull();
    expect(data?.session).toBeNull();
    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('zwraca błąd gdy brak identity token', async () => {
    mockAppleAuth.signInAsync.mockResolvedValue({
      identityToken: null,
      user: 'apple-user-123',
      fullName: null,
    });

    const { error } = await signInWithApple();

    expect(error?.message).toBe(APPLE_SIGN_IN_ERROR_CODES.NO_IDENTITY_TOKEN);
  });

  it('ponawia signInWithIdToken bez nonce przy Nonces mismatch', async () => {
    mockAppleAuth.signInAsync.mockResolvedValue({
      identityToken: 'identity-token',
      user: 'apple-user-123',
      fullName: null,
    });
    mockAuth.signInWithIdToken
      .mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Nonces mismatch' },
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: 'token' }, user: { id: 'user-1' } },
        error: null,
      });

    const { data, error } = await signInWithApple();

    expect(error).toBeNull();
    expect(data?.session).toBeTruthy();
    expect(mockAuth.signInWithIdToken).toHaveBeenCalledTimes(2);
    expect(mockAuth.signInWithIdToken).toHaveBeenLastCalledWith({
      provider: 'apple',
      token: 'identity-token',
    });
  });

  it('zwraca błąd niedostępności poza iOS', async () => {
    vi.stubEnv('EXPO_OS', 'android');

    const { error } = await signInWithApple();

    expect(error?.message).toBe(APPLE_SIGN_IN_ERROR_CODES.UNAVAILABLE);
    expect(mockAppleAuth.isAvailableAsync).not.toHaveBeenCalled();
  });
});
