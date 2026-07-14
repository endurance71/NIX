import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { saveAppleIdForCurrentUser } from './profileService';

export type SocialAuthProvider = 'google' | 'apple';

const NOT_CONFIGURED = 'SOCIAL_AUTH_NOT_CONFIGURED' as const;

export const APPLE_SIGN_IN_ERROR_CODES = {
  NO_IDENTITY_TOKEN: 'APPLE_SIGN_IN_NO_IDENTITY_TOKEN',
  UNAVAILABLE: 'APPLE_SIGN_IN_UNAVAILABLE',
} as const;

export function isSocialAuthNotConfiguredError(message: string) {
  return message === NOT_CONFIGURED;
}

function createRawNonce() {
  const generateRawNonce = (
    supabase.auth as { generateRawNonce?: () => string }
  ).generateRawNonce;

  if (typeof generateRawNonce === 'function') {
    return generateRawNonce.call(supabase.auth);
  }

  return Crypto.randomUUID();
}

async function sha256Hex(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function buildAppleFullNameMetadata(fullName: AppleAuthentication.AppleAuthenticationFullName | null) {
  if (!fullName) return null;

  const nameParts: string[] = [];
  if (fullName.givenName) nameParts.push(fullName.givenName);
  if (fullName.middleName) nameParts.push(fullName.middleName);
  if (fullName.familyName) nameParts.push(fullName.familyName);

  const full_name = nameParts.join(' ').trim();
  if (!full_name && !fullName.givenName && !fullName.familyName) return null;

  return {
    full_name: full_name || undefined,
    given_name: fullName.givenName ?? undefined,
    family_name: fullName.familyName ?? undefined,
  };
}

async function persistAppleProfileMetadata(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null,
  appleUserId: string | null
) {
  const metadata = buildAppleFullNameMetadata(fullName);
  if (metadata) {
    const { error } = await supabase.auth.updateUser({ data: metadata });
    if (error) throw error;
  }

  if (appleUserId) {
    await saveAppleIdForCurrentUser(appleUserId);
  }
}

function isNonceMismatchError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('nonce') && normalized.includes('mismatch');
}

async function signInWithAppleIdToken(identityToken: string, rawNonce: string) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce: rawNonce,
  });

  if (!error) return { data, error };

  if (isNonceMismatchError(error.message)) {
    return supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
    });
  }

  return { data, error };
}

export async function signInWithGoogle() {
  return {
    data: { session: null, user: null },
    error: { message: NOT_CONFIGURED, name: 'AuthError', status: 501 },
  };
}

export async function signInWithApple() {
  if (process.env.EXPO_OS !== 'ios') {
    return {
      data: { session: null, user: null },
      error: {
        message: APPLE_SIGN_IN_ERROR_CODES.UNAVAILABLE,
        name: 'AuthError',
        status: 400,
      },
    };
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    return {
      data: { session: null, user: null },
      error: {
        message: APPLE_SIGN_IN_ERROR_CODES.UNAVAILABLE,
        name: 'AuthError',
        status: 400,
      },
    };
  }

  try {
    const rawNonce = createRawNonce();
    const hashedNonce = await sha256Hex(rawNonce);

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return {
        data: { session: null, user: null },
        error: {
          message: APPLE_SIGN_IN_ERROR_CODES.NO_IDENTITY_TOKEN,
          name: 'AuthError',
          status: 400,
        },
      };
    }

    const { data, error } = await signInWithAppleIdToken(credential.identityToken, rawNonce);
    if (error) {
      return { data: { session: null, user: null }, error };
    }

    try {
      await persistAppleProfileMetadata(credential.fullName, credential.user);
    } catch (profileError) {
      console.warn('Apple profile metadata persistence failed', profileError);
    }

    return { data, error: null };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'ERR_REQUEST_CANCELED') {
      return { data: { session: null, user: null }, error: null };
    }

    return {
      data: { session: null, user: null },
      error: {
        message: err.message ?? 'Apple sign in failed',
        name: 'AuthError',
        status: 400,
      },
    };
  }
}
