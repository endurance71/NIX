import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import * as BackgroundTask from 'expo-background-task';
import * as Crypto from 'expo-crypto';
import * as TaskManager from 'expo-task-manager';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { NetInfoState } from '@react-native-community/netinfo';

import {
  clearUploadQueueNixeshot,
  readUploadQueueNixeshot,
} from '../lib/uploadQueuePersistence';
import {
  getDurableUploadJob,
  insertDurableUploadJob,
  listDurableUploadJobs,
  patchDurableUploadJob,
  purgeExpiredDurableUploadJobs,
  purgeOwnerDurableUploadJobs,
} from '../lib/durableUploadQueueDb';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/telemetry';
import { queryKeys } from '../lib/queryKeys';
import { runWithFinally } from '../lib/runWithFinally';
import {
  UPLOAD_RETENTION_MS,
  buildUploadQueueSummary,
  isAllowedUploadTransition,
  isMissingStagedUploadError,
  isPermanentUploadError,
  mapNativeUploadState,
  uploadRetryDelay,
} from '../lib/durableUploadPolicy';
import { buildUploadLiveActivityProps } from '../lib/uploadLiveActivityPresentation';
import {
  prepareImageForUpload,
  prepareVideoForUpload,
  releasePreparedMedia,
} from '../services/mediaService';
import {
  deleteStagedUploadJob,
  findStagedUploadFile,
  inferUploadContentType,
  stageUploadFile,
  stagedUploadFileExists,
} from '../services/durableUploadStorage';
import {
  beginMediaUploadBatch,
  cancelMediaUploadBatch,
  finalizeMediaUploadBatch,
} from '../services/mediaBatchUploadService';
import { backgroundUploader } from '../services/backgroundUploader';
import {
  endUploadLiveActivity,
  startUploadLiveActivity,
  updateUploadLiveActivity,
} from '../services/uploadLiveActivity';
import type {
  DurableUploadJob,
  EnqueueMediaBatchInput,
} from '../types/uploadQueue';
import { UploadQueueContext, type UploadQueueContextValue } from './uploadQueue';

const RECOVERY_TASK_NAME = 'nix-upload-queue-recovery';
const PREPARE_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PREPARE_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_JS_TIMER_DELAY_MS = 60_000;

type UploadPhaseTimings = {
  prepareMs: number | null;
  beginMs: number | null;
  nativeEnqueueMs: number | null;
};

const uploadPhaseTimings = new Map<string, UploadPhaseTimings>();

function rememberPhaseTimings(jobId: string, patch: Partial<UploadPhaseTimings>) {
  const previous = uploadPhaseTimings.get(jobId) ?? {
    prepareMs: null,
    beginMs: null,
    nativeEnqueueMs: null,
  };
  uploadPhaseTimings.set(jobId, { ...previous, ...patch });
}

function isLocallyStopped(job: DurableUploadJob | null) {
  return !job || ['paused', 'cancelled', 'expired', 'completed', 'partially_completed'].includes(job.state);
}

function errorCode(error: unknown) {
  return typeof error === 'object'
    && error
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : null;
}

function parseFinalStatus(responseBody: string | null | undefined) {
  if (!responseBody) return 'completed' as const;
  try {
    const payload = JSON.parse(responseBody) as { status?: unknown };
    return payload.status === 'partially_completed' ? 'partially_completed' as const : 'completed' as const;
  } catch {
    return 'completed' as const;
  }
}

type UploadReadyForNativeTransfer = DurableUploadJob & {
  batchId: string;
  preparedUri: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  finalizeUrl: string;
  finalizeHeaders: Record<string, string>;
  finalizeToken: string;
};

function assertUploadReadyForNativeTransfer(
  job: DurableUploadJob
): asserts job is UploadReadyForNativeTransfer {
  if (
    !job.batchId
    || !job.preparedUri
    || !job.uploadUrl
    || !job.uploadHeaders
    || !job.finalizeUrl
    || !job.finalizeHeaders
    || !job.finalizeToken
  ) {
    throw new Error('Niekompletne dane trwałej wysyłki.');
  }
}

function subscribeToNetworkChanges(listener: (state: NetInfoState) => void) {
  return NetInfo.addEventListener(listener);
}

function useLatestCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult
): (...args: TArgs) => TResult {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  const [stableCallback] = useState(
    () => (...args: TArgs) => callbackRef.current(...args)
  );
  return stableCallback;
}

