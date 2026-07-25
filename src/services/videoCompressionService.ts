import { DomainError } from './errors';
import {
  prepareImageForUpload,
  prepareVideoForUpload,
  type MediaUploadOptions,
  type MediaUploadProgress,
} from './mediaService';
import { nowMs, trackDuration } from '../lib/telemetry';
import { withTimeout, getCompressionTimeout, DEFAULT_COMPRESSION_TIMEOUT_MS } from '../lib/compressionTimeout';

export type CompressionResult = Awaited<ReturnType<typeof prepareImageForUpload>>;
export type CompressionProgress = Pick<MediaUploadProgress, 'phase' | 'progress'>;

type CompressionOptions = {
  onProgress?: (progress: CompressionProgress) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  fileSizeBytes?: number;
};

function emitProgress(options: CompressionOptions | undefined, progress: CompressionProgress) {
  options?.onProgress?.(progress);
}

function mapProgress(progress: MediaUploadProgress): CompressionProgress {
  if (progress.phase === 'compressing' || progress.phase === 'thumbnail') return progress;
  return { phase: 'compressing', progress: progress.progress };
}

export async function compressImageForUpload(
  fileUri: string,
  options?: CompressionOptions
): Promise<CompressionResult> {
  const startedAt = nowMs();
  const uploadOptions: MediaUploadOptions = {
    signal: options?.signal,
    onProgress: (progress) => emitProgress(options, mapProgress(progress)),
  };
  const result = await withTimeout(
    prepareImageForUpload(fileUri, uploadOptions),
    options?.timeoutMs ?? DEFAULT_COMPRESSION_TIMEOUT_MS
  );
  trackDuration('queue_compression_ms', startedAt, { media_type: 'image', status: 'success' });
  return result;
}

export async function compressVideoForUpload(
  fileUri: string,
  options?: CompressionOptions
): Promise<CompressionResult> {
  const startedAt = nowMs();
  const uploadOptions: MediaUploadOptions = {
    signal: options?.signal,
    onProgress: (progress) => emitProgress(options, mapProgress(progress)),
  };
  const result = await withTimeout(
    prepareVideoForUpload(fileUri, uploadOptions),
    options?.timeoutMs ?? getCompressionTimeout(options?.fileSizeBytes)
  );
  trackDuration('queue_compression_ms', startedAt, { media_type: 'video', status: 'success' });
  return result;
}
