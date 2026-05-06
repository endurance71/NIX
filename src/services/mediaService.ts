import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { insertSnap } from './snapService';
import { getCurrentUser } from './profileService';
import { DomainError } from './errors';
import { nowMs, trackDuration, trackEvent } from '../lib/telemetry';

export function buildContentType(fileUri: string) {
  const ext = fileUri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
  const normalizedExt = ext === 'jpg' ? 'jpeg' : ext;
  return {
    ext,
    contentType: `image/${normalizedExt}`,
  };
}

export function buildVideoContentType(fileUri: string) {
  const ext = fileUri.split('?')[0].split('.').pop()?.toLowerCase() || 'mp4';
  const contentType =
    ext === 'mov' ? 'video/quicktime' : ext === 'm4v' ? 'video/x-m4v' : 'video/mp4';
  return { ext, contentType };
}

export const SNAP_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const SNAP_ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v']);

const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const TARGET_IMAGE_LONG_EDGE = 1440;
const TARGET_IMAGE_QUALITY = 0.78;
const TARGET_VIDEO_BITRATE = 2_000_000;
const TARGET_VIDEO_LONG_FORM_BITRATE = 1_500_000;
const TARGET_VIDEO_MAX_SIZE = 1280;
const UPLOAD_RETRY_DELAYS_MS = [600, 1400, 3000];
/**
 * Konserwatywny limit dla standardowego uploadu storage.
 * Trzymamy bufor względem twardego limitu serwera, żeby nie marnować czasu na
 * długą kompresję i wielokrotne próby wysyłki, które i tak skończą się błędem.
 */
export const MAX_VIDEO_FILE_SIZE_BYTES = 48 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE_MB = Math.round(MAX_VIDEO_FILE_SIZE_BYTES / (1024 * 1024));
const SUPABASE_MAX_OBJECT_SIZE_ERROR = 'The object exceeded the maximum allowed size';
const SUPABASE_RESOURCE_ALREADY_EXISTS_ERROR = 'The resource already exists';

function mapStorageUploadError(message: string) {
  if (message.includes(SUPABASE_MAX_OBJECT_SIZE_ERROR)) {
    return `Plik wideo przekracza limit uploadu serwera. Utrzymaj plik poniżej ${MAX_VIDEO_FILE_SIZE_MB} MB.`;
  }
  return message;
}

export type MediaUploadPhase = 'reading' | 'compressing' | 'thumbnail' | 'uploading' | 'creating_record' | 'cleanup';

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
    };
  }

  let compressedUri = fileUri;
  const temporaryUris: string[] = [];
  try {
    const { Video } = await import('react-native-compressor');
    const useLowerBitrate =
      typeof originalSizeBytes === 'number' && originalSizeBytes > 30 * 1024 * 1024;
    compressedUri = await Video.compress(
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
  } catch (error) {
    trackEvent('compression_fallback', {
      media_type: 'video',
      error_message: error instanceof Error ? error.message : 'Unknown video compression error',
    });
  }

  let thumbnailUri: string | null = null;
  const thumbnailTemporaryUris: string[] = [];
  try {
    emitProgress(options, { phase: 'thumbnail', progress: 0.2 });
    const { getThumbnailAsync } = await import('expo-video-thumbnails');
    const thumbnail = await getThumbnailAsync(compressedUri, { time: 0, quality: 0.72 });
    thumbnailUri = thumbnail.uri;
    thumbnailTemporaryUris.push(thumbnail.uri);
    emitProgress(options, { phase: 'thumbnail', progress: 1 });
  } catch (error) {
    trackEvent('thumbnail_generation_failed', {
      media_type: 'video',
      error_message: error instanceof Error ? error.message : 'Unknown thumbnail error',
    });
  }

  const sizeBytes = await getFileSizeBytes(compressedUri);
  trackDuration('compression_ms', startedAt, {
    status: compressedUri === fileUri ? 'fallback' : 'success',
    media_type: 'video',
    media_original_bytes: originalSizeBytes,
    media_compressed_bytes: sizeBytes,
    thumbnail_generated: Boolean(thumbnailUri),
  });

  return {
    uri: compressedUri,
    originalUri: fileUri,
    originalSizeBytes,
    sizeBytes,
    temporaryUris,
    thumbnailUri,
    thumbnailTemporaryUris,
  };
}

