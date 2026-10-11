import { supabase } from '../lib/supabase';
import {
  isPasskeyFeatureEnabled,
  toAuthenticationResponseJSON,
  toNativeAssertionOptions,
  toNativeRegistrationOptions,
  toRegistrationResponseJSON,
} from '../lib/passkeys';
import {
  createPasskeyCredentialAsync,
  getPasskeyAssertionAsync,
  isNativePasskeySupported,
} from '../../modules/nix-passkeys';

/** Passkey sign-in is offered only on a binary with the native module and a backend that enabled it. */
export function canOfferPasskeySignIn() {
  return isPasskeyFeatureEnabled() && isNativePasskeySupported();
}

/**
 * Supabase Auth passkey sign-in with the iOS system sheet (ASAuthorization):
 * challenge from `/passkeys/authentication/options` → platform assertion → `/verify`.
 * `verifyAuthentication` stores the session and emits `SIGNED_IN`, which `AuthProvider` handles
 * exactly like a password sign-in.
 */
export async function signInWithPasskey() {
  const { data: challenge, error: challengeError } = await supabase.auth.passkey.startAuthentication();
  if (challengeError || !challenge) return { data: null, error: challengeError ?? new Error('Passkey challenge unavailable') };
  const assertion = await getPasskeyAssertionAsync(toNativeAssertionOptions(challenge.options));
  return supabase.auth.passkey.verifyAuthentication({
    challengeId: challenge.challenge_id,
    credential: toAuthenticationResponseJSON(assertion),
  });
}

/**
 * Adds a passkey to the signed-in account (Profile → Privacy & security entry point, not wired yet:
 * see docs/auth-flow.md „Klucze dostępu”).
 */
export async function registerPasskeyForCurrentUser() {
  const { data: challenge, error: challengeError } = await supabase.auth.passkey.startRegistration();
  if (challengeError || !challenge) return { data: null, error: challengeError ?? new Error('Passkey challenge unavailable') };
  const registration = await createPasskeyCredentialAsync(toNativeRegistrationOptions(challenge.options));
  return supabase.auth.passkey.verifyRegistration({
    challengeId: challenge.challenge_id,
    credential: toRegistrationResponseJSON(registration),
  });
}
