import { supabase } from '../lib/supabase';

const AUTH_REDIRECT_URL = 'nix://auth/callback';

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: AUTH_REDIRECT_URL,
    },
  });
}

export async function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: AUTH_REDIRECT_URL,
  });
}

export async function updatePassword(password: string, nonce?: string) {
  return supabase.auth.updateUser({
    password,
    ...(nonce ? { nonce } : {}),
  });
}

export async function reauthenticatePasswordChange() {
  return supabase.auth.reauthenticate();
}

export async function signInWithAppleIdToken(token: string, nonce?: string) {
  return supabase.auth.signInWithIdToken({
    provider: 'apple',
    token,
    nonce,
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}
