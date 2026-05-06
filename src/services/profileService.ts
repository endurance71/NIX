import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export type BasicProfile = {
  id: string;
  username: string | null;
  avatar_storage_path?: string | null;
  avatar_emoji?: string | null;
};

export type CurrentUserProfileRow = {
  id: string;
  username: string | null;
  avatar_storage_path: string | null;
  avatar_emoji: string | null;
};

/** TTL for the cached auth user (ms). */
const USER_CACHE_TTL_MS = 30_000;
let cachedUser: User | null = null;
let cachedUserAt = 0;

export async function getCurrentUser() {
  const now = Date.now();
  if (cachedUser && now - cachedUserAt < USER_CACHE_TTL_MS) {
    return cachedUser;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  cachedUser = user;
  cachedUserAt = now;
  return user;
}

/** Clear the cached user — call on sign-out. */
export function clearUserCache() {
  cachedUser = null;
  cachedUserAt = 0;
}

export async function getCurrentUserProfile(): Promise<CurrentUserProfileRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_storage_path, avatar_emoji')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    avatar_storage_path: data.avatar_storage_path ?? null,
    avatar_emoji: data.avatar_emoji ?? null,
  };
}

export async function listOtherProfiles() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc('list_public_profiles');

  if (error) throw error;
  const rows = (data ?? []) as BasicProfile[];
  return rows.filter((profile) => profile.id !== user.id).map((row) => ({
    id: row.id,
    username: row.username,
    avatar_storage_path: row.avatar_storage_path ?? null,
    avatar_emoji: row.avatar_emoji ?? null,
  }));
}

export async function isUsernameTaken(username: string) {
  const { data, error } = await supabase.rpc('get_public_profile_by_username', {
    search_username: username,
  });

  if (error) throw error;
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

export async function saveUsernameForCurrentUser(username: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Brak sesji. Zaloguj się ponownie.');
  }

  const currentProfile = await getCurrentUserProfile();
  if (currentProfile?.username) {
    throw new Error('Nazwa użytkownika została już ustawiona i nie może być zmieniona.');
  }

  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    username,
  });

  if (error) throw error;
}