async function stageAndInsertUpload(
  input: EnqueueMediaBatchInput,
  currentOwnerId: string,
  forcedId?: string
) {
  const now = Date.now();
  const jobId = forcedId ?? Crypto.randomUUID();
  const recipients = input.recipients.map((recipient) => ({
    receiverId: recipient.receiverId,
    viewDurationSec: recipient.viewDurationSec,
    sequenceIndex: recipient.sequenceIndex ?? 0,
  }));
  const initialJob: DurableUploadJob = {
    id: jobId,
    idempotencyKey: jobId,
    ownerId: currentOwnerId,
    mediaType: input.mediaType,
    state: 'staging',
    stagedUri: input.fileUri,
    preparedUri: null,
    contentType: null,
    fileExtension: null,
    originalSizeBytes: null,
    finalSizeBytes: null,
    playbackDurationMs: input.playbackDurationMs ?? null,
    sourceWidth: input.sourceWidth ?? null,
    sourceHeight: input.sourceHeight ?? null,
    thumbnailB64: null,
    batchId: null,
    assetId: null,
    storagePath: null,
    uploadUrl: null,
    uploadHeaders: null,
    uploadUrlExpiresAt: null,
    finalizeUrl: null,
    finalizeHeaders: null,
    finalizeToken: null,
    progress: 0,
    bytesSent: 0,
    bytesTotal: 0,
    retryCount: 0,
    authRefreshAttempted: false,
    nextAttemptAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + UPLOAD_RETENTION_MS,
    startedAt: null,
    finishedAt: null,
    recipients,
  };
  await insertDurableUploadJob(initialJob);
  try {
    const staged = await stageUploadFile({
      jobId,
      sourceUri: input.fileUri,
      mediaType: input.mediaType,
    });
    await patchDurableUploadJob(jobId, {
      stagedUri: staged.uri,
      originalSizeBytes: staged.sizeBytes,
      bytesTotal: staged.sizeBytes,
      fileExtension: staged.extension,
      state: 'queued',
    });
    trackEvent('durable_upload_enqueued', {
      task_id: jobId,
      media_type: input.mediaType,
      media_bytes: staged.sizeBytes,
      recipient_count: recipients.length,
    });
    return { jobId, batchId: jobId };
  } catch (error) {
    await patchDurableUploadJob(jobId, {
      state: 'failed',
      errorCode: 'STAGING_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Nie udało się zabezpieczyć pliku.',
      finishedAt: Date.now(),
    });
    throw error;
  }
}

