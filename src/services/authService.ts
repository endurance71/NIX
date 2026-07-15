import { supabase } from '../lib/supabase';

const AUTH_REDIRECT_URL = 'nix://auth/callback';
export const LEGAL_DOCUMENT_VERSION = '2026-07-15';

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(
  email: string,
  password: string,
  locale: string = 'en',
  acceptedLegal = false
) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: AUTH_REDIRECT_URL,
      data: {
        language: locale,
        locale: locale,
        ...(acceptedLegal
          ? { terms_version: LEGAL_DOCUMENT_VERSION, privacy_version: LEGAL_DOCUMENT_VERSION }
          : {}),
      },
    },
  });
}

export async function recordCurrentLegalAcceptance() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) return { error: userError };
  if (!user) return { error: new Error('No authenticated user') };

  const { data: existing, error: existingError } = await supabase
    .from('legal_acceptances')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existingError || existing) return { error: existingError };

  return supabase.from('legal_acceptances').insert({
    user_id: user.id,
    terms_version: LEGAL_DOCUMENT_VERSION,
    privacy_version: LEGAL_DOCUMENT_VERSION,
  });
}

export async function requestPasswordReset(email: string) {
  // Recovery templates use {{ .Data.locale }} from existing user metadata (set at signUp).
  // resetPasswordForEmail does not accept custom data payload.
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: AUTH_REDIRECT_URL,
  });
}

export async function updatePassword(password: string, currentPassword?: string, nonce?: string) {
  return supabase.auth.updateUser({
    password,
    ...(currentPassword ? { current_password: currentPassword } : {}),
    ...(nonce ? { nonce } : {}),
  });
}

export async function reauthenticatePasswordChange() {
  return supabase.auth.reauthenticate();
}

export async function signOut() {
  return supabase.auth.signOut();
}
