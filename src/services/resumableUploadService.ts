import * as FileSystem from 'expo-file-system/legacy';
import * as tus from 'tus-js-client';
import { toByteArray as base64ToBytes } from 'base64-js';
import { supabase } from '../lib/supabase';
import { DomainError } from './errors';
import { nowMs, trackDuration, trackEvent } from '../lib/telemetry';

/**
 * Limit jednego chunka przyjmowanego przez Supabase Storage TUS.
 * Wartość >6 MB skutkuje błędem 413; pozostawiamy bezpieczny margines.
 */
export const RESUMABLE_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

/** Domyślne odstępy retry dla błędów sieciowych — łącznie 4 próby. */
const DEFAULT_RETRY_DELAYS_MS = [0, 1_000, 3_000, 5_000];
const SUPABASE_RESOURCE_ALREADY_EXISTS_ERROR = 'The resource already exists';

export type ResumableUploadProgress = {
  bytesSent: number;
  bytesTotal: number;
  /** Numer kolejnej próby (1 = pierwsza). Aktualizowany po każdym retry. */
  attempt: number;
};

export type ResumableUploadOptions = {
  bucket: string;
  /** Ścieżka obiektu w bucketcie, bez prefiksu nazwy bucketa. */
  objectPath: string;
  fileUri: string;
  contentType: string;
  fileSizeBytes: number;
  cacheControl?: string;
  upsert?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ResumableUploadProgress) => void;
};

/**
 * Strumieniowy odczyt pliku z dysku — czyta wyłącznie żądany fragment, bez
 * wczytywania całego pliku do RAM. Wymaga `expo-file-system/legacy`, który
 * obsługuje `position` + `length` przy `encoding: 'base64'`.
 */
class ChunkedFileSource {
  size: number;
  private fileUri: string;

  constructor(fileUri: string, size: number) {
    this.fileUri = fileUri;
    this.size = size;
  }

  async slice(start: number, end: number): Promise<{ value: Blob | null; done: boolean }> {
    const clampedEnd = Math.min(end, this.size);
    const length = clampedEnd - start;
    const done = clampedEnd >= this.size;

    if (length <= 0) {
      return { value: null, done };
    }

    const base64 = await FileSystem.readAsStringAsync(this.fileUri, {
      encoding: 'base64',
      position: start,
      length,
    });
    const bytes = base64ToBytes(base64);
    // Blob ma natywne pole `size` wymagane przez tus do walidacji końcowego
    // chunka. Pojedynczy chunk to maks. 6 MB — bezpieczne dla pamięci.
    const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
    return { value: blob, done };
  }

  close() {
    // brak zasobów do zwolnienia
  }
}

class ChunkedFileReader {
  async openFile(input: { fileUri: string; size: number }) {
    return new ChunkedFileSource(input.fileUri, input.size);
  }
}

function getSupabaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (typeof url !== 'string' || url.length === 0) {
    throw new DomainError('UNKNOWN', 'Brak konfiguracji EXPO_PUBLIC_SUPABASE_URL.');
  }
  return url.replace(/\/$/, '');
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new DomainError('UNAUTHORIZED', 'Sesja użytkownika wygasła.');
  }
  return token;
}

/**
 * Resumable (TUS) upload do Supabase Storage. Strumieniowy odczyt pliku
 * eliminuje konieczność wczytywania całej zawartości do RAM (bezpieczne dla
 * dużych klipów wideo na słabszych urządzeniach).
 */
