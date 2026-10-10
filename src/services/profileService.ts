import { supabase } from '../lib/supabase';
import { normalizeAvatarEmoji } from '../lib/avatarEmoji';

export type CurrentUserProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  is_private: boolean;
  avatar_storage_path: string | null;
  avatar_emoji: string | null;
};

export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Kept for callers that clear account-scoped state on auth transitions. */
export function clearUserCache() {
  // Auth is read directly from Supabase; there is no cross-account module cache.
}

export async function getCurrentUserProfile(): Promise<CurrentUserProfileRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, is_private, avatar_storage_path, avatar_emoji')
    .eq('id', user.id)
    .maybeSingle();

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

/** Sets the one-time username together with the display name in a single write. */
export async function saveUsernameForCurrentUser(username: string, displayName?: string | null) {
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
    ...(displayName !== undefined ? { display_name: displayName } : {}),
  });

  // The unique index decides races the availability check cannot.
  if (error?.code === '23505') {
    throw Object.assign(new Error('USERNAME_TAKEN'), { code: 'USERNAME_TAKEN' });
  }
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
