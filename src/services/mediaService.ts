import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { VideoThumbnail } from 'expo-video';
import { Video as VideoCompressor } from 'react-native-compressor';
import { supabase } from '../lib/supabase';
import { generateVideoThumbnailAtTime } from '../lib/videoThumbnails';
import { insertNix } from './nixService';
import { getCurrentUser } from './profileService';
import { DomainError } from './errors';
import { nowMs, trackDuration, trackEvent } from '../lib/telemetry';
import { uploadResumable } from './resumableUploadService';

export function buildContentType(fileUri: string) {
  const ext = fileUri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
  const normalizedExt = ext === 'jpg' ? 'jpeg' : ext;
  return {
    ext,
    contentType: `image/${normalizedExt}`,
  };
}

function buildVideoContentType(fileUri: string) {
  const ext = fileUri.split('?')[0].split('.').pop()?.toLowerCase() || 'mp4';
  const contentType =
    ext === 'mov' ? 'video/quicktime' : ext === 'm4v' ? 'video/x-m4v' : 'video/mp4';
  return { ext, contentType };
}

export const NIX_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const NIX_ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v']);

const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const TARGET_IMAGE_LONG_EDGE = 1440;
const TARGET_IMAGE_QUALITY = 0.78;
const TARGET_VIDEO_BITRATE = 2_000_000;
const TARGET_VIDEO_LONG_FORM_BITRATE = 1_500_000;
const TARGET_VIDEO_MAX_SIZE = 1280;
const TARGET_VIDEO_AGGRESSIVE_BITRATE = 900_000;
const TARGET_VIDEO_AGGRESSIVE_MAX_SIZE = 960;
const UPLOAD_RETRY_DELAYS_MS = [600, 1400, 3000];
/**
 * Limit pliku wideo akceptowanego przez aplikację. Po przejściu na resumable
 * (TUS) upload OOM nie jest już wąskim gardłem; zostawiamy bezpieczny bufor
 * względem 400 MB limitu bucketa.
 */
export const MAX_VIDEO_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE_MB = Math.round(MAX_VIDEO_FILE_SIZE_BYTES / (1024 * 1024));
const BYTES_IN_MB = 1024 * 1024;
/**
 * Próg dla fast-path pomijającego kompresję `react-native-compressor`.
 * Nagrania z aparatu są już ograniczone bitratem 2.5 Mbps, więc kompresja
 * małych klipów daje minimalny zysk przy znaczącym koszcie CPU/baterii.
 */
const VIDEO_FAST_PATH_MAX_BYTES = 10 * 1024 * 1024;
const SUPABASE_MAX_OBJECT_SIZE_ERROR = 'The object exceeded the maximum allowed size';
const SUPABASE_RESOURCE_ALREADY_EXISTS_ERROR = 'The resource already exists';
const SUPABASE_MISSING_THUMBNAIL_COLUMN_ERROR = "Could not find the 'thumbnail_b64' column";

const THUMBNAIL_TARGET_WIDTH = 240;
const THUMBNAIL_FALLBACK_WIDTH = 200;
const THUMBNAIL_TARGET_QUALITY = 0.55;
const THUMBNAIL_FALLBACK_QUALITY = 0.4;
/** Maksymalny rozmiar binarki miniatury (≈45 KB) — synchronicznie z CHECK w SQL. */
const THUMBNAIL_MAX_BINARY_BYTES = 45 * 1024;

function mapStorageUploadError(message: string) {
  if (message.includes(SUPABASE_MAX_OBJECT_SIZE_ERROR)) {
    return `Plik wideo przekracza limit uploadu serwera. Utrzymaj plik poniżej ${MAX_VIDEO_FILE_SIZE_MB} MB.`;
  }
  return message;
}

function isMissingThumbnailColumnError(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  return (
    message.includes('column nixes.thumbnail_b64 does not exist') ||
    message.includes(SUPABASE_MISSING_THUMBNAIL_COLUMN_ERROR) ||
    (message.includes('thumbnail_b64') && message.includes('schema cache'))
  );
}

