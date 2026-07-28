import * as FileSystem from 'expo-file-system/legacy';

import NativeBackgroundUploader, {
  type NativeEnqueueOptions,
  type NativeUploadSnapshot,
} from '../../modules/nix-background-uploader/src';
import { uploadFeatures } from '../config/uploadFeatures';
import { finalizeMediaUploadBatch } from './mediaBatchUploadService';
import {
  uploadImageAndCreateNix,
  uploadVideoAndCreateNix,
} from './mediaService';

type SnapshotListener = (snapshot: NativeUploadSnapshot) => void;

const listeners = new Set<SnapshotListener>();
const fallbackSnapshots = new Map<string, NativeUploadSnapshot>();
const fallbackTasks = new Map<string, ReturnType<typeof FileSystem.createUploadTask>>();

function emit(snapshot: NativeUploadSnapshot) {
  fallbackSnapshots.set(snapshot.jobId, snapshot);
  for (const listener of listeners) listener(snapshot);
}

function now() {
  return Date.now();
}

async function enqueueFallback(options: NativeEnqueueOptions) {
  if (fallbackTasks.has(options.jobId)) return { scheduled: true, duplicate: true };
  const base: NativeUploadSnapshot = {
    jobId: options.jobId,
    batchId: options.batchId,
    state: 'queued',
    progress: 0,
    bytesSent: 0,
    bytesTotal: 0,
    attempt: 0,
    updatedAt: now(),
  };
  emit(base);
  const task = FileSystem.createUploadTask(
    options.uploadUrl,
    options.fileUri,
    {
      httpMethod: 'PUT',
      headers: options.uploadHeaders,
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    },
    (progress) => {
      const bytesTotal = Math.max(progress.totalBytesExpectedToSend, 1);
      emit({
        ...base,
        state: 'uploading',
        progress: Math.min(1, progress.totalBytesSent / bytesTotal),
        bytesSent: progress.totalBytesSent,
        bytesTotal: progress.totalBytesExpectedToSend,
        updatedAt: now(),
      });
    }
  );
  fallbackTasks.set(options.jobId, task);
  void (async () => {
    try {
      const result = await task.uploadAsync();
      if (!result || result.status < 200 || result.status >= 300) {
        const error = new Error(`Upload HTTP ${result?.status ?? 'unknown'}`) as Error & {
          code?: string;
        };
        if (result?.status === 413) error.code = 'FILE_TOO_LARGE';
        throw error;
      }
      emit({ ...base, state: 'finalizing', progress: 1, updatedAt: now() });
      const finalized = await finalizeMediaUploadBatch({
        url: options.finalizeUrl,
        headers: options.finalizeHeaders,
        batchId: options.batchId,
        token: options.finalizeToken,
      });
      emit({
        ...base,
        state: finalized.status === 'failed' ? 'failed' : 'completed',
        progress: 1,
        responseBody: JSON.stringify(finalized),
        updatedAt: now(),
      });
    } catch (error) {
      emit({
        ...base,
        state: 'failed',
        errorCode: typeof error === 'object'
          && error
          && 'code' in error
          && error.code === 'FILE_TOO_LARGE'
          ? 'FILE_TOO_LARGE'
          : 'FALLBACK_UPLOAD_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Upload failed',
        updatedAt: now(),
      });
    } finally {
      fallbackTasks.delete(options.jobId);
    }
  })();
  return { scheduled: true };
}

const useNative = Boolean(NativeBackgroundUploader && uploadFeatures.nativeBackgroundUpload);

if (useNative && NativeBackgroundUploader) {
  NativeBackgroundUploader.addListener('onUploadProgress', (event) => {
    const previous = fallbackSnapshots.get(event.jobId);
    emit({
      jobId: event.jobId,
      batchId: event.batchId,
      state: 'uploading',
      progress: event.progress,
      bytesSent: event.bytesSent,
      bytesTotal: event.bytesTotal,
      attempt: previous?.attempt ?? 0,
      updatedAt: now(),
    });
  });
  NativeBackgroundUploader.addListener('onUploadState', emit);
}

export const backgroundUploader = {
  isNative: useNative,
  legacyTusFallback: {
    uploadImage: uploadImageAndCreateNix,
    uploadVideo: uploadVideoAndCreateNix,
  },

  subscribe(listener: SnapshotListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async enqueue(options: NativeEnqueueOptions) {
    if (useNative && NativeBackgroundUploader) return NativeBackgroundUploader.enqueue(options);
    return enqueueFallback(options);
  },

  async pause(jobId: string) {
    if (useNative && NativeBackgroundUploader) return NativeBackgroundUploader.pause(jobId);
    await fallbackTasks.get(jobId)?.cancelAsync();
    const previous = fallbackSnapshots.get(jobId);
    if (previous) emit({ ...previous, state: 'paused', updatedAt: now() });
  },

  async resume(jobId: string) {
    if (useNative && NativeBackgroundUploader) return NativeBackgroundUploader.resume(jobId);
    const previous = fallbackSnapshots.get(jobId);
    if (previous) emit({ ...previous, state: 'queued', updatedAt: now() });
  },

  async cancel(jobId: string) {
    if (useNative && NativeBackgroundUploader) return NativeBackgroundUploader.cancel(jobId);
    await fallbackTasks.get(jobId)?.cancelAsync();
    const previous = fallbackSnapshots.get(jobId);
    if (previous) emit({ ...previous, state: 'cancelled', updatedAt: now() });
  },

  async listTasks() {
    if (useNative && NativeBackgroundUploader) return NativeBackgroundUploader.listTasks();
    return Array.from(fallbackSnapshots.values());
  },

  async reconcile() {
    if (useNative && NativeBackgroundUploader) return NativeBackgroundUploader.reconcile();
    return Array.from(fallbackSnapshots.values());
  },
};
