import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { toDomainError } from '../services/errors';
import type { VideoSegmentDraft } from '../context/VideoDraftContext';
import {
  uploadImageWithMetadata,
  uploadVideoWithMetadata,
  type SupabaseUploadProgress,
} from '../services/supabaseUploadService';
import type { UploadTask, UploadTaskProgress, UploadTaskStage } from '../types/uploadQueue';
import {
  clearUploadQueueSnapshot,
  readUploadQueueSnapshot,
  writeUploadQueueSnapshot,
} from '../lib/uploadQueuePersistence';
import { trackEvent } from '../lib/telemetry';

type UploadQueueTask = UploadTask;

export type UploadJob = UploadQueueTask;

const MAX_RETRIES = 3;
const MAX_PERSISTED_TASKS = 40;
const RETRY_DELAY_MS = [1000, 2000, 4000];
const MAX_REHYDRATED_TASK_AGE_MS = 10 * 60 * 1000;
const TASK_DEDUP_WINDOW_MS = 15_000;
const NON_RETRYABLE_ERROR_CODES = new Set([
  'CANCELLED',
  'INVALID_MEDIA',
  'INVALID_RECEIVER',
  'NOT_FRIEND',
  'UNAUTHORIZED',
]);

function createUploadJobId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createOptimisticId() {
  return `optimistic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createUploadFlowId() {
  return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

type TaskCompletionResult = { success: true } | { success: false; error: string };

function mapUploadStage(progress: SupabaseUploadProgress): UploadTaskStage {
  switch (progress.phase) {
    case 'upload_preparing':
      return 'upload_preparing';
    case 'uploading':
      return 'uploading';
    case 'persisting_metadata':
      return 'persisting_metadata';
    default:
      return 'cleanup';
  }
}

export function useMediaUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isQueueReady, setIsQueueReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<UploadQueueTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const inFlightTaskIdsRef = useRef(new Set<string>());
  const processingRef = useRef(false);
  const jobsRef = useRef<UploadQueueTask[]>([]);
  const completionWaitersRef = useRef(
    new Map<string, { resolve: (value: TaskCompletionResult) => void; timeoutId: ReturnType<typeof setTimeout> }>()
  );

  const resolveTaskCompletion = useCallback((taskId: string, result: TaskCompletionResult) => {
    const waiter = completionWaitersRef.current.get(taskId);
    if (!waiter) return;
    clearTimeout(waiter.timeoutId);
    completionWaitersRef.current.delete(taskId);
    waiter.resolve(result);
  }, []);

  const waitForTaskCompletion = useCallback((taskId: string, timeoutMs = 120_000) => {
    return new Promise<TaskCompletionResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        completionWaitersRef.current.delete(taskId);
        resolve({ success: false, error: 'Przekroczono czas oczekiwania na potwierdzenie wysyłki.' });
      }, timeoutMs);
      completionWaitersRef.current.set(taskId, { resolve, timeoutId });
    });
  }, []);
  const persistSnapshot = useCallback((nextJobs: UploadQueueTask[], nextActiveTaskId: string | null, paused: boolean) => {
    const snapshot = {
      version: 1 as const,
      tasks: nextJobs.slice(-MAX_PERSISTED_TASKS),
      activeTaskId: nextActiveTaskId,
      paused,
      updatedAt: Date.now(),
    };
    void writeUploadQueueSnapshot(snapshot).catch(() => {});
  }, []);

  const setJobsAndPersist = useCallback(
    (updater: (current: UploadQueueTask[]) => UploadQueueTask[]) => {
      setJobs((current) => {
        const next = updater(current);
        persistSnapshot(next, activeTaskId, isPaused);
        return next;
      });
    },
    [activeTaskId, isPaused, persistSnapshot]
  );

  const upsertJob = useCallback(
    (job: UploadQueueTask) => {
      setJobsAndPersist((current) => {
        const next = current.some((item) => item.id === job.id)
          ? current.map((item) => (item.id === job.id ? job : item))
          : [...current, job];
        return next;
      });
    },
    [setJobsAndPersist]
  );

  const patchJob = useCallback(
    (jobId: string, patch: Partial<UploadQueueTask>) => {
      setJobsAndPersist((current) => {
        const next = current.map((job) => {
          if (job.id !== jobId) return job;
          const nextJob = { ...job, ...patch, updatedAt: Date.now() };
          if (patch.progress?.stage && patch.progress.stage !== job.progress.stage) {
            trackEvent('upload_queue_state_transition', {
              task_id: job.id,
              upload_flow_id: job.uploadFlowId,
              from_stage: job.progress.stage,
              to_stage: patch.progress.stage,
              attempt: patch.progress.attempt ?? job.progress.attempt,
              media_type: job.mediaType,
            });
          }
          return nextJob;
        });
        return next;
      });
    },
    [setJobsAndPersist]
  );

  const makeProgressHandler = useCallback(
    (jobId: string) => (progress: SupabaseUploadProgress) => {
      const nextProgress: UploadTaskProgress = {
        stage: mapUploadStage(progress),
        progress: progress.progress,
        attempt: progress.attempt ?? 1,
        bytesSent: progress.bytesSent,
        bytesTotal: progress.bytesTotal,
      };
      patchJob(jobId, {
        progress: nextProgress,
      });
    },
    [patchJob]
  );

  const enqueueTask = useCallback(
    (task: UploadQueueTask) => {
      const duplicate = jobsRef.current.find((job) => {
        const samePayload =
          job.receiverId === task.receiverId &&
          job.fileUri === task.fileUri &&
          job.mediaType === task.mediaType;
        const recent = Date.now() - job.createdAt < TASK_DEDUP_WINDOW_MS;
        const active =
          job.progress.stage === 'queued' ||
          job.progress.stage === 'upload_preparing' ||
          job.progress.stage === 'uploading' ||
          job.progress.stage === 'persisting_metadata' ||
          job.progress.stage === 'cleanup';
        return samePayload && recent && active;
      });
      if (duplicate) return;
      upsertJob(task);
    },
    [upsertJob]
  );

  const processTask = useCallback(
    async (task: UploadQueueTask) => {
      const abortController = new AbortController();
      abortControllersRef.current.set(task.id, abortController);
      patchJob(task.id, { startedAt: Date.now() });
      setIsUploading(true);
      setError(null);

      try {
        if (task.mediaType === 'video') {
          await uploadVideoWithMetadata({
            fileUri: task.fileUri,
            receiverId: task.receiverId,
            uploadId: task.id,
            uploadFlowId: task.uploadFlowId,
            signal: abortController.signal,
            viewDurationSec: task.viewDurationSec,
            playbackDurationMs: task.segmentDurationMs ?? 3000,
            onProgress: makeProgressHandler(task.id),
          });
        } else {
          await uploadImageWithMetadata({
            fileUri: task.fileUri,
            receiverId: task.receiverId,
            uploadId: task.id,
            uploadFlowId: task.uploadFlowId,
            signal: abortController.signal,
            viewDurationSec: task.viewDurationSec,
            onProgress: makeProgressHandler(task.id),
          });
        }

        patchJob(task.id, {
          progress: { stage: 'success', progress: 1, attempt: task.retryCount + 1 },
          error: null,
          finishedAt: Date.now(),
        });
        trackEvent('video_upload_completed', {
          task_id: task.id,
          upload_flow_id: task.uploadFlowId,
          media_type: task.mediaType,
          retry_count: task.retryCount,
          end_to_end_ms: Date.now() - (task.startedAt ?? task.createdAt),
        });
        setJobsAndPersist((current) => current.filter((job) => job.id !== task.id));
        resolveTaskCompletion(task.id, { success: true });
      } catch (err) {
        const domainError = toDomainError(err, 'Nie udało się przesłać wiadomości.');
        const latestTask = jobsRef.current.find((job) => job.id === task.id);
        const currentRetryCount = latestTask?.retryCount ?? task.retryCount;
        const nextRetryCount = currentRetryCount + 1;
        const isSchemaMismatch =
          domainError.code === 'UNKNOWN' &&
          typeof domainError.message === 'string' &&
          domainError.message.includes('client_upload_id');
        const retryable =
          !isSchemaMismatch && !NON_RETRYABLE_ERROR_CODES.has(domainError.code) && nextRetryCount <= MAX_RETRIES;

        trackEvent('video_upload_failed', {
          task_id: task.id,
          upload_flow_id: task.uploadFlowId,
          retry_count: nextRetryCount,
          stage: task.progress.stage,
          error_message: domainError.message,
        });

        if (retryable) {
          patchJob(task.id, {
            retryCount: nextRetryCount,
            progress: {
              stage: 'queued',
              progress: 0,
              attempt: nextRetryCount + 1,
              message: `Ponawianie próby ${nextRetryCount}/${MAX_RETRIES}`,
            },
            error: null,
          });
          const delay = RETRY_DELAY_MS[Math.min(nextRetryCount - 1, RETRY_DELAY_MS.length - 1)];
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          const terminalStage: UploadTaskStage = domainError.code === 'CANCELLED' ? 'cancelled' : 'failed';
          patchJob(task.id, {
            progress: {
              stage: terminalStage,
              progress: 1,
              attempt: nextRetryCount,
              message: domainError.message,
            },
            finishedAt: Date.now(),
            error: domainError.message,
          });
          setError(domainError.message);
          // Nie trzymamy nieretryowalnych tasków w kolejce po błędzie.
          if (!retryable) {
            setJobsAndPersist((current) => current.filter((job) => job.id !== task.id));
            resolveTaskCompletion(task.id, { success: false, error: domainError.message });
          }
        }
      } finally {
        abortControllersRef.current.delete(task.id);
        setIsUploading(false);
      }
    },
    [makeProgressHandler, patchJob, resolveTaskCompletion, setJobsAndPersist]
  );

  const processQueue = useCallback(async () => {
    if (!isQueueReady || processingRef.current || isPaused) return;
    const nextTask = jobsRef.current.find(
      (job) => job.progress.stage === 'queued' && !inFlightTaskIdsRef.current.has(job.id)
    );
    if (!nextTask) return;

    processingRef.current = true;
    inFlightTaskIdsRef.current.add(nextTask.id);
    setActiveTaskId(nextTask.id);
    patchJob(nextTask.id, {
      progress: { ...nextTask.progress, stage: 'upload_preparing', progress: 0.01 },
    });

    try {
      await processTask({ ...nextTask, progress: { ...nextTask.progress, stage: 'upload_preparing', progress: 0.01 } });
    } finally {
      inFlightTaskIdsRef.current.delete(nextTask.id);
      setActiveTaskId(null);
      processingRef.current = false;
    }
  }, [isPaused, isQueueReady, patchJob, processTask]);

  const uploadSnap = async (
    fileUri: string,
    receiverId: string,
    viewDurationSec = 5,
    options?: { awaitCompletion?: boolean; timeoutMs?: number }
  ) => {
    const jobId = createUploadJobId();
    const task: UploadQueueTask = {
      id: jobId,
      uploadFlowId: createUploadFlowId(),
      mediaType: 'image',
      receiverId,
      fileUri,
      viewDurationSec,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      optimisticId: createOptimisticId(),
      progress: { stage: 'queued', progress: 0, attempt: 1 },
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      enqueueTask(task);
      if (options?.awaitCompletion) {
        return await waitForTaskCompletion(task.id, options.timeoutMs);
      }
      return { success: true, taskId: task.id };
    } catch (err) {
      const domainError = toDomainError(err, 'Nie udało się przesłać wiadomości.');
      setError(domainError.message);
      return { success: false, error: domainError.message };
    }
  };

  const uploadVideoSegments = async (
    segments: VideoSegmentDraft[],
    receiverId: string,
    viewDurationSec = 5,
    options?: { awaitCompletion?: boolean; timeoutMs?: number }
  ) => {
    try {
      const taskIds: string[] = [];
      for (let index = 0; index < segments.length; index += 1) {
        const seg = segments[index];
        const task: UploadQueueTask = {
          id: createUploadJobId(),
          uploadFlowId: createUploadFlowId(),
          mediaType: 'video',
          receiverId,
          fileUri: seg.uri,
          viewDurationSec,
          segmentDurationMs: seg.durationMs,
          retryCount: 0,
          maxRetries: MAX_RETRIES,
          optimisticId: createOptimisticId(),
          progress: { stage: 'queued', progress: 0, attempt: 1 },
          error: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        enqueueTask(task);
        taskIds.push(task.id);
      }
      if (options?.awaitCompletion) {
        const completion = await Promise.all(taskIds.map((taskId) => waitForTaskCompletion(taskId, options.timeoutMs)));
        const failed = completion.find((item) => !item.success);
        if (failed && !failed.success) return failed;
      }
      return { success: true };
    } catch (err) {
      const domainError = toDomainError(err, 'Nie udało się przesłać wiadomości.');
      setError(domainError.message);
      return { success: false, error: domainError.message };
    }
  };

  const cancelUpload = useCallback(
    (jobId: string) => {
      abortControllersRef.current.get(jobId)?.abort();
      patchJob(jobId, {
        progress: { stage: 'cancelled', progress: 1, attempt: 1, message: 'Wysyłka została anulowana.' },
        error: 'Wysyłka została anulowana.',
      });
      resolveTaskCompletion(jobId, { success: false, error: 'Wysyłka została anulowana.' });
    },
    [patchJob, resolveTaskCompletion]
  );

  const retryUpload = useCallback(
    (jobId: string) => {
      patchJob(jobId, {
        retryCount: 0,
        error: null,
        progress: { stage: 'queued', progress: 0, attempt: 1 },
      });
    },
    [patchJob]
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const snapshot = await readUploadQueueSnapshot();
      if (!mounted) return;
      if (snapshot?.tasks?.length) {
        const now = Date.now();
        setJobs(
          snapshot.tasks
            .filter((task) => {
              const ageMs = now - task.createdAt;
              const updatedAgeMs =
                typeof task.updatedAt === 'number' && Number.isFinite(task.updatedAt)
                  ? now - task.updatedAt
                  : ageMs;
              if (!Number.isFinite(task.createdAt) || ageMs > MAX_REHYDRATED_TASK_AGE_MS) return false;
              if (updatedAgeMs > MAX_REHYDRATED_TASK_AGE_MS) return false;
              if (task.retryCount >= MAX_RETRIES) return false;
              return (
                task.progress.stage === 'queued' ||
                task.progress.stage === 'upload_preparing' ||
                task.progress.stage === 'uploading'
              );
            })
            .map((task) => ({
              ...task,
              uploadFlowId:
                typeof task.uploadFlowId === 'string' && task.uploadFlowId.length > 0
                  ? task.uploadFlowId
                  : createUploadFlowId(),
              progress: { ...task.progress, stage: 'queued', progress: 0 },
            }))
        );
        setIsPaused(snapshot.paused);
      }
      setIsQueueReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const completionWaiters = completionWaitersRef.current;
    return () => {
      completionWaiters.forEach((waiter) => clearTimeout(waiter.timeoutId));
      completionWaiters.clear();
    };
  }, []);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    if (!isQueueReady) return;
    persistSnapshot(jobs, activeTaskId, isPaused);
  }, [activeTaskId, isPaused, isQueueReady, jobs, persistSnapshot]);

  useEffect(() => {
    void processQueue();
  }, [jobs, isPaused, isQueueReady, processQueue]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected === false) {
        setIsPaused(true);
        return;
      }
      if (state.isConnected === true && state.type === 'cellular' && state.details?.cellularGeneration === '3g') {
        setIsPaused(true);
        return;
      }
      if (state.isConnected === true) {
        setIsPaused(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.progress.stage !== 'success' &&
          job.progress.stage !== 'failed' &&
          job.progress.stage !== 'cancelled'
      ),
    [jobs]
  );

  const clearQueueNow = useCallback(async () => {
    setJobs([]);
    setActiveTaskId(null);
    inFlightTaskIdsRef.current.clear();
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    await clearUploadQueueSnapshot();
  }, []);

  return {
    uploadSnap,
    uploadVideoSegments,
    isUploading,
    isPaused,
    error,
    jobs,
    activeJobs,
    activeTaskId,
    retryUpload,
    cancelUpload,
    clearQueueNow,
  };
}