type MediaUploadPhase = 'reading' | 'compressing' | 'thumbnail' | 'uploading' | 'creating_record' | 'cleanup';

export type MediaUploadProgress = {
  phase: MediaUploadPhase;
  progress: number;
  bytesSent?: number;
  bytesTotal?: number;
  attempt?: number;
};

export type MediaUploadOptions = {
  onProgress?: (progress: MediaUploadProgress) => void;
  signal?: AbortSignal;
  clientUploadId?: string;
};

type PreparedMedia = {
  uri: string;
  originalUri: string;
  originalSizeBytes: number | null;
  sizeBytes: number | null;
  temporaryUris: string[];
  thumbnailUri?: string | null;
  thumbnailTemporaryUris?: string[];
  /**
   * Embedded miniatura jako data URL JPEG (`data:image/jpeg;base64,...`).
   * Trafia do `nixes.thumbnail_b64` i jest serwowana odbiorcy bez dodatkowego
   * pobrania ze Storage. `null`, jeśli nie udało się zmieścić w limicie.
   */
  thumbnailDataUrl?: string | null;
};

function emitProgress(options: MediaUploadOptions | undefined, progress: MediaUploadProgress) {
  options?.onProgress?.(progress);
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DomainError('CANCELLED', 'Wysyłka została anulowana.');
  }
}

async function getFileSizeBytes(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
}

async function safeDeleteTemporaryUris(uris: readonly string[]) {
  await Promise.all(
    uris.map(async (uri) => {
      try {
        if (!uri.startsWith('file://')) return;
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // Best-effort cleanup. System cache can also evict these files.
      }
    })
  );
}

function isTestRuntime() {
  return process.env.NODE_ENV === 'test' || typeof navigator === 'undefined';
}

export async function prepareImageForUpload(fileUri: string, options?: MediaUploadOptions): Promise<PreparedMedia> {
  const startedAt = nowMs();
  const originalSizeBytes = await getFileSizeBytes(fileUri);
  emitProgress(options, { phase: 'compressing', progress: 0.05 });

  if (isTestRuntime()) {
    return {
      uri: fileUri,
      originalUri: fileUri,
      originalSizeBytes,
      sizeBytes: originalSizeBytes,
      temporaryUris: [],
    };
  }

  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    // Resize by longest edge to avoid upscaling narrow portrait shots.
    const resizeAction = { resize: { width: TARGET_IMAGE_LONG_EDGE } };
    const result = await manipulateAsync(
      fileUri,
      [resizeAction],
      { compress: TARGET_IMAGE_QUALITY, format: SaveFormat.JPEG, base64: false }
    );
    const sizeBytes = await getFileSizeBytes(result.uri);
    emitProgress(options, { phase: 'compressing', progress: 1 });
    trackDuration('compression_ms', startedAt, {
      status: 'success',
      media_type: 'image',
      media_original_bytes: originalSizeBytes,
      media_compressed_bytes: sizeBytes,
    });
    return {
      uri: result.uri,
      originalUri: fileUri,
      originalSizeBytes,
      sizeBytes,
      temporaryUris: result.uri === fileUri ? [] : [result.uri],
    };
  } catch (error) {
    trackDuration('compression_ms', startedAt, {
      status: 'failure',
      media_type: 'image',
      error_message: error instanceof Error ? error.message : 'Unknown image compression error',
    });
    return {
      uri: fileUri,
      originalUri: fileUri,
      originalSizeBytes,
      sizeBytes: originalSizeBytes,
      temporaryUris: [],
    };
  }
}

/**
 * Generuje data URL JPEG dla miniatury wideo z kontrolą rozmiaru.
 * Próbuje najpierw 240px @ q=0.55; przy przekroczeniu limitu schodzi do 200px @ q=0.4.
 * Zwraca `{ dataUrl, byteLength }` lub `null`, jeśli nie udało się zmieścić w limicie.
 */
