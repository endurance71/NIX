import { supabase } from '../lib/supabase';
import { normalizeAvatarEmoji } from '../lib/avatarEmoji';
import type { User } from '@supabase/supabase-js';

export type CurrentUserProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  is_private: boolean;
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
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    cachedUser = session.user;
    cachedUserAt = now;
    return session.user;
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

function isMissingBioColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42703' ||
    (error.code === 'PGRST204' && error.message?.toLowerCase().includes('bio') === true)
  );
}

export async function getCurrentUserProfile(): Promise<CurrentUserProfileRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const withBioResult = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, is_private, avatar_storage_path, avatar_emoji')
    .eq('id', user.id)
    .maybeSingle();

  let data = withBioResult.data;
  let error = withBioResult.error;
  if (isMissingBioColumnError(error)) {
    const fallbackResult = await supabase
      .from('profiles')
      .select('id, username, display_name, is_private, avatar_storage_path, avatar_emoji')
      .eq('id', user.id)
      .maybeSingle();
    data = fallbackResult.data ? { ...fallbackResult.data, bio: null } : null;
    error = fallbackResult.error;
  }

  if (error) throw error;
  if (!data) return null;

  let avatarEmoji: string | null = data.avatar_emoji ?? null;
  if (avatarEmoji) {
    try {
      avatarEmoji = normalizeAvatarEmoji(avatarEmoji);
    } catch {
      avatarEmoji = null;
    }
  }

  return {
    id: data.id,
    username: data.username,
    display_name: data.display_name,
    bio: data.bio ?? null,
    is_private: data.is_private,
    avatar_storage_path: data.avatar_storage_path ?? null,
    avatar_emoji: avatarEmoji,
  };
}

export async function isUsernameTaken(username: string) {
  const user = await getCurrentUser();
  const { data, error } = await supabase.rpc('get_public_profile_by_username', {
    search_username: username,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !('id' in row)) return false;
  if (user && row.id === user.id) return false;

  return true;
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

export async function saveAppleIdForCurrentUser(appleUserId: string) {
  const user = await getCurrentUser();
  if (!user) return;

  const { data: existing, error: selectError } = await supabase
    .from('profiles')
    .select('apple_id')
    .eq('id', user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing?.apple_id) return;

  const { error } = await supabase.from('profiles').update({ apple_id: appleUserId }).eq('id', user.id);
  if (error) throw error;
}

export async function updateCurrentUserProfile(data: {
  display_name?: string | null;
  bio?: string | null;
  is_private?: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Brak sesji. Zaloguj się ponownie.');

  const { error } = await supabase.from('profiles').update(data).eq('id', user.id);
  if (error) throw error;
}
