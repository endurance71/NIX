import * as FileSystem from 'expo-file-system/legacy';

import NativeBackgroundUploader, {
  type NativeEnqueueOptions,
  type NativeUploadSnapshot,
} from '../../modules/nix-background-uploader/src';
import { uploadFeatures } from '../config/uploadFeatures';
import { finalizeMediaUploadBatch } from './mediaBatchUploadService';

type SnapshotListener = (snapshot: NativeUploadSnapshot) => void;

const listeners = new Set<SnapshotListener>();
const fallbackSnapshots = new Map<string, NativeUploadSnapshot>();
const fallbackTasks = new Map<string, ReturnType<typeof FileSystem.createUploadTask>>();
let fallbackAttemptSequence = 0;

function emitFallback(snapshot: NativeUploadSnapshot) {
  const current = fallbackSnapshots.get(snapshot.jobId);
  if (current?.attemptId && current.attemptId !== snapshot.attemptId) return;
  if (current?.state === 'cancelled' || current?.state === 'completed') return;
  emit(current?.state === 'paused' ? { ...snapshot, state: 'paused' } : snapshot);
}

function emit(snapshot: NativeUploadSnapshot) {
  fallbackSnapshots.set(snapshot.jobId, snapshot);
  for (const listener of listeners) listener(snapshot);
}

function now() {
  return Date.now();
}

async function enqueueFallback(options: NativeEnqueueOptions) {
  if (fallbackTasks.has(options.jobId)) return { scheduled: true, duplicate: true };
  const previous = fallbackSnapshots.get(options.jobId);
  if (previous?.state === 'paused' || (previous?.state === 'cancelled' && previous.batchId === options.batchId)) {
    return { scheduled: false };
  }
  if ((options.nextRetryAt ?? 0) > now()) return { scheduled: false };
  const base: NativeUploadSnapshot = {
    jobId: options.jobId,
    batchId: options.batchId,
    state: 'queued',
    progress: 0,
    bytesSent: 0,
    bytesTotal: 0,
    attempt: 0,
    updatedAt: now(),
    attemptId: `fallback:${now()}:${++fallbackAttemptSequence}`,
    locale: options.locale,
    nextRetryAt: options.nextRetryAt,
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
      emitFallback({
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
      const current = fallbackSnapshots.get(options.jobId);
      if (!current || current.attemptId !== base.attemptId || current.state === 'paused' || current.state === 'cancelled') return;
      emitFallback({ ...base, state: 'finalizing', progress: 1, updatedAt: now() });
      const finalized = await finalizeMediaUploadBatch({
        url: options.finalizeUrl,
        headers: options.finalizeHeaders,
        batchId: options.batchId,
        token: options.finalizeToken,
      });
      emitFallback({
        ...base,
        state: finalized.status === 'failed' ? 'failed' : 'completed',
        progress: 1,
        responseBody: JSON.stringify(finalized),
        updatedAt: now(),
      });
    } catch (error) {
      emitFallback({
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
      if (fallbackTasks.get(options.jobId) === task) fallbackTasks.delete(options.jobId);
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
      updatedAt: event.updatedAt ?? now(),
      attemptId: event.attemptId,
    });
  });
  NativeBackgroundUploader.addListener('onUploadState', emit);
}

export const backgroundUploader = {
  isNative: useNative,

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
    const previous = fallbackSnapshots.get(jobId);
    if (previous && !['cancelled', 'completed'].includes(previous.state)) {
      emit({ ...previous, state: 'paused', updatedAt: now() });
    }
    await fallbackTasks.get(jobId)?.cancelAsync();
  },

  async resume(jobId: string) {
    if (useNative && NativeBackgroundUploader) return NativeBackgroundUploader.resume(jobId);
    const previous = fallbackSnapshots.get(jobId);
    if (previous && !['cancelled', 'completed'].includes(previous.state)) {
      emit({ ...previous, state: previous.responseBody ? 'completed'
        : (previous.nextRetryAt ?? 0) > now() ? 'retry_scheduled' : 'queued', updatedAt: now() });
    }
  },

  async cancel(jobId: string) {
    if (useNative && NativeBackgroundUploader) return NativeBackgroundUploader.cancel(jobId);
    const previous = fallbackSnapshots.get(jobId);
    if (previous) emit({ ...previous, state: 'cancelled', updatedAt: now() });
    await fallbackTasks.get(jobId)?.cancelAsync();
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