async function buildThumbnailDataUrl(
  thumbnailSource: VideoThumbnail,
  temporaryUris: string[]
): Promise<{ dataUrl: string; byteLength: number } | null> {
  type Variant = { width: number; quality: number };
  const variants: Variant[] = [
    { width: THUMBNAIL_TARGET_WIDTH, quality: THUMBNAIL_TARGET_QUALITY },
    { width: THUMBNAIL_FALLBACK_WIDTH, quality: THUMBNAIL_FALLBACK_QUALITY },
  ];

  const tryVariantAt = async (index: number): Promise<{ dataUrl: string; byteLength: number } | null> => {
    if (index >= variants.length) return null;
    const variant = variants[index];
    try {
      const context = ImageManipulator.manipulate(thumbnailSource);
      context.resize({ width: variant.width });
      const image = await context.renderAsync();
      let result: { uri: string };
      try {
        result = await image.saveAsync({
          compress: variant.quality,
          format: SaveFormat.JPEG,
        });
      } finally {
        image.release();
        context.release();
      }

      temporaryUris.push(result.uri);

      const base64 = await FileSystem.readAsStringAsync(result.uri, {
        encoding: 'base64',
      });
      const byteLength = Math.floor((base64.length * 3) / 4);
      if (byteLength <= THUMBNAIL_MAX_BINARY_BYTES) {
        return { dataUrl: `data:image/jpeg;base64,${base64}`, byteLength };
      }
    } catch (error) {
      trackEvent('thumbnail_b64_variant_failed', {
        media_type: 'video',
        width: variant.width,
        quality: variant.quality,
        error_message: error instanceof Error ? error.message : 'Unknown thumbnail variant error',
      });
    }
    return tryVariantAt(index + 1);
  };

  return tryVariantAt(0);
}

