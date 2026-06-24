/**
 * Social sign-in (Google / Apple) — UI and hook wiring are ready; native OAuth providers
 * are configured in a later sprint (Apple Developer Account, Supabase Auth providers).
 *
 * Replace the bodies of signInWithGoogle / signInWithApple with:
 * - Google: @react-native-google-signin/google-signin or expo-auth-session → id token
 * - Apple: expo-apple-authentication → identity token + nonce
 * - Both: supabase.auth.signInWithIdToken({ provider, token, nonce })
 */

export type SocialAuthProvider = 'google' | 'apple';

const NOT_CONFIGURED = 'SOCIAL_AUTH_NOT_CONFIGURED' as const;

export function isSocialAuthNotConfiguredError(message: string) {
  return message === NOT_CONFIGURED;
}

export async function signInWithGoogle() {
  return {
    data: { session: null, user: null },
    error: { message: NOT_CONFIGURED, name: 'AuthError', status: 501 },
  };
}

export async function signInWithApple() {
  return {
    data: { session: null, user: null },
    error: { message: NOT_CONFIGURED, name: 'AuthError', status: 501 },
  };
}
