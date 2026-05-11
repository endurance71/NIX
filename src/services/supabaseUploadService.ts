import { uploadImageAndCreateNix, uploadVideoAndCreateNix, type MediaUploadProgress } from './mediaService';
import { toDomainError } from './errors';
import { trackEvent } from '../lib/telemetry';

type UploadPhase = 'upload_preparing' | 'uploading' | 'persisting_metadata' | 'cleanup';

export type SupabaseUploadProgress = {
  phase: UploadPhase;
  progress: number;
  attempt?: number;
  bytesSent?: number;
  bytesTotal?: number;
};

type BaseUploadOptions = {
  onProgress?: (progress: SupabaseUploadProgress) => void;
  signal?: AbortSignal;
  viewDurationSec: number;
  receiverId: string;
  uploadId: string;
  uploadFlowId: string;
};

type UploadImageParams = BaseUploadOptions & {
  fileUri: string;
};

type UploadVideoParams = BaseUploadOptions & {
  fileUri: string;
  playbackDurationMs: number;
};

function mapMediaProgress(progress: MediaUploadProgress): SupabaseUploadProgress {
  if (progress.phase === 'reading' || progress.phase === 'compressing' || progress.phase === 'thumbnail') {
    return { phase: 'upload_preparing', progress: progress.progress };
  }
  if (progress.phase === 'uploading') return { phase: 'uploading', progress: progress.progress, attempt: progress.attempt, bytesSent: progress.bytesSent, bytesTotal: progress.bytesTotal };
  if (progress.phase === 'creating_record') return { phase: 'persisting_metadata', progress: progress.progress };
  return { phase: 'cleanup', progress: progress.progress };
}

export async function uploadImageWithMetadata(params: UploadImageParams): Promise<void> {
  try {
    await uploadImageAndCreateNix(params.fileUri, params.receiverId, params.viewDurationSec, {
      signal: params.signal,
      clientUploadId: params.uploadId,
      onProgress: (progress) => params.onProgress?.(mapMediaProgress(progress)),
    });
    trackEvent('queue_upload_success', {
      media_type: 'image',
      task_id: params.uploadId,
      upload_flow_id: params.uploadFlowId,
    });
  } catch (error) {
    const mapped = toDomainError(error, 'Nie udało się przesłać obrazu.');
    trackEvent('queue_upload_failed', {
      media_type: 'image',
      task_id: params.uploadId,
      upload_flow_id: params.uploadFlowId,
      error_message: mapped.message,
    });
    throw mapped;
  }
}

export async function uploadVideoWithMetadata(params: UploadVideoParams): Promise<void> {
  try {
    await uploadVideoAndCreateNix(
      params.fileUri,
      params.receiverId,
      params.playbackDurationMs,
      params.viewDurationSec,
      {
        signal: params.signal,
        clientUploadId: params.uploadId,
        onProgress: (progress) => params.onProgress?.(mapMediaProgress(progress)),
      }
    );
    trackEvent('queue_upload_success', {
      media_type: 'video',
      task_id: params.uploadId,
      upload_flow_id: params.uploadFlowId,
    });
  } catch (error) {
    const mapped = toDomainError(error, 'Nie udało się przesłać wideo.');
    trackEvent('queue_upload_failed', {
      media_type: 'video',
      task_id: params.uploadId,
      upload_flow_id: params.uploadFlowId,
      error_message: mapped.message,
    });
    throw mapped;
  }
}
