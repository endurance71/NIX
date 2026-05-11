import { supabase } from '../lib/supabase';
import { DomainError } from './errors';
import { buildContentType, getImageBytes, NIX_ALLOWED_IMAGE_TYPES } from './mediaService';
import { getCurrentUser, getCurrentUserProfile } from './profileService';

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SEC = 60 * 60 * 24;

/** staleTime dla React Query — krócej niż TTL URL w Supabase, żeby odświeżyć przed wygaśnięciem. */
export const AVATAR_SIGNED_URL_STALE_TIME_MS = (SIGNED_URL_TTL_SEC - 120) * 1000;

function normalizeAvatarStoragePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return null;
  }

  // Starsze rekordy mogły zawierać prefiks bucketu; Supabase oczekuje ścieżki obiektu.
  if (trimmed.startsWith(`${AVATAR_BUCKET}/`)) return trimmed.slice(AVATAR_BUCKET.length + 1);
  if (trimmed.startsWith(`/${AVATAR_BUCKET}/`)) return trimmed.slice(AVATAR_BUCKET.length + 2);
  return trimmed.replace(/^\/+/, '');
}

export async function createSignedAvatarUrl(storagePath: string): Promise<string | null> {
  const directUrl = storagePath.trim();
  if (directUrl.startsWith('http://') || directUrl.startsWith('https://') || directUrl.startsWith('data:')) {
    return directUrl;
  }

  const normalizedPath = normalizeAvatarStoragePath(storagePath);
  if (!normalizedPath) return null;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(normalizedPath, SIGNED_URL_TTL_SEC);
  if (!error && data?.signedUrl) return data.signedUrl;

  // Fallback: endpoint pojedynczego podpisu potrafi zwrócić 400 mimo poprawnego path.
  const { data: batchData, error: batchError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls([normalizedPath], SIGNED_URL_TTL_SEC);

  const batchSignedUrl = batchData?.[0]?.signedUrl ?? null;
  if (batchError || !batchSignedUrl) {
    console.warn('createSignedAvatarUrl', error?.message ?? batchError?.message);
    return null;
  }

  return batchSignedUrl;
}

export async function createSignedAvatarUrls(storagePaths: string[]): Promise<Record<string, string>> {
  const directUrlsByRawPath: Record<string, string> = {};
  const storageLikePaths = storagePaths.filter((rawPath) => {
    const trimmed = rawPath.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
      directUrlsByRawPath[rawPath] = trimmed;
      return false;
    }
    return true;
  });

  const normalizedPairs = storageLikePaths.flatMap((rawPath) => {
    const normalized = normalizeAvatarStoragePath(rawPath);
    return normalized ? [[rawPath, normalized] as const] : [];
  });
  const uniquePaths = Array.from(new Set(normalizedPairs.map(([, normalized]) => normalized)));
  if (uniquePaths.length === 0) return directUrlsByRawPath;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SEC);

  if (error || !data) {
    console.warn('createSignedAvatarUrls batch', error?.message);
    const perPathResults = await Promise.all(
      uniquePaths.map(async (path) => {
        const signedUrl = await createSignedAvatarUrl(path);
        return signedUrl ? ([path, signedUrl] as const) : null;
      })
    );
    const fallbackMap: Record<string, string> = {};
    for (const item of perPathResults) {
      if (!item) continue;
      fallbackMap[item[0]] = item[1];
    }
    if (Object.keys(fallbackMap).length === 0) return directUrlsByRawPath;
    const byOriginalPath: Record<string, string> = { ...directUrlsByRawPath };
    for (const [rawPath, normalizedPath] of normalizedPairs) {
      const resolved = fallbackMap[normalizedPath];
      if (resolved) byOriginalPath[rawPath] = resolved;
    }
    return byOriginalPath;
  }

  const urlsByNormalizedPath: Record<string, string> = {};
  for (const row of data) {
    if (!row?.path || !row?.signedUrl) continue;
    urlsByNormalizedPath[row.path] = row.signedUrl;
  }

  const urlsByOriginalPath: Record<string, string> = { ...directUrlsByRawPath };
  for (const [rawPath, normalizedPath] of normalizedPairs) {
    const resolved = urlsByNormalizedPath[normalizedPath];
    if (resolved) urlsByOriginalPath[rawPath] = resolved;
  }
  return urlsByOriginalPath;
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

  if (!NIX_ALLOWED_IMAGE_TYPES.has(contentType)) {
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
