import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { saveAppleIdForCurrentUser } from './profileService';
import { recordCurrentLegalAcceptance } from './authService';

const NOT_CONFIGURED = 'SOCIAL_AUTH_NOT_CONFIGURED' as const;

export const APPLE_SIGN_IN_ERROR_CODES = {
  NO_IDENTITY_TOKEN: 'APPLE_SIGN_IN_NO_IDENTITY_TOKEN',
  NO_AUTHORIZATION_CODE: 'APPLE_SIGN_IN_NO_AUTHORIZATION_CODE',
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

function authError(message: string) {
  return {
    data: { session: null, user: null },
    error: {
      message,
      name: 'AuthError',
      status: 400,
    },
  };
}

async function requestAppleCredential() {
  if (process.env.EXPO_OS !== 'ios') {
    return { credential: null, rawNonce: null, error: authError(APPLE_SIGN_IN_ERROR_CODES.UNAVAILABLE).error };
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    return { credential: null, rawNonce: null, error: authError(APPLE_SIGN_IN_ERROR_CODES.UNAVAILABLE).error };
  }

  const rawNonce = createRawNonce();
  const hashedNonce = await sha256Hex(rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  return { credential, rawNonce, error: null };
}

export async function signInWithApple() {
  try {
    const requested = await requestAppleCredential();
    if (requested.error) return { data: { session: null, user: null }, error: requested.error };
    const { credential, rawNonce } = requested;
    if (!credential?.identityToken || !rawNonce) {
      return authError(APPLE_SIGN_IN_ERROR_CODES.NO_IDENTITY_TOKEN);
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) {
      return { data: { session: null, user: null }, error };
    }

    try {
      await persistAppleProfileMetadata(credential.fullName, credential.user);
      await recordCurrentLegalAcceptance();
    } catch (profileError) {
      console.warn('Apple profile metadata persistence failed', profileError);
    }

    return { data, error: null };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'ERR_REQUEST_CANCELED') {
      return { data: { session: null, user: null }, error: null };
    }

    return authError(err.message ?? 'Apple sign in failed');
  }
}

export async function reauthenticateAppleForAccountDeletion() {
  try {
    if (process.env.EXPO_OS !== 'ios') {
      return { authorizationCode: null, error: authError(APPLE_SIGN_IN_ERROR_CODES.UNAVAILABLE).error };
    }

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      return { authorizationCode: null, error: authError(APPLE_SIGN_IN_ERROR_CODES.UNAVAILABLE).error };
    }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [],
    });
    // Keep the code in memory only. Do not call signInWithIdToken or otherwise
    // replace the current Supabase session. S4 exchanges this code on the backend.
    if (!credential.authorizationCode) {
      return { authorizationCode: null, error: authError(APPLE_SIGN_IN_ERROR_CODES.NO_AUTHORIZATION_CODE).error };
    }

    return { authorizationCode: credential.authorizationCode, error: null };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'ERR_REQUEST_CANCELED') {
      return { authorizationCode: null, error: authError(APPLE_SIGN_IN_ERROR_CODES.UNAVAILABLE).error };
    }
    return { authorizationCode: null, error: authError(err.message ?? 'Apple sign in failed').error };
  }
}