export async function prepareVideoForUpload(fileUri: string, options?: MediaUploadOptions): Promise<PreparedMedia> {
  const startedAt = nowMs();
  const originalSizeBytes = await getFileSizeBytes(fileUri);
  emitProgress(options, { phase: 'compressing', progress: 0.02 });

  if (isTestRuntime()) {
    return {
      uri: fileUri,
      originalUri: fileUri,
      originalSizeBytes,
      sizeBytes: originalSizeBytes,
      temporaryUris: [],
      thumbnailUri: null,
      thumbnailTemporaryUris: [],
      thumbnailDataUrl: null,
    };
  }

  let compressedUri = fileUri;
  const temporaryUris: string[] = [];
  // Fast-path: lokalne nagrania o małym rozmiarze są już ograniczone bitratem
  // 2.5 Mbps przez kamerę — rekompresja daje znikomy zysk za istotny koszt CPU.
  const fastPathEligible =
    typeof originalSizeBytes === 'number' &&
    originalSizeBytes > 0 &&
    originalSizeBytes <= VIDEO_FAST_PATH_MAX_BYTES &&
    fileUri.startsWith('file://');

  if (fastPathEligible) {
    trackEvent('compression_skipped', {
      media_type: 'video',
      media_original_bytes: originalSizeBytes,
      reason: 'fast_path',
      threshold_bytes: VIDEO_FAST_PATH_MAX_BYTES,
    });
    emitProgress(options, { phase: 'compressing', progress: 0.95 });
  } else {
    try {
      const useLowerBitrate =
        typeof originalSizeBytes === 'number' && originalSizeBytes > 30 * 1024 * 1024;
      compressedUri = await VideoCompressor.compress(
        fileUri,
        {
          compressionMethod: 'auto',
          bitrate: useLowerBitrate ? TARGET_VIDEO_LONG_FORM_BITRATE : TARGET_VIDEO_BITRATE,
          maxSize: TARGET_VIDEO_MAX_SIZE,
          minimumFileSizeForCompress: 1,
          progressDivider: 5,
        },
        (progress) => {
          emitProgress(options, { phase: 'compressing', progress: Math.max(0.02, Math.min(0.95, progress)) });
        }
      );
      if (compressedUri !== fileUri) temporaryUris.push(compressedUri);

      const firstPassSize = await getFileSizeBytes(compressedUri);
      if (typeof firstPassSize === 'number' && firstPassSize > MAX_VIDEO_FILE_SIZE_BYTES) {
        const aggressiveUri = await VideoCompressor.compress(
          compressedUri,
          {
            compressionMethod: 'auto',
            bitrate: TARGET_VIDEO_AGGRESSIVE_BITRATE,
            maxSize: TARGET_VIDEO_AGGRESSIVE_MAX_SIZE,
            minimumFileSizeForCompress: 1,
            progressDivider: 5,
          },
          (progress) => {
            emitProgress(options, { phase: 'compressing', progress: Math.max(0.4, Math.min(0.95, progress)) });
          }
        );
        if (aggressiveUri !== compressedUri) {
          temporaryUris.push(aggressiveUri);
          compressedUri = aggressiveUri;
        }
        trackEvent('compression_aggressive_pass', {
          media_type: 'video',
          first_pass_bytes: firstPassSize,
          final_bytes: await getFileSizeBytes(compressedUri),
        });
      }
    } catch (error) {
      trackEvent('compression_fallback', {
        media_type: 'video',
        error_message: error instanceof Error ? error.message : 'Unknown video compression error',
      });
    }
  }

  let thumbnailUri: string | null = null;
  let thumbnailDataUrl: string | null = null;
  const thumbnailTemporaryUris: string[] = [];
  try {
    emitProgress(options, { phase: 'thumbnail', progress: 0.2 });
    const thumbRef = await generateVideoThumbnailAtTime(compressedUri, 0, { maxWidth: 1280 });
    if (thumbRef) {
      const previewContext = ImageManipulator.manipulate(thumbRef);
      const previewImage = await previewContext.renderAsync();
      let previewSaved: { uri: string };
      try {
        previewSaved = await previewImage.saveAsync({
          compress: 0.88,
          format: SaveFormat.JPEG,
        });
      } finally {
        previewImage.release();
        previewContext.release();
      }
      thumbnailUri = previewSaved.uri;
      thumbnailTemporaryUris.push(previewSaved.uri);

      const dataUrlResult = await buildThumbnailDataUrl(thumbRef, thumbnailTemporaryUris);
      if (dataUrlResult) {
        thumbnailDataUrl = dataUrlResult.dataUrl;
        trackEvent('thumbnail_b64_size_bytes', {
          media_type: 'video',
          bytes: dataUrlResult.byteLength,
        });
      } else {
        trackEvent('thumbnail_b64_skipped', {
          media_type: 'video',
          reason: 'over_limit',
          limit_bytes: THUMBNAIL_MAX_BINARY_BYTES,
        });
      }
    } else {
      trackEvent('thumbnail_generation_failed', {
        media_type: 'video',
        error_message: 'generateVideoThumbnailAtTime returned null',
      });
    }
    emitProgress(options, { phase: 'thumbnail', progress: 1 });
  } catch (error) {
    trackEvent('thumbnail_generation_failed', {
      media_type: 'video',
      error_message: error instanceof Error ? error.message : 'Unknown thumbnail error',
    });
  }

  const sizeBytes = await getFileSizeBytes(compressedUri);
  trackDuration('compression_ms', startedAt, {
    status: fastPathEligible ? 'skipped' : compressedUri === fileUri ? 'fallback' : 'success',
    media_type: 'video',
    media_original_bytes: originalSizeBytes,
    media_compressed_bytes: sizeBytes,
    thumbnail_generated: Boolean(thumbnailUri),
    thumbnail_b64_embedded: Boolean(thumbnailDataUrl),
  });

  return {
    uri: compressedUri,
    originalUri: fileUri,
    originalSizeBytes,
    sizeBytes,
    temporaryUris,
    thumbnailUri,
    thumbnailTemporaryUris,
    thumbnailDataUrl,
  };
}

