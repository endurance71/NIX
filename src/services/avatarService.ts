import { supabase } from '../lib/supabase';
import { normalizeAvatarEmoji } from '../lib/avatarEmoji';
import { DomainError } from './errors';
import { buildContentType, getImageBytes, SNAP_ALLOWED_IMAGE_TYPES } from './mediaService';
import { getCurrentUser, getCurrentUserProfile } from './profileService';

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SEC = 60 * 60 * 24;

/** staleTime dla React Query — krócej niż TTL URL w Supabase, żeby odświeżyć przed wygaśnięciem. */
export const AVATAR_SIGNED_URL_STALE_TIME_MS = (SIGNED_URL_TTL_SEC - 120) * 1000;

export async function createSignedAvatarUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    console.warn('createSignedAvatarUrl', error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function createSignedAvatarUrls(storagePaths: string[]): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(storagePaths.filter(Boolean)));
  if (uniquePaths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SEC);

  if (error || !data) {
    console.warn('createSignedAvatarUrls', error?.message);
    return {};
  }

  const urlsByPath: Record<string, string> = {};
  for (const row of data) {
    if (!row?.path || !row?.signedUrl) continue;
    urlsByPath[row.path] = row.signedUrl;
  }
  return urlsByPath;
}

async function safeRemoveAvatarObject(path: string | null | undefined, ownerId: string) {
  if (!path || !path.startsWith(`${ownerId}/`)) return;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) console.warn('safeRemoveAvatarObject', error.message);
}

export async function uploadProfileAvatarFromUri(fileUri: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  const bytes = await getImageBytes(fileUri);
  const { ext, contentType } = buildContentType(fileUri);

  if (!SNAP_ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new DomainError('INVALID_MEDIA', 'Nieobsługiwany format pliku.');
  }

  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new DomainError('INVALID_MEDIA', 'Zdjęcie jest za duże (maks. 5 MB).');
  }

  const profile = await getCurrentUserProfile();
  const previousPath = profile?.avatar_storage_path ?? null;

  const objectPath = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const { error: uploadError, data: uploadData } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(objectPath, bytes, { contentType, cacheControl: '86400', upsert: false });

  if (uploadError) throw new DomainError('INVALID_MEDIA', uploadError.message);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_storage_path: uploadData.path, avatar_emoji: null })
    .eq('id', user.id);

  if (updateError) {
    await supabase.storage.from(AVATAR_BUCKET).remove([uploadData.path]);
    throw new DomainError('UNKNOWN', updateError.message);
  }

  await safeRemoveAvatarObject(previousPath, user.id);
}

export async function setProfileAvatarEmoji(raw: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  let emoji: string;
  try {
    emoji = normalizeAvatarEmoji(raw);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Nieprawidłowe emoji.';
    throw new DomainError('INVALID_INPUT', msg);
  }

  const profile = await getCurrentUserProfile();
  const previousPath = profile?.avatar_storage_path ?? null;

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_emoji: emoji, avatar_storage_path: null })
    .eq('id', user.id);

  if (error) throw new DomainError('UNKNOWN', error.message);

  await safeRemoveAvatarObject(previousPath, user.id);
}

export async function clearProfileAvatar(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  const profile = await getCurrentUserProfile();
  const previousPath = profile?.avatar_storage_path ?? null;

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_emoji: null, avatar_storage_path: null })
    .eq('id', user.id);

  if (error) throw new DomainError('UNKNOWN', error.message);

  await safeRemoveAvatarObject(previousPath, user.id);
}