if (!TaskManager.isTaskDefined(RECOVERY_TASK_NAME)) {
  TaskManager.defineTask(RECOVERY_TASK_NAME, async () => {
    try {
      await backgroundUploader.reconcile();
      const expired = await purgeExpiredDurableUploadJobs();
      await Promise.all(expired.map((job) => deleteStagedUploadJob(job.id).catch(() => undefined)));
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

function useUploadQueueController(): UploadQueueContextValue {
  const queryClient = useQueryClient();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<DurableUploadJob[]>([]);
  const [stagingCount, setStagingCount] = useState(0);
  const [online, setOnline] = useState(true);
  const processingRef = useRef(false);
  const jobsRef = useRef<DurableUploadJob[]>([]);
  const ownerIdRef = useRef<string | null>(null);
  const liveActivityStartedRef = useRef(false);
  const liveActivityFailureKeyRef = useRef('');

  const refresh = useLatestCallback(async () => {
    const currentOwnerId = ownerIdRef.current;
    if (!currentOwnerId) {
      setJobs([]);
      return;
    }
    const nextJobs = await listDurableUploadJobs(currentOwnerId);
    jobsRef.current = nextJobs;
    setJobs(nextJobs);
  });

  const enqueueMediaBatch = async (input: EnqueueMediaBatchInput) => {
    const currentOwnerId = ownerIdRef.current;
    if (!currentOwnerId) throw new Error('Zaloguj się ponownie przed wysłaniem NiX.');
    if (input.recipients.length === 0) throw new Error('Wybierz co najmniej jednego odbiorcę.');
    setStagingCount((count) => count + 1);
    return runWithFinally(async () => {
      const result = await stageAndInsertUpload(input, currentOwnerId);
      await refresh();
      return result;
    }, () => {
      setStagingCount((count) => Math.max(0, count - 1));
    });
  };

  const scheduleJsRetry = async (job: DurableUploadJob, error: unknown) => {
    const nextRetryCount = job.retryCount + 1;
    const message = error instanceof Error ? error.message : 'Nie udało się wysłać pliku.';
    const code = errorCode(error);
    if (isPermanentUploadError(error) || Date.now() >= job.expiresAt) {
      await patchDurableUploadJob(job.id, {
        state: Date.now() >= job.expiresAt ? 'expired' : 'failed',
        errorCode: isPermanentUploadError(error) ? code ?? 'PERMANENT_FAILURE' : 'EXPIRED',
        errorMessage: message,
        retryCount: nextRetryCount,
        finishedAt: Date.now(),
      });
      return;
    }
    await patchDurableUploadJob(job.id, {
      state: online ? 'retry_scheduled' : 'waiting_network',
      retryCount: nextRetryCount,
      nextAttemptAt: Date.now() + uploadRetryDelay(nextRetryCount - 1, Math.random, job.mediaType),
      errorCode: 'RETRY_SCHEDULED',
      errorMessage: message,
    });
  };

  const processJob = useLatestCallback(async (initialJob: DurableUploadJob) => {
    let job = initialJob;
    let prepareMs: number | null = null;
    let beginMs: number | null = null;
    let nativeEnqueueMs: number | null = null;
    try {
      if (job.preparedUri && !(await stagedUploadFileExists(job.preparedUri))) {
        if (await stagedUploadFileExists(job.stagedUri)) {
          console.warn('[upload] prepared missing; will re-prepare from source', { jobId: job.id });
          await patchDurableUploadJob(job.id, {
            preparedUri: null,
            finalSizeBytes: null,
            contentType: null,
            progress: 0,
            errorCode: null,
            errorMessage: null,
          });
          job = (await getDurableUploadJob(job.id)) ?? { ...job, preparedUri: null };
        } else {
          const missing = new Error('Lokalny plik wysyłki nie jest już dostępny.') as Error & {
            code?: string;
          };
          missing.code = 'FILE_NOT_RECOVERABLE';
          throw missing;
        }
      }

      if (!job.preparedUri) {
        await patchDurableUploadJob(job.id, {
          state: 'preparing',
          progress: 0.02,
          startedAt: job.startedAt ?? Date.now(),
          errorCode: job.errorCode === 'FORCE_AGGRESSIVE_COMPRESSION'
            ? job.errorCode
            : null,
          errorMessage: null,
        });
        const prepareStartedAt = Date.now();
        console.warn('[upload] prepare start', {
          jobId: job.id,
          mediaType: job.mediaType,
          stagedTail: job.stagedUri.slice(-48),
          sourceWidth: job.sourceWidth,
          sourceHeight: job.sourceHeight,
        });
        const onProgress = (progress: { progress: number }) => {
          void patchDurableUploadJob(job.id, {
            state: 'preparing',
            progress: Math.min(0.28, Math.max(0.02, progress.progress * 0.28)),
          });
        };
        const prepared = job.mediaType === 'video'
          ? await prepareVideoForUpload(job.stagedUri, {
              playbackDurationMs: job.playbackDurationMs ?? undefined,
              forceAggressiveCompression: job.errorCode === 'FORCE_AGGRESSIVE_COMPRESSION',
              onProgress,
            })
          : await prepareImageForUpload(job.stagedUri, {
              sourceWidth: job.sourceWidth ?? undefined,
              sourceHeight: job.sourceHeight ?? undefined,
              onProgress,
            });
        console.warn('[upload] prepare encode done', {
          jobId: job.id,
          ms: Date.now() - prepareStartedAt,
          sizeBytes: prepared.sizeBytes,
        });
        const preparedWasStaged = await runWithFinally(async () => {
          const latestBeforeStaging = await getDurableUploadJob(job.id);
          if (isLocallyStopped(latestBeforeStaging)) return false;
          console.warn('[upload] stage prepared start', { jobId: job.id });
          const stagedPrepared = await stageUploadFile({
            jobId: job.id,
            sourceUri: prepared.uri,
            mediaType: job.mediaType,
            role: 'prepared',
          });
          console.warn('[upload] stage prepared done', {
            jobId: job.id,
            sizeBytes: stagedPrepared.sizeBytes,
          });
          const maxBytes = job.mediaType === 'video' ? PREPARE_MAX_VIDEO_BYTES : PREPARE_MAX_IMAGE_BYTES;
          if (stagedPrepared.sizeBytes <= 0 || stagedPrepared.sizeBytes > maxBytes) {
            const preparationError = new Error(
              stagedPrepared.sizeBytes <= 0
                ? 'Plik po przygotowaniu jest pusty.'
                : 'Plik jest zbyt duży także po dodatkowej kompresji.'
            ) as Error & { code?: string };
            preparationError.code = stagedPrepared.sizeBytes <= 0
              ? 'INVALID_MEDIA'
              : 'FILE_TOO_LARGE_PERMANENT';
            throw preparationError;
          }
          const mediaInfo = inferUploadContentType(stagedPrepared.uri, job.mediaType);
          await patchDurableUploadJob(job.id, {
            preparedUri: stagedPrepared.uri,
            contentType: mediaInfo.contentType,
            fileExtension: mediaInfo.extension,
            finalSizeBytes: stagedPrepared.sizeBytes,
            bytesTotal: stagedPrepared.sizeBytes,
            thumbnailB64: prepared.thumbnailDataUrl ?? null,
            state: 'requesting_target',
            progress: 0.3,
            errorCode: null,
            errorMessage: null,
          });
          return true;
        }, () => {
          releasePreparedMedia([
            ...prepared.temporaryUris,
            ...(prepared.thumbnailTemporaryUris ?? []),
          ]);
        });
        prepareMs = Date.now() - prepareStartedAt;
        rememberPhaseTimings(job.id, { prepareMs });
        if (!preparedWasStaged) return;
        job = (await getDurableUploadJob(job.id)) ?? job;
      }

      if (isLocallyStopped(job)) return;

      if (
        !job.batchId
        || !job.uploadUrl
        || !job.finalizeUrl
        || !job.finalizeToken
        || !job.uploadUrlExpiresAt
        || job.uploadUrlExpiresAt <= Date.now()
      ) {
        await patchDurableUploadJob(job.id, {
          state: 'requesting_target',
          progress: Math.max(job.progress, 0.3),
        });
        const beginStartedAt = Date.now();
        console.warn('[upload] begin start', { jobId: job.id, mediaType: job.mediaType });
        const target = await beginMediaUploadBatch({
          idempotencyKey: job.idempotencyKey,
          mediaType: job.mediaType,
          contentType: job.contentType ?? inferUploadContentType(job.preparedUri ?? job.stagedUri, job.mediaType).contentType,
          sizeBytes: job.finalSizeBytes ?? job.originalSizeBytes ?? 0,
          fileExtension: job.fileExtension ?? (job.mediaType === 'video' ? 'mp4' : 'jpg'),
          playbackDurationMs: job.playbackDurationMs,
          thumbnailB64: job.thumbnailB64,
          recipients: job.recipients,
        });
        beginMs = Date.now() - beginStartedAt;
        console.warn('[upload] begin done', { jobId: job.id, ms: beginMs, status: target.status });
        rememberPhaseTimings(job.id, { beginMs });
        if (target.status === 'completed' || target.status === 'partially_completed') {
          const finalized = await finalizeMediaUploadBatch({
            url: target.finalize.url,
            headers: target.finalize.headers,
            batchId: target.batchId,
            token: target.finalize.token,
          });
          await patchDurableUploadJob(job.id, {
            batchId: target.batchId,
            assetId: target.assetId,
            storagePath: target.storagePath,
            state: finalized.status,
            progress: 1,
            finishedAt: Date.now(),
            errorCode: null,
            errorMessage: null,
          });
          await deleteStagedUploadJob(job.id).catch(() => undefined);
          void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
          return;
        }
        const latestAfterBegin = await getDurableUploadJob(job.id);
        if (!latestAfterBegin || latestAfterBegin.state === 'cancelled' || latestAfterBegin.state === 'expired') {
          await cancelMediaUploadBatch(target.batchId).catch(() => undefined);
          return;
        }
        const targetPatch = {
          batchId: target.batchId,
          assetId: target.assetId,
          storagePath: target.storagePath,
          uploadUrl: target.upload.url,
          uploadHeaders: target.upload.headers,
          uploadUrlExpiresAt: new Date(target.upload.expiresAt).getTime(),
          finalizeUrl: target.finalize.url,
          finalizeHeaders: target.finalize.headers,
          finalizeToken: target.finalize.token,
        };
        if (latestAfterBegin.state === 'paused') {
          await patchDurableUploadJob(job.id, {
            ...targetPatch,
            state: 'paused',
          });
          return;
        }
        await patchDurableUploadJob(job.id, {
          ...targetPatch,
          state: 'uploading',
          progress: 0.31,
        });
        job = (await getDurableUploadJob(job.id)) ?? job;
      }

      if (isLocallyStopped(job)) return;

      assertUploadReadyForNativeTransfer(job);
      if (!(await stagedUploadFileExists(job.preparedUri))) {
        const missing = new Error('Staged upload file does not exist.') as Error & { code?: string };
        missing.code = 'STAGED_FILE_MISSING';
        throw missing;
      }

      await patchDurableUploadJob(job.id, {
        state: online ? 'uploading' : 'waiting_network',
        progress: Math.max(job.progress, 0.31),
        nextAttemptAt: null,
      });
      const latestBeforeEnqueue = await getDurableUploadJob(job.id);
      if (isLocallyStopped(latestBeforeEnqueue)) return;
      const enqueueStartedAt = Date.now();
      console.warn('[upload] native enqueue start', {
        jobId: job.id,
        preparedTail: job.preparedUri.slice(-48),
      });
      const result = await backgroundUploader.enqueue({
        jobId: job.id,
        batchId: job.batchId,
        fileUri: job.preparedUri,
        uploadUrl: job.uploadUrl,
        uploadHeaders: job.uploadHeaders,
        finalizeUrl: job.finalizeUrl,
        finalizeHeaders: job.finalizeHeaders,
        finalizeToken: job.finalizeToken,
        expiresAt: job.expiresAt,
        mediaType: job.mediaType,
        sizeBytes: job.finalSizeBytes ?? job.originalSizeBytes ?? 0,
      });
      nativeEnqueueMs = Date.now() - enqueueStartedAt;
      console.warn('[upload] native enqueue done', {
        jobId: job.id,
        ms: nativeEnqueueMs,
        result,
      });
      // Diagnose silent PUT stalls: native progress events should move past 0.31.
      setTimeout(() => {
        void backgroundUploader.listTasks().then((snapshots) => {
          const snap = snapshots.find((item) => item.jobId === job.id);
          console.warn('[upload] post-enqueue snapshot', {
            jobId: job.id,
            snap: snap
              ? {
                  state: snap.state,
                  progress: snap.progress,
                  bytesSent: snap.bytesSent,
                  bytesTotal: snap.bytesTotal,
                  errorCode: snap.errorCode,
                  errorMessage: snap.errorMessage,
                  statusCode: snap.statusCode,
                }
              : null,
          });
        });
      }, 3000);
      rememberPhaseTimings(job.id, {
        prepareMs,
        beginMs,
        nativeEnqueueMs,
      });
      const latestAfterEnqueue = await getDurableUploadJob(job.id);
      if (latestAfterEnqueue?.state === 'paused') {
        await backgroundUploader.pause(job.id);
      } else if (!latestAfterEnqueue || latestAfterEnqueue.state === 'cancelled' || latestAfterEnqueue.state === 'expired') {
        await backgroundUploader.cancel(job.id);
      }
    } catch (error) {
      if (isLocallyStopped(await getDurableUploadJob(job.id))) return;
      if (isMissingStagedUploadError(error)) {
        const sourceExists = await stagedUploadFileExists(job.stagedUri);
        if (!sourceExists) {
          await patchDurableUploadJob(job.id, {
            state: 'failed',
            errorCode: 'FILE_NOT_RECOVERABLE',
            errorMessage: 'Lokalny plik wysyłki nie jest już dostępny.',
            finishedAt: Date.now(),
          });
          return;
        }
        console.warn('[upload] restaging after missing prepared file', { jobId: job.id });
        await patchDurableUploadJob(job.id, {
          state: 'queued',
          preparedUri: null,
          finalSizeBytes: null,
          contentType: null,
          progress: 0,
          nextAttemptAt: null,
          errorCode: null,
          errorMessage: null,
        });
        return;
      }
      if (errorCode(error) === 'UNAUTHORIZED') {
        if (!job.authRefreshAttempted) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          await patchDurableUploadJob(job.id, refreshError
            ? {
                state: 'waiting_for_auth',
                authRefreshAttempted: true,
                errorCode: 'AUTH_REQUIRED',
                errorMessage: 'Sesja wygasła. Zaloguj się ponownie i ponów wysyłkę.',
              }
            : {
                state: 'queued',
                uploadUrl: null,
                uploadHeaders: null,
                uploadUrlExpiresAt: null,
                authRefreshAttempted: true,
                errorCode: null,
                errorMessage: null,
              });
          return;
        }
        await patchDurableUploadJob(job.id, {
          state: 'waiting_for_auth',
          errorCode: 'AUTH_REQUIRED',
          errorMessage: 'Sesja wygasła. Zaloguj się ponownie i ponów wysyłkę.',
        });
        return;
      }
      await scheduleJsRetry(job, error);
      trackEvent('durable_upload_failed', {
        task_id: job.id,
        media_type: job.mediaType,
        error_message: error instanceof Error ? error.message : 'Unknown upload error',
      });
    }
  });

  const pauseUpload = async (jobId: string) => {
    await backgroundUploader.pause(jobId);
    await patchDurableUploadJob(jobId, { state: 'paused' });
    await refresh();
  };

  const resumeUpload = async (jobId: string) => {
    const job = await getDurableUploadJob(jobId);
    if (!job) return;
    const nextState = online ? 'queued' : 'waiting_network';
    if (!isAllowedUploadTransition(job.state, nextState)) return;
    await backgroundUploader.resume(jobId);
    await patchDurableUploadJob(jobId, {
      state: nextState,
      nextAttemptAt: null,
      errorCode: null,
      errorMessage: null,
    });
    await refresh();
  };

  const retryUpload = async (jobId: string) => {
    const job = await getDurableUploadJob(jobId);
    if (!job || job.errorCode === 'FILE_TOO_LARGE_PERMANENT') return;
    const retryAfterTooLarge = job.errorCode === 'FILE_TOO_LARGE';
    const nextState = online ? 'queued' : 'waiting_network';
    if (!isAllowedUploadTransition(job.state, nextState)) return;
    if (retryAfterTooLarge) {
      await backgroundUploader.cancel(jobId).catch(() => undefined);
      if (job.batchId) await cancelMediaUploadBatch(job.batchId).catch(() => undefined);
    }
    await patchDurableUploadJob(jobId, {
      state: nextState,
      idempotencyKey: retryAfterTooLarge
        ? `${job.id}:aggressive:${Crypto.randomUUID()}`
        : job.idempotencyKey,
      preparedUri: retryAfterTooLarge ? null : job.preparedUri,
      finalSizeBytes: retryAfterTooLarge ? null : job.finalSizeBytes,
      batchId: retryAfterTooLarge ? null : job.batchId,
      assetId: retryAfterTooLarge ? null : job.assetId,
      storagePath: retryAfterTooLarge ? null : job.storagePath,
      uploadUrl: retryAfterTooLarge ? null : job.uploadUrl,
      uploadHeaders: retryAfterTooLarge ? null : job.uploadHeaders,
      uploadUrlExpiresAt: retryAfterTooLarge ? null : job.uploadUrlExpiresAt,
      finalizeUrl: retryAfterTooLarge ? null : job.finalizeUrl,
      finalizeHeaders: retryAfterTooLarge ? null : job.finalizeHeaders,
      finalizeToken: retryAfterTooLarge ? null : job.finalizeToken,
      retryCount: retryAfterTooLarge ? job.retryCount + 1 : 0,
      authRefreshAttempted: false,
      nextAttemptAt: null,
      errorCode: retryAfterTooLarge ? 'FORCE_AGGRESSIVE_COMPRESSION' : null,
      errorMessage: null,
      finishedAt: null,
    });
    await refresh();
  };

  const cancelUpload = async (jobId: string) => {
    const job = await getDurableUploadJob(jobId);
    if (!job) return;
    await backgroundUploader.cancel(jobId).catch(() => undefined);
    if (job.batchId) await cancelMediaUploadBatch(job.batchId).catch(() => undefined);
    await deleteStagedUploadJob(jobId).catch(() => undefined);
    await patchDurableUploadJob(jobId, {
      state: 'cancelled',
      finishedAt: Date.now(),
      errorCode: 'CANCELLED',
      errorMessage: 'Wysyłka została anulowana.',
    });
    await refresh();
  };

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const nextOwner = data.session?.user.id ?? null;
      ownerIdRef.current = nextOwner;
      setOwnerId(nextOwner);
    });
    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      const previousOwner = ownerIdRef.current;
      const nextOwner = session?.user.id ?? null;
      ownerIdRef.current = nextOwner;
      setOwnerId(nextOwner);
      if (event === 'SIGNED_OUT' && previousOwner) {
        void (async () => {
          const ids = await purgeOwnerDurableUploadJobs(previousOwner);
          await Promise.all(ids.map(async (id) => {
            await backgroundUploader.cancel(id).catch(() => undefined);
            await deleteStagedUploadJob(id).catch(() => undefined);
          }));
          if (ownerIdRef.current === null) setJobs([]);
        })();
      }
    });
    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!ownerId) {
      queueMicrotask(() => {
        if (cancelled) return;
        setReady(true);
        setJobs([]);
      });
      return () => {
        cancelled = true;
      };
    }
    queueMicrotask(() => {
      if (!cancelled) setReady(false);
    });

    const restoreOwnerJobs = async () => {
      const expired = await purgeExpiredDurableUploadJobs();
      await Promise.all(expired.map((job) => deleteStagedUploadJob(job.id).catch(() => undefined)));

      const persistedJobs = await listDurableUploadJobs(ownerId);
      await Promise.all(persistedJobs.map(async (persistedJob) => {
        if (persistedJob.state === 'staging') {
          try {
            const staged = await findStagedUploadFile(
              persistedJob.id,
              'source',
              persistedJob.mediaType
            ) ?? await stageUploadFile({
              jobId: persistedJob.id,
              sourceUri: persistedJob.stagedUri,
              mediaType: persistedJob.mediaType,
            });
            await patchDurableUploadJob(persistedJob.id, {
              stagedUri: staged.uri,
              originalSizeBytes: staged.sizeBytes,
              bytesTotal: staged.sizeBytes,
              fileExtension: staged.extension,
              state: 'queued',
              errorCode: null,
              errorMessage: null,
            });
          } catch (error) {
            await patchDurableUploadJob(persistedJob.id, {
              state: 'failed',
              errorCode: 'FILE_NOT_RECOVERABLE',
              errorMessage: error instanceof Error
                ? error.message
                : 'Pliku nie można odzyskać po restarcie aplikacji.',
              finishedAt: Date.now(),
            });
          }
          return;
        }
        if (
          persistedJob.preparedUri
          && !(await stagedUploadFileExists(persistedJob.preparedUri))
          && await stagedUploadFileExists(persistedJob.stagedUri)
        ) {
          await patchDurableUploadJob(persistedJob.id, {
            state: 'queued',
            preparedUri: null,
            finalSizeBytes: null,
            uploadUrl: null,
            uploadHeaders: null,
            uploadUrlExpiresAt: null,
            progress: 0,
            errorCode: null,
            errorMessage: null,
          });
          return;
        }
        if (
          !['completed', 'partially_completed', 'cancelled', 'expired'].includes(persistedJob.state)
          && !(await stagedUploadFileExists(persistedJob.preparedUri ?? persistedJob.stagedUri))
        ) {
          await patchDurableUploadJob(persistedJob.id, {
            state: 'failed',
            errorCode: 'FILE_NOT_RECOVERABLE',
            errorMessage: 'Lokalny plik wysyłki nie jest już dostępny.',
            finishedAt: Date.now(),
          });
        }
      }));

      const legacy = await readUploadQueueNixeshot();
      if (legacy?.tasks.length) {
        const migrationResults = await Promise.all(legacy.tasks.map(async (task) => {
          if (await getDurableUploadJob(task.id)) return true;
          try {
            await stageAndInsertUpload({
              fileUri: task.fileUri,
              mediaType: task.mediaType,
              recipients: [{
                receiverId: task.receiverId,
                viewDurationSec: task.viewDurationSec,
                sequenceIndex: 0,
              }],
              playbackDurationMs: task.segmentDurationMs,
              sourceWidth: task.sourceWidth,
              sourceHeight: task.sourceHeight,
            }, ownerId, task.id);
            return true;
          } catch {
            // stageAndInsert normally persists an actionable failed row. Keep
            // the legacy source if even that durable transaction did not land.
            return Boolean(await getDurableUploadJob(task.id));
          }
        }));
        if (migrationResults.every(Boolean)) await clearUploadQueueNixeshot();
      }

      const nativeSnapshots = await backgroundUploader.reconcile();
      const nativeJobIds = new Set(nativeSnapshots.map((snapshot) => snapshot.jobId));
      const recoveredJobs = await listDurableUploadJobs(ownerId);
      await Promise.all(recoveredJobs.map(async (job) => {
        if (nativeJobIds.has(job.id)) return;
        if (['preparing', 'requesting_target', 'uploading', 'finalizing'].includes(job.state)) {
          await patchDurableUploadJob(job.id, {
            state: 'queued',
            progress: job.preparedUri ? Math.max(job.progress, 0.3) : 0,
          });
        }
      }));
      return listDurableUploadJobs(ownerId);
    };

    void restoreOwnerJobs().then(
      (latestJobs) => {
        if (cancelled || ownerIdRef.current !== ownerId) return;
        jobsRef.current = latestJobs;
        setJobs(latestJobs);
        setReady(true);
      },
      (error) => {
        if (cancelled || ownerIdRef.current !== ownerId) return;
        console.error('Failed to restore durable upload queue', error);
        setReady(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  useEffect(() => {
    const unsubscribe = subscribeToNetworkChanges((state) => {
      const connected = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(connected);
      if (connected) {
        void (async () => {
          const currentJobs = jobsRef.current.filter((job) => job.state === 'waiting_network');
          await Promise.all(currentJobs.map((job) =>
            patchDurableUploadJob(job.id, { state: 'queued', nextAttemptAt: null })
          ));
          await backgroundUploader.reconcile();
          await refresh();
        })();
      }
    });
    return () => unsubscribe();
  }, [refresh]);

  useEffect(() => {
    const handleSnapshot = (snapshot: Awaited<ReturnType<typeof backgroundUploader.listTasks>>[number]) => {
      void (async () => {
        const current = await getDurableUploadJob(snapshot.jobId);
        if (!current) return;
        const nativeState = mapNativeUploadState(snapshot.state);
        const finalState = snapshot.state === 'completed'
          ? parseFinalStatus(snapshot.responseBody)
          : nativeState;

        if (snapshot.errorCode === 'UPLOAD_URL_EXPIRED') {
          await patchDurableUploadJob(snapshot.jobId, {
            state: 'queued',
            uploadUrl: null,
            uploadHeaders: null,
            uploadUrlExpiresAt: null,
            errorCode: null,
            errorMessage: null,
          });
          await refresh();
          return;
        }

        // Native "queued" only means the URLSession task is scheduled. Never
        // rewrite an already-active JS job back to processJob's pickable state.
        if (
          snapshot.state === 'queued'
          && ['uploading', 'finalizing', 'requesting_target'].includes(current.state)
        ) {
          await patchDurableUploadJob(snapshot.jobId, {
            state: 'uploading',
            progress: Math.max(current.progress, 0.31),
            bytesSent: snapshot.bytesSent,
            bytesTotal: snapshot.bytesTotal > 0 ? snapshot.bytesTotal : current.bytesTotal,
            retryCount: Math.max(current.retryCount, snapshot.attempt),
            errorCode: null,
            errorMessage: null,
          });
          await refresh();
          return;
        }

        if (snapshot.state === 'waiting_for_auth') {
          if (!current.authRefreshAttempted) {
            const { error: refreshError } = await supabase.auth.refreshSession();
            await patchDurableUploadJob(snapshot.jobId, refreshError
              ? {
                  state: 'waiting_for_auth',
                  authRefreshAttempted: true,
                  errorCode: 'AUTH_REQUIRED',
                  errorMessage: 'Sesja wygasła. Zaloguj się ponownie i ponów wysyłkę.',
                }
              : {
                  state: 'queued',
                  uploadUrl: null,
                  uploadHeaders: null,
                  uploadUrlExpiresAt: null,
                  authRefreshAttempted: true,
                  errorCode: null,
                  errorMessage: null,
                });
            await refresh();
            return;
          }
        }

        const snapshotErrorCode = snapshot.errorCode === 'FILE_TOO_LARGE'
          && current.idempotencyKey.includes(':aggressive:')
          ? 'FILE_TOO_LARGE_PERMANENT'
          : snapshot.errorCode ?? null;
        await patchDurableUploadJob(snapshot.jobId, {
          state: finalState,
          progress: snapshot.state === 'uploading'
            ? 0.31 + snapshot.progress * 0.64
            : snapshot.state === 'finalizing'
              ? 0.97
              : snapshot.progress,
          bytesSent: snapshot.bytesSent,
          bytesTotal: snapshot.bytesTotal,
          retryCount: Math.max(current.retryCount, snapshot.attempt),
          errorCode: snapshotErrorCode,
          errorMessage: snapshotErrorCode === 'FILE_TOO_LARGE_PERMANENT'
            ? 'Plik jest zbyt duży także po dodatkowej kompresji.'
            : snapshot.errorMessage ?? null,
          finishedAt: snapshot.state === 'completed' || snapshot.state === 'cancelled'
            ? Date.now()
            : null,
        });
        if (snapshot.state === 'completed') {
          await deleteStagedUploadJob(snapshot.jobId).catch(() => undefined);
          void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
          const phases = uploadPhaseTimings.get(snapshot.jobId);
          const putMs =
            typeof snapshot.putStartedAt === 'number' && typeof snapshot.putEndedAt === 'number'
              ? Math.max(0, snapshot.putEndedAt - snapshot.putStartedAt)
              : null;
          const finalizeMs =
            typeof snapshot.finalizeStartedAt === 'number' && typeof snapshot.finalizeEndedAt === 'number'
              ? Math.max(0, snapshot.finalizeEndedAt - snapshot.finalizeStartedAt)
              : null;
          trackEvent('durable_upload_completed', {
            task_id: snapshot.jobId,
            media_type: current.mediaType,
            retry_count: snapshot.attempt,
            end_to_end_ms: Date.now() - current.createdAt,
            prepare_ms: phases?.prepareMs ?? null,
            begin_ms: phases?.beginMs ?? null,
            native_enqueue_ms: phases?.nativeEnqueueMs ?? null,
            put_ms: putMs,
            finalize_ms: finalizeMs,
          });
          uploadPhaseTimings.delete(snapshot.jobId);
        }
        await refresh();
      })();
    };
    const unsubscribe = backgroundUploader.subscribe(handleSnapshot);
    void backgroundUploader.reconcile().then((snapshots) => {
      for (const snapshot of snapshots) handleSnapshot(snapshot);
    });
    return unsubscribe;
  }, [queryClient, refresh]);

  useEffect(() => {
    if (!ready || processingRef.current || !ownerId) return;
    const now = Date.now();
    const next = jobs.find((job) =>
      job.ownerId === ownerId
      && (
        job.state === 'queued'
        || (job.state === 'retry_scheduled' && (job.nextAttemptAt ?? 0) <= now)
        || (job.state === 'waiting_network' && online)
        || (job.state === 'waiting_for_auth' && !job.authRefreshAttempted)
      )
    );
    if (!next) return;
    processingRef.current = true;
    void processJob(next).finally(async () => {
      processingRef.current = false;
      await refresh();
    });
  }, [jobs, online, ownerId, processJob, ready, refresh]);

  useEffect(() => {
    if (!ready || !ownerId) return;
    let nextAttemptAt: number | null = null;
    for (const job of jobs) {
      if (
        job.ownerId !== ownerId
        || job.state !== 'retry_scheduled'
        || typeof job.nextAttemptAt !== 'number'
      ) {
        continue;
      }
      nextAttemptAt = nextAttemptAt === null
        ? job.nextAttemptAt
        : Math.min(nextAttemptAt, job.nextAttemptAt);
    }
    if (!nextAttemptAt) return;
    const delay = Math.min(
      MAX_JS_TIMER_DELAY_MS,
      Math.max(0, nextAttemptAt - Date.now())
    );
    const timer = setTimeout(() => {
      void refresh();
    }, delay);
    return () => clearTimeout(timer);
  }, [jobs, ownerId, ready, refresh]);

  useEffect(() => {
    void BackgroundTask.registerTaskAsync(RECOVERY_TASK_NAME, { minimumInterval: 15 }).catch((error) => {
      console.warn('Upload recovery background task registration failed', error);
    });
  }, []);

  const summary = buildUploadQueueSummary(jobs);
  const liveActivityMode = (() => {
    const actionableKeys: string[] = [];
    let nonAttentionActiveCount = 0;
    for (const job of jobs) {
      if (
        job.state === 'failed'
        || job.state === 'waiting_for_auth'
        || job.state === 'retry_scheduled'
      ) {
        actionableKeys.push(`${job.id}:${job.state}:${job.errorCode ?? ''}`);
      } else if (
        !['completed', 'partially_completed', 'cancelled', 'expired'].includes(job.state)
      ) {
        nonAttentionActiveCount += 1;
      }
    }
    if (actionableKeys.length > 0 && nonAttentionActiveCount === 0) {
      return `attention:${actionableKeys.sort().join('|')}`;
    }
    if (summary.activeCount <= 0 && summary.failedCount <= 0) {
      return summary.completedCount > 0 ? 'idle:completed' : 'idle:empty';
    }
    return 'active';
  })();

  useEffect(() => {
    if (liveActivityMode.startsWith('attention:')) {
      const failureKey = liveActivityMode.slice('attention:'.length);
      if (liveActivityFailureKeyRef.current !== failureKey) {
        const props = buildUploadLiveActivityProps(buildUploadQueueSummary(jobsRef.current));
        startUploadLiveActivity(props);
        liveActivityFailureKeyRef.current = failureKey;
      }
      liveActivityStartedRef.current = true;
    } else if (liveActivityMode.startsWith('idle:')) {
      liveActivityFailureKeyRef.current = '';
      if (liveActivityStartedRef.current && liveActivityMode === 'idle:completed') {
        endUploadLiveActivity(
          buildUploadLiveActivityProps(buildUploadQueueSummary(jobsRef.current)),
          'success'
        );
      }
      liveActivityStartedRef.current = false;
    } else {
      liveActivityFailureKeyRef.current = '';
    }
    if (
      liveActivityMode === 'active'
      && !liveActivityStartedRef.current
    ) {
      startUploadLiveActivity(buildUploadLiveActivityProps(buildUploadQueueSummary(jobsRef.current)));
      liveActivityStartedRef.current = true;
    }
  }, [liveActivityMode]);

  useEffect(() => {
    if (liveActivityMode === 'active' && liveActivityStartedRef.current) {
      updateUploadLiveActivity(buildUploadLiveActivityProps(summary));
    }
  }, [liveActivityMode, summary]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (
        state === 'background'
        && (summary.activeCount > 0 || summary.failedCount > 0)
      ) {
        // Force the latest state through before iOS suspends JS. A throttled
        // progress update may otherwise never reach the Dynamic Island.
        startUploadLiveActivity(buildUploadLiveActivityProps(summary));
        liveActivityStartedRef.current = true;
      }
      if (state === 'active') void backgroundUploader.reconcile().then(refresh);
    });
    return () => subscription.remove();
  }, [refresh, summary]);

  const value = {
    ready,
    stagingCount,
    jobs,
    summary,
    enqueueMediaBatch,
    pauseUpload,
    resumeUpload,
    retryUpload,
    cancelUpload,
    refresh,
  };

  return value;
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const value = useUploadQueueController();
  return <UploadQueueContext.Provider value={value}>{children}</UploadQueueContext.Provider>;
}