async function uploadWithRetry(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  options: { contentType: string; cacheControl?: string },
  uploadOptions?: MediaUploadOptions
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= UPLOAD_RETRY_DELAYS_MS.length + 1; attempt += 1) {
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

    // Idempotent path: jeśli obiekt już istnieje pod tym samym stable path,
    // traktujemy to jako sukces i przechodzimy dalej do zapisu metadanych.
    if (
      typeof error.message === 'string' &&
      error.message.includes(SUPABASE_RESOURCE_ALREADY_EXISTS_ERROR)
    ) {
      emitProgress(uploadOptions, {
        phase: 'uploading',
        progress: 1,
        bytesSent: bytes.byteLength,
        bytesTotal: bytes.byteLength,
        attempt,
      });
      return { path };
    }

    lastError = error;
    if (attempt > UPLOAD_RETRY_DELAYS_MS.length) break;
    const retryDelayMs = isTestRuntime() ? 0 : UPLOAD_RETRY_DELAYS_MS[attempt - 1];
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  const message =
    typeof lastError === 'object' && lastError && 'message' in lastError && typeof lastError.message === 'string'
      ? lastError.message
      : 'Nie udało się przesłać pliku.';
  throw new DomainError('INVALID_MEDIA', mapStorageUploadError(message));
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

export async function uploadImageAndCreateSnap(
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

  if (!SNAP_ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new DomainError('INVALID_MEDIA', 'Nieobsługiwany format pliku.');
  }

  if (bytes.byteLength > MAX_IMAGE_FILE_SIZE_BYTES) {
    throw new DomainError('INVALID_MEDIA', 'Plik jest za duży. Maksymalny rozmiar to 10 MB.');
  }

  const stableUploadId = options?.clientUploadId?.replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${user.id}/${stableUploadId || `${Date.now()}_${Math.random().toString(36).substring(7)}`}.${ext}`;
  const filePath = `snaps/${fileName}`;

  const hasExistingSnap = async () => {
    if (typeof (supabase as { from?: unknown }).from !== 'function') return false;
    const { data } = await supabase
      .from('snaps')
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
    if (!(await hasExistingSnap())) {
      await insertSnap(receiverId, uploadData.path, viewDurationSec, {
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

export async function uploadVideoAndCreateSnap(
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
  const bytes = await getImageBytes(prepared.uri);
  const { ext, contentType } = buildVideoContentType(prepared.uri);

  if (!receiverId) {
    throw new DomainError('INVALID_RECEIVER', 'Wybierz poprawnego odbiorcę.');
  }

  if (!SNAP_ALLOWED_VIDEO_TYPES.has(contentType)) {
    throw new DomainError('INVALID_MEDIA', 'Nieobsługiwany format wideo.');
  }

  if (bytes.byteLength > MAX_VIDEO_FILE_SIZE_BYTES) {
    throw new DomainError(
      'INVALID_MEDIA',
      `Plik wideo jest za duży. Maksymalny rozmiar to ${MAX_VIDEO_FILE_SIZE_MB} MB.`
    );
  }

  const stableUploadId = options?.clientUploadId?.replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${user.id}/${stableUploadId || `${Date.now()}_${Math.random().toString(36).substring(7)}`}.${ext}`;
  const filePath = `snaps/${fileName}`;

  const hasExistingSnap = async () => {
    if (typeof (supabase as { from?: unknown }).from !== 'function') return false;
    const { data } = await supabase
      .from('snaps')
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
    if (!(await hasExistingSnap())) {
      await insertSnap(receiverId, uploadData.path, viewDurationSec, {
        mediaType: 'video',
        playbackDurationMs,
        clientUploadId: stableUploadId ?? filePath,
      });
    }
    emitProgress(options, { phase: 'creating_record', progress: 1 });
  } finally {
    emitProgress(options, { phase: 'cleanup', progress: 0 });
    await safeDeleteTemporaryUris([
      ...prepared.temporaryUris,
      ...(prepared.thumbnailTemporaryUris ?? []),
    ]);
    emitProgress(options, { phase: 'cleanup', progress: 1 });
  }
}
