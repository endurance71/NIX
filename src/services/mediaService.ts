import { supabase } from '../lib/supabase';
import { insertSnap } from './snapService';
import { getCurrentUser } from './profileService';
import { DomainError } from './errors';

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
/**
 * Maksymalny rozmiar pojedynczego pliku wideo dla nagrania do 180 s.
 * 400 MB daje bezpieczny bufor dla zmiennego bitrate'u i audio.
 */
export const MAX_VIDEO_FILE_SIZE_BYTES = 400 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE_MB = Math.round(MAX_VIDEO_FILE_SIZE_BYTES / (1024 * 1024));
const SUPABASE_MAX_OBJECT_SIZE_ERROR = 'The object exceeded the maximum allowed size';

function mapStorageUploadError(message: string) {
  if (message.includes(SUPABASE_MAX_OBJECT_SIZE_ERROR)) {
    return `Plik wideo przekracza limit ${MAX_VIDEO_FILE_SIZE_MB} MB.`;
  }
  return message;
}

async function fetchArrayBufferViaXhr(fileUri: string): Promise<ArrayBuffer> {
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error('Nie udało się odczytać pliku lokalnego.'));
    xhr.onload = () => {
      const res = xhr.response;
      if (res instanceof ArrayBuffer) {
        resolve(res);
        return;
      }
      reject(new Error('Nie udało się odczytać pliku lokalnego.'));
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
  viewDurationSec = 5
) {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  const bytes = await getImageBytes(fileUri);
  const { ext, contentType } = buildContentType(fileUri);

  if (!receiverId) {
    throw new DomainError('INVALID_RECEIVER', 'Wybierz poprawnego odbiorcę.');
  }

  if (!SNAP_ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new DomainError('INVALID_MEDIA', 'Nieobsługiwany format pliku.');
  }

  if (bytes.byteLength > MAX_IMAGE_FILE_SIZE_BYTES) {
    throw new DomainError('INVALID_MEDIA', 'Plik jest za duży. Maksymalny rozmiar to 10 MB.');
  }

  const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
  const filePath = `snaps/${fileName}`;

  const { error: uploadError, data: uploadData } = await supabase.storage
    .from('media-vault')
    .upload(filePath, bytes, { contentType });

  if (uploadError) {
    throw new DomainError('INVALID_MEDIA', mapStorageUploadError(uploadError.message));
  }
  await insertSnap(receiverId, uploadData.path, viewDurationSec);
}

export async function uploadVideoAndCreateSnap(
  fileUri: string,
  receiverId: string,
  playbackDurationMs: number,
  viewDurationSec = 5
) {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  const bytes = await getImageBytes(fileUri);
  const { ext, contentType } = buildVideoContentType(fileUri);

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

  const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
  const filePath = `snaps/${fileName}`;

  const { error: uploadError, data: uploadData } = await supabase.storage
    .from('media-vault')
    .upload(filePath, bytes, { contentType });

  if (uploadError) {
    throw new DomainError('INVALID_MEDIA', mapStorageUploadError(uploadError.message));
  }

  await insertSnap(receiverId, uploadData.path, viewDurationSec, {
    mediaType: 'video',
    playbackDurationMs,
  });
}