async function uploadWithRetry(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  options: { contentType: string; cacheControl?: string },
  uploadOptions?: MediaUploadOptions
) {
  const uploadAttempt = async (attempt: number): Promise<{ path: string }> => {
    assertNotCancelled(uploadOptions?.signal);
    emitProgress(uploadOptions, {
      phase: 'uploading',
      progress: Math.min(0.95, attempt === 1 ? 0.05 : 0.1),
      bytesTotal: bytes.byteLength,
      attempt,
    });

    const startedAt = nowMs();
    const { error, data } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, {
        contentType: options.contentType,
        cacheControl: options.cacheControl ?? '3600',
        upsert: false,
      });

    trackDuration('upload_ms', startedAt, {
      bucket,
      status: error ? 'failure' : 'success',
      attempt,
      media_bytes: bytes.byteLength,
    });

    if (!error) {
      emitProgress(uploadOptions, {
        phase: 'uploading',
        progress: 1,
        bytesSent: bytes.byteLength,
        bytesTotal: bytes.byteLength,
        attempt,
      });
      return data;
    }

    if (isStorageObjectAlreadyExistsError(error.message)) {
      emitProgress(uploadOptions, {
        phase: 'uploading',
        progress: 1,
        bytesSent: bytes.byteLength,
        bytesTotal: bytes.byteLength,
        attempt,
      });
      return { path };
    }

    if (attempt > UPLOAD_RETRY_DELAYS_MS.length) {
      const message =
        typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Nie udało się przesłać pliku.';
      throw new DomainError('INVALID_MEDIA', mapStorageUploadError(message));
    }

    const retryDelayMs = isTestRuntime() ? 0 : UPLOAD_RETRY_DELAYS_MS[attempt - 1];
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return uploadAttempt(attempt + 1);
  };

  return uploadAttempt(1);
}

function isStorageObjectAlreadyExistsError(message: unknown): boolean {
  return typeof message === 'string' && message.includes(SUPABASE_RESOURCE_ALREADY_EXISTS_ERROR);
}

async function fetchArrayBufferViaXhr(fileUri: string): Promise<ArrayBuffer> {
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new DomainError('INVALID_MEDIA', 'Nie udało się odczytać pliku lokalnego.'));
    xhr.onload = () => {
      const res = xhr.response;
      if (res instanceof ArrayBuffer) {
        resolve(res);
        return;
      }
      reject(new DomainError('INVALID_MEDIA', 'Nie udało się odczytać pliku lokalnego.'));
    };
    xhr.responseType = 'arraybuffer';
    xhr.open('GET', fileUri, true);
    xhr.send();
  });
}

/**
 * Bajty do uploadu — bez Blobów. W RN Blob + FormData w storage-js potrafi zapisać 0 B w bucketcie.
 */
export async function getImageBytes(fileUri: string): Promise<Uint8Array> {
  let buffer: ArrayBuffer | null = null;

  try {
    const response = await fetch(fileUri);
    buffer = await response.arrayBuffer();
    if (buffer.byteLength > 0) {
      return new Uint8Array(buffer);
    }
  } catch {
    // Fallback: XHR bywa stabilniejszy na iOS (file:// / ph://).
  }

  if (typeof XMLHttpRequest === 'undefined') {
    throw new DomainError('INVALID_MEDIA', 'Nie udało się odczytać pliku do wysyłki.');
  }

  buffer = await fetchArrayBufferViaXhr(fileUri);
  if (buffer.byteLength <= 0) {
    throw new DomainError('INVALID_MEDIA', 'Plik jest pusty lub uszkodzony.');
  }
  return new Uint8Array(buffer);
}

