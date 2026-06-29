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
