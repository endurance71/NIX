import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { DomainError } from './errors';
import { buildContentType, getImageBytes, NIX_ALLOWED_IMAGE_TYPES } from './mediaService';
import { getCurrentUser, getCurrentUserProfile } from './profileService';

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SEC = 60 * 60 * 24;
/**
 * PERF-18: avatars render at 36–44 pt (≤ 132 px at @3x) and ~96 pt on the profile header, so
 * 384 px is enough for every surface; the old upload was the full crop (up to 5 MB).
 */
export const AVATAR_UPLOAD_SIZE_PX = 384;
export const AVATAR_UPLOAD_JPEG_QUALITY = 0.8;
/**
 * DB-13: every upload goes to a new `${userId}/${timestamp}_${random}.ext` object with
 * `upsert: false` and the profile row switches to it, so an object never changes content and can
 * be cached for a year.
 */
export const AVATAR_CACHE_CONTROL_SEC = '31536000';

/** Lifetime of a signed avatar URL issued by `createSignedAvatarUrl(s)`. */
export const AVATAR_SIGNED_URL_TTL_MS = SIGNED_URL_TTL_SEC * 1000;

/** staleTime dla React Query — krócej niż TTL URL w Supabase, żeby odświeżyć przed wygaśnięciem. */
export const AVATAR_SIGNED_URL_STALE_TIME_MS = (SIGNED_URL_TTL_SEC - 120) * 1000;

/** Legacy rows may hold a ready URL (http(s) or data:) instead of a storage path; it needs no signing. */
export function isDirectAvatarUrl(path: string): boolean {
  const trimmed = path.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:');
}

function normalizeAvatarStoragePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;

  if (isDirectAvatarUrl(trimmed)) return null;

  // Starsze rekordy mogły zawierać prefiks bucketu; Supabase oczekuje ścieżki obiektu.
  if (trimmed.startsWith(`${AVATAR_BUCKET}/`)) return trimmed.slice(AVATAR_BUCKET.length + 1);
  if (trimmed.startsWith(`/${AVATAR_BUCKET}/`)) return trimmed.slice(AVATAR_BUCKET.length + 2);
  return trimmed.replace(/^\/+/, '');
}

export async function createSignedAvatarUrl(storagePath: string): Promise<string | null> {
  if (isDirectAvatarUrl(storagePath)) return storagePath.trim();

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
    if (isDirectAvatarUrl(trimmed)) {
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

/**
 * Re-encodes the picked avatar as a JPEG whose long edge is at most `AVATAR_UPLOAD_SIZE_PX`.
 * Smaller sources are only re-encoded (never upscaled). Returns the original URI if the native
 * manipulator fails, so the upload still works (the 5 MB guard below stays in place).
 */
export async function prepareAvatarImageForUpload(fileUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(fileUri);
  try {
    const source = await context.renderAsync();
    try {
      const longEdge = Math.max(source.width, source.height);
      if (longEdge <= AVATAR_UPLOAD_SIZE_PX) {
        const saved = await source.saveAsync({ compress: AVATAR_UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
        return saved.uri;
      }
      const resizeContext = ImageManipulator.manipulate(source);
      try {
        if (source.height > source.width) resizeContext.resize({ height: AVATAR_UPLOAD_SIZE_PX });
        else resizeContext.resize({ width: AVATAR_UPLOAD_SIZE_PX });
        const resized = await resizeContext.renderAsync();
        try {
          const saved = await resized.saveAsync({ compress: AVATAR_UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
          return saved.uri;
        } finally {
          resized.release();
        }
      } finally {
        resizeContext.release();
      }
    } finally {
      source.release();
    }
  } catch (error) {
    console.warn('prepareAvatarImageForUpload', error instanceof Error ? error.message : error);
    return fileUri;
  } finally {
    context.release();
  }
}

export async function uploadProfileAvatarFromUri(fileUri: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  const uploadUri = await prepareAvatarImageForUpload(fileUri);
  const bytes = await getImageBytes(uploadUri);
  const { ext, contentType } = buildContentType(uploadUri);

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
    .upload(objectPath, bytes, { contentType, cacheControl: AVATAR_CACHE_CONTROL_SEC, upsert: false });

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