export async function uploadResumable(options: ResumableUploadOptions): Promise<void> {
  const supabaseUrl = getSupabaseUrl();
  const accessToken = await getAccessToken();
  const startedAt = nowMs();
  // RN iOS nie wspiera Blob([Uint8Array]) dla PATCH body, więc chwilowo
  // wymuszamy stabilny tryb `native_uri` na wszystkich platformach.
  // TODO: wrócić do chunked reader po wdrożeniu natywnego typu body bez BlobPart.
  const useCustomReader = false;

  trackEvent('resumable_upload_started', {
    bucket: options.bucket,
    media_bytes: options.fileSizeBytes,
    chunk_size_bytes: RESUMABLE_CHUNK_SIZE_BYTES,
    reader_mode: useCustomReader ? 'chunked_reader' : 'native_uri',
  });

  await new Promise<void>((resolve, reject) => {
    let attempt = 1;
    let aborted = false;
    let settled = false;

    const upload = new tus.Upload(
      useCustomReader
        ? // Custom fileReader: chunkowanie przez expo-file-system/legacy.
          ({ fileUri: options.fileUri, size: options.fileSizeBytes } as unknown as Blob)
        : // Fallback iOS: natywna ścieżka RN tus dla `uri`.
          ({ uri: options.fileUri } as unknown as Blob),
      {
        endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
        retryDelays: DEFAULT_RETRY_DELAYS_MS,
        chunkSize: RESUMABLE_CHUNK_SIZE_BYTES,
        uploadSize: options.fileSizeBytes,
        removeFingerprintOnSuccess: true,
        ...(useCustomReader
          ? { fileReader: new ChunkedFileReader() as unknown as tus.UploadOptions['fileReader'] }
          : {}),
        headers: {
          authorization: `Bearer ${accessToken}`,
          'x-upsert': options.upsert ? 'true' : 'false',
        },
        metadata: {
          bucketName: options.bucket,
          objectName: options.objectPath,
          contentType: options.contentType,
          cacheControl: options.cacheControl ?? '3600',
        },
        onProgress: (bytesSent, bytesTotal) => {
          options.onProgress?.({ bytesSent, bytesTotal, attempt });
        },
        onShouldRetry: (error, retryAttempt) => {
          if (aborted) return false;
          attempt = retryAttempt + 2;
          // Brak retry dla błędów autoryzacji / odrzucenia ze strony serwera.
          const status = error?.originalResponse?.getStatus?.();
          if (status === 401 || status === 403 || status === 409 || status === 413) {
            trackEvent('resumable_upload_non_retryable', {
              bucket: options.bucket,
              status,
              media_bytes: options.fileSizeBytes,
            });
            return false;
          }
          trackEvent('resumable_upload_retry', {
            bucket: options.bucket,
            attempt,
            status: typeof status === 'number' ? status : null,
          });
          return true;
        },
        onError: (error) => {
          if (settled) return;
          if (aborted) {
            settled = true;
            reject(new DomainError('CANCELLED', 'Wysyłka została anulowana.'));
            return;
          }
          const status = (error as { originalResponse?: { getStatus?: () => number } })?.originalResponse?.getStatus?.();
          const message = error instanceof Error ? error.message : String(error ?? '');
          // Idempotent path: obiekt już istnieje pod stabilną ścieżką.
          if (status === 409 || message.includes(SUPABASE_RESOURCE_ALREADY_EXISTS_ERROR)) {
            trackEvent('resumable_upload_existing_resource', {
              bucket: options.bucket,
              media_bytes: options.fileSizeBytes,
              status: status ?? 409,
            });
            settled = true;
            resolve();
            return;
          }
          trackEvent('resumable_upload_failure', {
            bucket: options.bucket,
            media_bytes: options.fileSizeBytes,
            error_message: error instanceof Error ? error.message : 'Unknown resumable error',
          });
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        },
        onSuccess: () => {
          if (settled) return;
          trackDuration('resumable_upload_success_ms', startedAt, {
            bucket: options.bucket,
            media_bytes: options.fileSizeBytes,
            chunks: Math.ceil(options.fileSizeBytes / RESUMABLE_CHUNK_SIZE_BYTES),
            attempts: attempt,
          });
          settled = true;
          resolve();
        },
      }
    );

    if (options.signal) {
      if (options.signal.aborted) {
        aborted = true;
        void upload.abort(true);
        reject(new DomainError('CANCELLED', 'Wysyłka została anulowana.'));
        return;
      }
      options.signal.addEventListener(
        'abort',
        () => {
          aborted = true;
          void upload.abort(true);
        },
        { once: true }
      );
    }

    upload.start();
  });
}