export async function uploadImageAndCreateNix(
  fileUri: string,
  receiverId: string,
  viewDurationSec = 5,
  options?: MediaUploadOptions
) {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  assertNotCancelled(options?.signal);
  const prepared = await prepareImageForUpload(fileUri, options);
  emitProgress(options, { phase: 'reading', progress: 0 });
  const bytes = await getImageBytes(prepared.uri);
  const { contentType } = buildContentType(prepared.uri);
  const ext = 'jpg';

  if (!receiverId) {
    throw new DomainError('INVALID_RECEIVER', 'Wybierz poprawnego odbiorcę.');
  }

  if (!NIX_ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new DomainError('INVALID_MEDIA', 'Nieobsługiwany format pliku.');
  }

  if (bytes.byteLength > MAX_IMAGE_FILE_SIZE_BYTES) {
    throw new DomainError('INVALID_MEDIA', 'Plik jest za duży. Maksymalny rozmiar to 10 MB.');
  }

  const stableUploadId = options?.clientUploadId?.replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${user.id}/${stableUploadId || `${Date.now()}_${Math.random().toString(36).substring(7)}`}.${ext}`;
  const filePath = `nixes/${fileName}`;

  const hasExistingNix = async () => {
    if (typeof (supabase as { from?: unknown }).from !== 'function') return false;
    const { data } = await supabase
      .from('nixes')
      .select('id')
      .eq('sender_id', user.id)
      .eq('receiver_id', receiverId)
      .eq('media_path', filePath)
      .limit(1)
      .maybeSingle();
    return Boolean(data?.id);
  };

  try {
    const uploadData = await uploadWithRetry('media-vault', filePath, bytes, { contentType }, options);
    emitProgress(options, { phase: 'creating_record', progress: 0.5 });
    if (!(await hasExistingNix())) {
      await insertNix(receiverId, uploadData.path, viewDurationSec, {
        clientUploadId: stableUploadId ?? filePath,
      });
    }
    emitProgress(options, { phase: 'creating_record', progress: 1 });
  } finally {
    emitProgress(options, { phase: 'cleanup', progress: 0 });
    await safeDeleteTemporaryUris(prepared.temporaryUris);
    emitProgress(options, { phase: 'cleanup', progress: 1 });
  }
}

export async function uploadVideoAndCreateNix(
  fileUri: string,
  receiverId: string,
  playbackDurationMs: number,
  viewDurationSec = 5,
  options?: MediaUploadOptions
) {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  assertNotCancelled(options?.signal);
  const prepared = await prepareVideoForUpload(fileUri, options);
  emitProgress(options, { phase: 'reading', progress: 0 });

  const { ext, contentType } = buildVideoContentType(prepared.uri);

  if (!receiverId) {
    throw new DomainError('INVALID_RECEIVER', 'Wybierz poprawnego odbiorcę.');
  }

  if (!NIX_ALLOWED_VIDEO_TYPES.has(contentType)) {
    throw new DomainError('INVALID_MEDIA', 'Nieobsługiwany format wideo.');
  }

  // Walidacja rozmiaru bez wczytywania pliku do RAM. Korzystamy z `prepared.sizeBytes`
  // (po kompresji) lub `originalSizeBytes` (fast-path / fallback).
  const finalSizeBytes = prepared.sizeBytes ?? prepared.originalSizeBytes ?? null;
  if (typeof finalSizeBytes !== 'number' || finalSizeBytes <= 0) {
    throw new DomainError('INVALID_MEDIA', 'Plik jest pusty lub uszkodzony.');
  }
  if (finalSizeBytes > MAX_VIDEO_FILE_SIZE_BYTES) {
    const finalSizeMb = (finalSizeBytes / BYTES_IN_MB).toFixed(1);
    throw new DomainError(
      'INVALID_MEDIA',
      `Plik nadal jest za duży po kompresji (${finalSizeMb} MB). Maksymalny rozmiar to ${MAX_VIDEO_FILE_SIZE_MB} MB — wybierz krótsze wideo.`
    );
  }

  const stableUploadId = options?.clientUploadId?.replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${user.id}/${stableUploadId || `${Date.now()}_${Math.random().toString(36).substring(7)}`}.${ext}`;
  const filePath = `nixes/${fileName}`;

  const hasExistingNix = async () => {
    if (typeof (supabase as { from?: unknown }).from !== 'function') return false;
    const { data } = await supabase
      .from('nixes')
      .select('id')
      .eq('sender_id', user.id)
      .eq('receiver_id', receiverId)
      .eq('media_path', filePath)
      .limit(1)
      .maybeSingle();
    return Boolean(data?.id);
  };

  emitProgress(options, {
    phase: 'uploading',
    progress: 0,
    bytesSent: 0,
    bytesTotal: finalSizeBytes,
    attempt: 1,
  });

  const uploadStartedAt = nowMs();
  try {
    await uploadResumable({
      bucket: 'media-vault',
      objectPath: filePath,
      fileUri: prepared.uri,
      contentType,
      fileSizeBytes: finalSizeBytes,
      cacheControl: '3600',
      upsert: false,
      signal: options?.signal,
      onProgress: ({ bytesSent, bytesTotal, attempt }) => {
        emitProgress(options, {
          phase: 'uploading',
          progress: bytesTotal > 0 ? Math.min(0.99, bytesSent / bytesTotal) : 0,
          bytesSent,
          bytesTotal,
          attempt,
        });
      },
    });

    trackDuration('upload_ms', uploadStartedAt, {
      bucket: 'media-vault',
      status: 'success',
      media_bytes: finalSizeBytes,
      transport: 'resumable',
    });

    emitProgress(options, {
      phase: 'uploading',
      progress: 1,
      bytesSent: finalSizeBytes,
      bytesTotal: finalSizeBytes,
      attempt: 1,
    });

    emitProgress(options, { phase: 'creating_record', progress: 0.5 });
    if (!(await hasExistingNix())) {
      try {
        await insertNix(receiverId, filePath, viewDurationSec, {
          mediaType: 'video',
          playbackDurationMs,
          clientUploadId: stableUploadId ?? filePath,
          thumbnailB64: prepared.thumbnailDataUrl ?? null,
        });
      } catch (error) {
        // Cross-env schema mismatch: jeśli migracja `thumbnail_b64` nie weszła,
        // ponawiamy insert bez miniatury zamiast failować upload.
        if (!isMissingThumbnailColumnError(error)) throw error;
        trackEvent('thumbnail_b64_skipped', {
          media_type: 'video',
          reason: 'missing_db_column',
        });
        await insertNix(receiverId, filePath, viewDurationSec, {
          mediaType: 'video',
          playbackDurationMs,
          clientUploadId: stableUploadId ?? filePath,
          thumbnailB64: null,
        });
      }
    }
    emitProgress(options, { phase: 'creating_record', progress: 1 });
  } catch (error) {
    trackDuration('upload_ms', uploadStartedAt, {
      bucket: 'media-vault',
      status: 'failure',
      media_bytes: finalSizeBytes,
      transport: 'resumable',
      error_message: error instanceof Error ? error.message : 'Unknown resumable error',
    });
    if (error instanceof DomainError) throw error;
    const message = error instanceof Error ? error.message : 'Nie udało się przesłać pliku.';
    throw new DomainError('INVALID_MEDIA', mapStorageUploadError(message));
  } finally {
    emitProgress(options, { phase: 'cleanup', progress: 0 });
    await safeDeleteTemporaryUris([
      ...prepared.temporaryUris,
      ...(prepared.thumbnailTemporaryUris ?? []),
    ]);
    emitProgress(options, { phase: 'cleanup', progress: 1 });
  }
}
