import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as BackgroundTask from 'expo-background-task';
import * as Crypto from 'expo-crypto';
import * as TaskManager from 'expo-task-manager';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import i18n, { getCurrentLocale } from '../lib/i18n';
import { assertPreparedMediaSize } from '../lib/uploadMediaLimits';
import { fetchConnectivity, useConnectivity } from '../lib/connectivity';

import {
  clearUploadQueueSnapshot,
  readUploadQueueSnapshot,
} from '../lib/uploadQueuePersistence';
import {
  getDurableUploadJob,
  insertDurableUploadJob,
  listDurableUploadJobs,
  patchDurableUploadJob as persistDurableUploadJob,
  purgeExpiredDurableUploadJobs,
  purgeFinishedDurableUploadJobs,
  purgeOwnerDurableUploadJobs,
} from '../lib/durableUploadQueueDb';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/telemetry';
import { notify as hapticNotify } from '../lib/haptics';
import { queryKeys } from '../lib/queryKeys';
import { runWithFinally } from '../lib/runWithFinally';
import { sleep } from '../lib/sleep';
import {
  BACKGROUND_ADVANCEABLE_STATES,
  BACKGROUND_ADVANCE_MIN_STEP_MS,
  UPLOAD_RETENTION_MS,
  buildUploadQueueSummary,
  hasReusableUploadTarget,
  isAllowedUploadTransition,
  isBackgroundSessionUsable,
  initialDurableUploadState,
  isMissingStagedUploadError,
  isPermanentUploadError,
  parseFinalizeUploadStatus,
  mapNativeUploadState,
  needsNativeTransferRecovery,
  remainingBackgroundBudgetMs,
  selectBackgroundAdvanceJobs,
  selectNextUploadJob,
  selectPreparedJobsToPark,
  stateAfterLocalPreparation,
  uploadRetryDelay,
  type UploadProcessingMode,
} from '../lib/durableUploadPolicy';
import {
  buildUploadLiveActivityNativeState,
  buildUploadLiveActivityProps,
} from '../lib/uploadLiveActivityPresentation';
import {
  applyDisplayProgress,
  createDisplayProgressTracker,
  nativeSnapshotDisplayProgress,
  toDisplayProgress,
} from '../lib/uploadProgress';
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
  isModerationStillUnknown,
  moderationPendingBackoffMs,
  waitForOwnMediaJob,
} from '../services/mediaBatchUploadService';
import { backgroundUploader } from '../services/backgroundUploader';
import {
  endUploadLiveActivity,
  reportUploadLiveActivityState,
  startUploadLiveActivity,
  updateUploadLiveActivity,
} from '../services/uploadLiveActivity';
import type {
  DurableUploadJob,
  EnqueueMediaBatchInput,
} from '../types/uploadQueue';
import {
  UploadQueueActionsContext,
  UploadQueueStateContext,
  type UploadQueueActions,
  type UploadQueueState,
} from './uploadQueue';
import { useAuth } from '../hooks/useAuth';
import { toDomainError } from '../services/errors';

/** Upload phase trace for development builds only; release builds stay silent. */
function traceUpload(event: string, details: Record<string, unknown>) {
  if (__DEV__) console.info(`[upload] ${event}`, details);
}

const RECOVERY_TASK_NAME = 'nix-upload-queue-recovery';
const MAX_JS_TIMER_DELAY_MS = 60_000;
// URLSession reports every sent chunk. Persisting + re-reading the whole queue for each of them
// re-rendered every queue consumer many times per second; progress-only events are coalesced.
const PROGRESS_PERSIST_INTERVAL_MS = 250;
const PROGRESS_PERSIST_MIN_DELTA = 0.02;
// Compression progress lives only in memory (a restarted prepare starts from zero anyway);
// published at most ~4×/s so the ring moves during a long transcode.
const LIVE_PROGRESS_PUBLISH_INTERVAL_MS = 250;
const FINISHED_PURGE_INTERVAL_MS = 60_000;
const SUCCESS_HAPTIC_COALESCE_MS = 10_000;
const PREPARE_START_PROGRESS = toDisplayProgress('processing', 0.04);
const SENDING_START_PROGRESS = toDisplayProgress('sending', 0);
const CONFIRMING_PROGRESS = toDisplayProgress('confirming');


const STOPPED_UPLOAD_STATES: DurableUploadJob['state'][] = [
  'paused', 'cancelled', 'expired', 'completed', 'partially_completed',
];

// Check the state in the same SQLite UPDATE that writes the callback result.
// Reading before an await cannot protect against a pause racing with that write.
function patchDurableUploadJob(
  jobId: string,
  patch: Partial<Omit<DurableUploadJob, 'id' | 'recipients'>>,
  manual = false
) {
  return persistDurableUploadJob(jobId, patch, {
    unlessStates: manual ? STOPPED_UPLOAD_STATES.filter((state) => state !== 'paused') : STOPPED_UPLOAD_STATES,
  });
}

type UploadPhaseTimings = {
  prepareMs: number | null;
  beginMs: number | null;
  nativeEnqueueMs: number | null;
};

function uploadError(message: string, code: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

function throwUploadError(message: string, code: string): never {
  throw uploadError(message, code);
}

const uploadPhaseTimings = new Map<string, UploadPhaseTimings>();

/**
 * Jobs a pipeline step is working on right now, shared by the foreground processor and the
 * background task (both run in the same JS runtime), so neither picks a job the other holds.
 */
const inFlightUploadJobIds = new Set<string>();

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
    throw new Error(i18n.t('inbox.uploadErrorIncompleteJob'));
  }
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
  physicalOnline: boolean,
  hasNetworkSession: boolean,
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
    moderationJobId: null,
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
      state: initialDurableUploadState(physicalOnline, hasNetworkSession),
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
      errorMessage: error instanceof Error ? error.message : i18n.t('inbox.uploadErrorStagingFailed'),
      finishedAt: Date.now(),
    });
    throw error;
  }
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(uploadError('Background upload budget exceeded.', 'BACKGROUND_BUDGET_EXCEEDED'));
    }, Math.max(0, timeoutMs));
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * OFF-11: begin + native enqueue for one already-prepared job, from the background task. Every
 * non-happy path (completed-on-begin, auth, network, budget) puts the job back in the state it was
 * claimed from and leaves the decision to the foreground pipeline — no retries are counted here.
 * Returns true when the job was handed to URLSession.
 */
async function advancePreparedJobInBackground(job: DurableUploadJob, startedAt: number) {
  if (!job.preparedUri || !(await stagedUploadFileExists(job.preparedUri))) return false;
  inFlightUploadJobIds.add(job.id);
  try {
    const claimed = await persistDurableUploadJob(job.id, {
      state: 'requesting_target',
      progress: Math.max(job.progress, SENDING_START_PROGRESS),
    }, { onlyStates: BACKGROUND_ADVANCEABLE_STATES });
    if (claimed.changes === 0) return false;
    const releaseClaim = () => persistDurableUploadJob(job.id, { state: job.state }, {
      onlyStates: ['requesting_target', 'uploading'],
    }).catch(() => undefined);
    try {
      if (!hasReusableUploadTarget(job, Date.now())) {
        const budgetMs = remainingBackgroundBudgetMs(startedAt, Date.now());
        if (budgetMs < BACKGROUND_ADVANCE_MIN_STEP_MS) {
          await releaseClaim();
          return false;
        }
        const target = await withDeadline(beginMediaUploadBatch({
          idempotencyKey: job.idempotencyKey,
          mediaType: job.mediaType,
          contentType: job.contentType ?? inferUploadContentType(job.preparedUri, job.mediaType).contentType,
          sizeBytes: job.finalSizeBytes ?? job.originalSizeBytes ?? 0,
          fileExtension: job.fileExtension ?? (job.mediaType === 'video' ? 'mp4' : 'jpg'),
          playbackDurationMs: job.playbackDurationMs,
          thumbnailB64: job.thumbnailB64,
          recipients: job.recipients,
          clientCreatedAt: job.createdAt,
        }), budgetMs);
        if (target.status === 'completed' || target.status === 'partially_completed') {
          // Already delivered (idempotent begin): finalize + moderation wait belong to the
          // foreground, which will get the same answer from begin.
          await releaseClaim();
          return false;
        }
        const latest = await getDurableUploadJob(job.id);
        if (!latest || latest.state === 'cancelled' || latest.state === 'expired') {
          await cancelMediaUploadBatch(target.batchId).catch(() => undefined);
          return false;
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
        if (latest.state === 'paused') {
          await persistDurableUploadJob(job.id, { ...targetPatch, state: 'paused' }, {
            unlessStates: ['cancelled', 'expired', 'completed', 'partially_completed'],
          });
          return false;
        }
        await patchDurableUploadJob(job.id, { ...targetPatch, state: 'uploading', nextAttemptAt: null });
      } else {
        await patchDurableUploadJob(job.id, { state: 'uploading', nextAttemptAt: null });
      }
      const ready = await getDurableUploadJob(job.id);
      if (!ready || isLocallyStopped(ready)) return false;
      assertUploadReadyForNativeTransfer(ready);
      await backgroundUploader.enqueue({
        jobId: ready.id,
        batchId: ready.batchId,
        fileUri: ready.preparedUri,
        uploadUrl: ready.uploadUrl,
        uploadHeaders: ready.uploadHeaders,
        finalizeUrl: ready.finalizeUrl,
        finalizeHeaders: ready.finalizeHeaders,
        finalizeToken: ready.finalizeToken,
        expiresAt: ready.expiresAt,
        mediaType: ready.mediaType,
        sizeBytes: ready.finalSizeBytes ?? ready.originalSizeBytes ?? 0,
        locale: getCurrentLocale(),
        nextRetryAt: 0,
      });
      const afterEnqueue = await getDurableUploadJob(job.id);
      if (afterEnqueue?.state === 'paused') {
        await backgroundUploader.pause(job.id);
      } else if (!afterEnqueue || afterEnqueue.state === 'cancelled' || afterEnqueue.state === 'expired') {
        await backgroundUploader.cancel(job.id);
      }
      return true;
    } catch (error) {
      traceUpload('background advance failed', { jobId: job.id, code: errorCode(error) });
      await releaseClaim();
      return false;
    }
  } finally {
    inFlightUploadJobIds.delete(job.id);
  }
}

/**
 * Background task step after reconcile/purge: hand already-prepared jobs to URLSession, so a NiX
 * prepared offline starts sending when iOS grants the task with connectivity, without opening
 * the app. Does nothing without the native uploader (the JS fallback needs the app alive), without
 * connectivity, or without a locally valid session (no token refresh is forced from here).
 */
async function advancePreparedUploadsInBackground(startedAt: number) {
  if (!backgroundUploader.isNative) return 0;
  const connectivity = await fetchConnectivity();
  if (!connectivity.online) return 0;
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session || !isBackgroundSessionUsable({
    userId: session.user?.id,
    expiresAtSec: session.expires_at,
  }, Date.now())) {
    return 0;
  }
  const jobs = await listDurableUploadJobs(session.user.id);
  const candidates = selectBackgroundAdvanceJobs(jobs, {
    ownerId: session.user.id,
    now: Date.now(),
    busyJobIds: inFlightUploadJobIds,
  });
  let advanced = 0;
  for (const job of candidates) {
    if (remainingBackgroundBudgetMs(startedAt, Date.now()) < BACKGROUND_ADVANCE_MIN_STEP_MS) break;
    if (inFlightUploadJobIds.has(job.id)) continue;
    if (await advancePreparedJobInBackground(job, startedAt)) advanced += 1;
  }
  return advanced;
}

if (!TaskManager.isTaskDefined(RECOVERY_TASK_NAME)) {
  TaskManager.defineTask(RECOVERY_TASK_NAME, async () => {
    const startedAt = Date.now();
    try {
      await backgroundUploader.reconcile();
      const expired = await purgeExpiredDurableUploadJobs();
      await Promise.all(expired.map((job) => deleteStagedUploadJob(job.id).catch(() => undefined)));
      const finished = await purgeFinishedDurableUploadJobs();
      await Promise.all(finished.map((id) => deleteStagedUploadJob(id).catch(() => undefined)));
      const advanced = await advancePreparedUploadsInBackground(startedAt).catch(() => 0);
      traceUpload('background task done', { advanced, ms: Date.now() - startedAt });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

function useUploadQueueController(): { actions: UploadQueueActions; state: UploadQueueState } {
  // Imperative queue controller (try/finally, long async pipelines) the React Compiler cannot
  // lower; its outputs are memoized by hand (actions/state contexts).
  'use no memo';
  const queryClient = useQueryClient();
  useTranslation();
  const locale = getCurrentLocale();
  const { user, canUseNetworkSession } = useAuth();
  const ownerId = user?.id ?? null;
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<DurableUploadJob[]>([]);
  const [stagingCount, setStagingCount] = useState(0);
  const { online } = useConnectivity();
  const processingRef = useRef(false);
  const mediaModerationWaitRef = useRef(new Set<string>());
  const moderationPendingRoundsRef = useRef(new Map<string, number>());
  const jobsRef = useRef<DurableUploadJob[]>([]);
  const ownerIdRef = useRef<string | null>(null);
  const liveActivityStartedRef = useRef(false);
  const liveActivityFailureKeyRef = useRef('');
  const nativeEventTimesRef = useRef(new Map<string, number>());
  const lastProgressPersistRef = useRef(new Map<string, { at: number; progress: number }>());
  // SEND-3: what the UI sees is monotonic per attempt. SQLite keeps the raw phase progress;
  // compression progress is kept only here (`liveProgressRef`).
  const [displayProgress] = useState(createDisplayProgressTracker);
  const liveProgressRef = useRef(new Map<string, number>());
  const persistedJobsRef = useRef<DurableUploadJob[]>([]);
  const lastFinishedPurgeRef = useRef(0);
  // Latest „can talk to the backend” value for code that runs across awaits (OFF-11).
  const networkReady = online && canUseNetworkSession;
  const networkReadyRef = useRef(networkReady);
  useEffect(() => {
    networkReadyRef.current = networkReady;
  }, [networkReady]);

  const publishJobs = useLatestCallback((persistedJobs: DurableUploadJob[]) => {
    persistedJobsRef.current = persistedJobs;
    const nextJobs = applyDisplayProgress(
      persistedJobs,
      displayProgress,
      liveProgressRef.current,
    );
    jobsRef.current = nextJobs;
    setJobs(nextJobs);
  });

  const purgeFinishedJobs = useLatestCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFinishedPurgeRef.current < FINISHED_PURGE_INTERVAL_MS) return;
    lastFinishedPurgeRef.current = now;
    const ids = await purgeFinishedDurableUploadJobs(now).catch(() => []);
    await Promise.all(ids.map((id) => deleteStagedUploadJob(id).catch(() => undefined)));
  });

  const refreshSequenceRef = useRef(0);
  const refresh = useLatestCallback(async () => {
    const sequence = ++refreshSequenceRef.current;
    const currentOwnerId = ownerIdRef.current;
    if (!currentOwnerId) {
      publishJobs([]);
      return;
    }
    void purgeFinishedJobs();
    const nextJobs = await listDurableUploadJobs(currentOwnerId);
    // Reads decrypt asynchronously and can resolve out of order; never let an older read
    // overwrite a newer one (progress or state would jump backwards).
    if (sequence !== refreshSequenceRef.current) return;
    publishJobs(nextJobs);
  });

  const settleMediaModeration = useLatestCallback(async (
    jobId: string,
    moderationJobId: string,
  ) => {
    if (mediaModerationWaitRef.current.has(jobId)) return;
    mediaModerationWaitRef.current.add(jobId);
    const pendingRounds = moderationPendingRoundsRef.current.get(jobId) ?? 0;
    // oxlint-disable-next-line react-hooks-js/todo -- opted out of compilation ('use no memo') above
    try {
      // First round: the usual 30 s fast poll. Later rounds: one check per backed-off wait.
      const settled = await waitForOwnMediaJob(
        moderationJobId,
        pendingRounds === 0 ? undefined : { timeoutMs: 0 },
      );
      moderationPendingRoundsRef.current.delete(jobId);
      const updated = await patchDurableUploadJob(jobId, {
        state: settled.status,
        progress: 1,
        finishedAt: Date.now(),
        errorCode: null,
        errorMessage: null,
      });
      if (updated.changes === 0) return;
      await deleteStagedUploadJob(jobId).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
    } catch (error) {
      if (isModerationStillUnknown(error)) {
        // Delivered bytes are not a failed send: stay in `finalizing` and check again later with
        // a growing delay (the effect below re-runs only while online).
        moderationPendingRoundsRef.current.set(jobId, pendingRounds + 1);
        await sleep(moderationPendingBackoffMs(pendingRounds));
        return;
      }
      moderationPendingRoundsRef.current.delete(jobId);
      const domain = toDomainError(error, i18n.t('inbox.uploadErrorModerationFailed'));
      await patchDurableUploadJob(jobId, {
        state: 'failed',
        errorCode: domain.code,
        errorMessage: domain.message,
        finishedAt: Date.now(),
      });
    } finally {
      mediaModerationWaitRef.current.delete(jobId);
      await refresh();
    }
  });

  const enqueueMediaBatch = useLatestCallback(async (input: EnqueueMediaBatchInput) => {
    const currentOwnerId = ownerIdRef.current ?? ownerId;
    if (!currentOwnerId) throw new Error(i18n.t('inbox.uploadErrorSessionExpired'));
    if (input.recipients.length === 0) throw new Error(i18n.t('inbox.uploadErrorNoRecipients'));
    setStagingCount((count) => count + 1);
    return runWithFinally(async () => {
      const result = await stageAndInsertUpload(input, currentOwnerId, online, canUseNetworkSession);
      await refresh();
      return result;
    }, () => {
      setStagingCount((count) => Math.max(0, count - 1));
    });
  });

  const scheduleJsRetry = async (job: DurableUploadJob, error: unknown) => {
    const nextRetryCount = job.retryCount + 1;
    const message = error instanceof Error ? error.message : i18n.t('inbox.uploadErrorSendFailed');
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

  const processJob = useLatestCallback(async (
    initialJob: DurableUploadJob,
    mode: UploadProcessingMode = 'full',
  ) => {
    let job = initialJob;
    let prepareMs: number | null = null;
    let beginMs: number | null = null;
    let nativeEnqueueMs: number | null = null;
    inFlightUploadJobIds.add(job.id);
    // oxlint-disable-next-line react-hooks-js/todo -- opted out of compilation ('use no memo') above
    try {
      if (job.preparedUri && !(await stagedUploadFileExists(job.preparedUri))) {
        if (await stagedUploadFileExists(job.stagedUri)) {
          traceUpload('prepared missing; will re-prepare from source', { jobId: job.id });
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
          throwUploadError(i18n.t('inbox.uploadErrorFileMissing'), 'FILE_NOT_RECOVERABLE');
        }
      }

      // OFF-11: offline only the local phase runs; an already prepared job just waits.
      if (mode === 'prepare_only' && job.preparedUri) return;

      if (!job.preparedUri) {
        await patchDurableUploadJob(job.id, {
          state: 'preparing',
          progress: PREPARE_START_PROGRESS,
          startedAt: job.startedAt ?? Date.now(),
          errorCode: job.errorCode === 'FORCE_AGGRESSIVE_COMPRESSION'
            ? job.errorCode
            : null,
          errorMessage: null,
        });
        const prepareStartedAt = Date.now();
        traceUpload('prepare start', {
          jobId: job.id,
          mediaType: job.mediaType,
          stagedTail: job.stagedUri.slice(-48),
          sourceWidth: job.sourceWidth,
          sourceHeight: job.sourceHeight,
        });
        await refresh();
        let lastLivePublishAt = 0;
        const onProgress = (progress: { progress: number }) => {
          liveProgressRef.current.set(job.id, toDisplayProgress('processing', progress.progress));
          const now = Date.now();
          if (now - lastLivePublishAt < LIVE_PROGRESS_PUBLISH_INTERVAL_MS) return;
          lastLivePublishAt = now;
          publishJobs(persistedJobsRef.current);
        };
        const prepared = job.mediaType === 'video'
          ? await prepareVideoForUpload(job.stagedUri, {
              playbackDurationMs: job.playbackDurationMs ?? undefined,
              sourceWidth: job.sourceWidth ?? undefined,
              sourceHeight: job.sourceHeight ?? undefined,
              forceAggressiveCompression: job.errorCode === 'FORCE_AGGRESSIVE_COMPRESSION',
              onProgress,
            })
          : await prepareImageForUpload(job.stagedUri, {
              sourceWidth: job.sourceWidth ?? undefined,
              sourceHeight: job.sourceHeight ?? undefined,
              onProgress,
            });
        traceUpload('prepare encode done', {
          jobId: job.id,
          ms: Date.now() - prepareStartedAt,
          sizeBytes: prepared.sizeBytes,
        });
        // Assigned inside the staging callback; the cast keeps TS from narrowing it to the initial value.
        let stateAfterPrepare = 'requesting_target' as DurableUploadJob['state'];
        const preparedWasStaged = await runWithFinally(async () => {
          const latestBeforeStaging = await getDurableUploadJob(job.id);
          if (isLocallyStopped(latestBeforeStaging)) return false;
          traceUpload('stage prepared start', { jobId: job.id });
          const stagedPrepared = await stageUploadFile({
            jobId: job.id,
            sourceUri: prepared.uri,
            mediaType: job.mediaType,
            role: 'prepared',
          });
          traceUpload('stage prepared done', {
            jobId: job.id,
            sizeBytes: stagedPrepared.sizeBytes,
          });
          assertPreparedMediaSize(job.mediaType, stagedPrepared.sizeBytes);
          const mediaInfo = inferUploadContentType(stagedPrepared.uri, job.mediaType);
          // Prepared offline: persist everything begin needs and park on the network at the end
          // of the processing band (~0.25), so reconnecting goes straight to begin.
          stateAfterPrepare = stateAfterLocalPreparation(mode, networkReadyRef.current);
          await patchDurableUploadJob(job.id, {
            preparedUri: stagedPrepared.uri,
            contentType: mediaInfo.contentType,
            fileExtension: mediaInfo.extension,
            finalSizeBytes: stagedPrepared.sizeBytes,
            bytesTotal: stagedPrepared.sizeBytes,
            thumbnailB64: prepared.thumbnailDataUrl ?? null,
            state: stateAfterPrepare,
            progress: SENDING_START_PROGRESS,
            nextAttemptAt: null,
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
        if (stateAfterPrepare === 'waiting_network') {
          traceUpload('prepared offline; waiting for network', { jobId: job.id, prepareMs });
          return;
        }
        job = (await getDurableUploadJob(job.id)) ?? job;
      }

      if (isLocallyStopped(job)) return;

      // Re-stat even previously prepared files restored after a relaunch: the
      // encoded/staged bytes, not source metadata, determine the API limit.
      const preparedInfo = await FileSystem.getInfoAsync(job.preparedUri ?? job.stagedUri);
      const actualBytes = preparedInfo.exists && 'size' in preparedInfo ? preparedInfo.size : 0;
      assertPreparedMediaSize(job.mediaType, actualBytes);
      await patchDurableUploadJob(job.id, { finalSizeBytes: actualBytes, bytesTotal: actualBytes });
      job = (await getDurableUploadJob(job.id)) ?? job;
      if (isLocallyStopped(job) || (job.nextAttemptAt ?? 0) > Date.now()) return;

      if (!hasReusableUploadTarget(job, Date.now())) {
        await patchDurableUploadJob(job.id, {
          state: 'requesting_target',
          progress: Math.max(job.progress, SENDING_START_PROGRESS),
        });
        const beginStartedAt = Date.now();
        traceUpload('begin start', { jobId: job.id, mediaType: job.mediaType });
        const target = await beginMediaUploadBatch({
          idempotencyKey: job.idempotencyKey,
          mediaType: job.mediaType,
          contentType: job.contentType ?? inferUploadContentType(job.preparedUri ?? job.stagedUri, job.mediaType).contentType,
          sizeBytes: job.finalSizeBytes ?? job.originalSizeBytes ?? 0,
          fileExtension: job.fileExtension ?? (job.mediaType === 'video' ? 'mp4' : 'jpg'),
          playbackDurationMs: job.playbackDurationMs,
          thumbnailB64: job.thumbnailB64,
          recipients: job.recipients,
          clientCreatedAt: job.createdAt,
        });
        beginMs = Date.now() - beginStartedAt;
        traceUpload('begin done', { jobId: job.id, ms: beginMs, status: target.status });
        rememberPhaseTimings(job.id, { beginMs });
        if (target.status === 'completed' || target.status === 'partially_completed') {
          const finalized = await finalizeMediaUploadBatch({
            url: target.finalize.url,
            headers: target.finalize.headers,
            batchId: target.batchId,
            token: target.finalize.token,
          });
          const parsed = parseFinalizeUploadStatus(JSON.stringify(finalized));
          if (parsed.state === 'finalizing') {
            if (!parsed.jobId) {
              await patchDurableUploadJob(job.id, {
                batchId: target.batchId,
                assetId: target.assetId,
                storagePath: target.storagePath,
                state: 'failed',
                errorCode: 'UNKNOWN',
                errorMessage: i18n.t('inbox.uploadErrorModerationQueueMissing'),
                finishedAt: Date.now(),
              });
              return;
            }
            await patchDurableUploadJob(job.id, {
              batchId: target.batchId,
              assetId: target.assetId,
              storagePath: target.storagePath,
              state: 'finalizing',
              moderationJobId: parsed.jobId,
              progress: CONFIRMING_PROGRESS,
              finishedAt: null,
              errorCode: null,
              errorMessage: null,
            });
            void settleMediaModeration(job.id, parsed.jobId);
            return;
          }
          const updated = await patchDurableUploadJob(job.id, {
            batchId: target.batchId,
            assetId: target.assetId,
            storagePath: target.storagePath,
            state: finalized.status === 'moderation_pending' ? 'failed' : finalized.status,
            progress: 1,
            finishedAt: Date.now(),
            errorCode: finalized.status === 'failed' ? 'UNKNOWN' : null,
            errorMessage: null,
          });
          if (updated.changes === 0) return;
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
          await persistDurableUploadJob(job.id, {
            ...targetPatch,
            state: 'paused',
          }, { unlessStates: ['cancelled', 'expired', 'completed', 'partially_completed'] });
          return;
        }
        await patchDurableUploadJob(job.id, {
          ...targetPatch,
          state: 'uploading',
          progress: SENDING_START_PROGRESS,
        });
        job = (await getDurableUploadJob(job.id)) ?? job;
      }

      if (isLocallyStopped(job)) return;

      assertUploadReadyForNativeTransfer(job);
      if (!(await stagedUploadFileExists(job.preparedUri))) {
        throwUploadError('Staged upload file does not exist.', 'STAGED_FILE_MISSING');
      }

      await patchDurableUploadJob(job.id, {
        state: online ? 'uploading' : 'waiting_network',
        progress: Math.max(job.progress, SENDING_START_PROGRESS),
        nextAttemptAt: null,
      });
      const latestBeforeEnqueue = await getDurableUploadJob(job.id);
      if (isLocallyStopped(latestBeforeEnqueue)) return;
      const enqueueStartedAt = Date.now();
      traceUpload('native enqueue start', {
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
        locale: getCurrentLocale(),
        nextRetryAt: job.nextAttemptAt ?? 0,
      });
      nativeEnqueueMs = Date.now() - enqueueStartedAt;
      traceUpload('native enqueue done', {
        jobId: job.id,
        ms: nativeEnqueueMs,
        result,
      });
      // prepareMs/beginMs were remembered when measured; a job prepared offline earlier keeps
      // its own prepare time instead of being overwritten with null here.
      rememberPhaseTimings(job.id, { nativeEnqueueMs });
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
            errorMessage: i18n.t('inbox.uploadErrorFileMissing'),
            finishedAt: Date.now(),
          });
          return;
        }
        traceUpload('restaging after missing prepared file', { jobId: job.id });
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
                errorMessage: i18n.t('inbox.uploadErrorSessionExpired'),
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
          errorMessage: i18n.t('inbox.uploadErrorSessionExpired'),
        });
        return;
      }
      await scheduleJsRetry(job, error);
      trackEvent('durable_upload_failed', {
        task_id: job.id,
        media_type: job.mediaType,
        error_message: error instanceof Error ? error.message : 'Unknown upload error',
      });
    } finally {
      liveProgressRef.current.delete(job.id);
      inFlightUploadJobIds.delete(initialJob.id);
    }
  });

  const pauseUpload = useLatestCallback(async (jobId: string) => {
    const current = await getDurableUploadJob(jobId);
    if (!current || !isAllowedUploadTransition(current.state, 'paused')) return;
    const updated = await patchDurableUploadJob(jobId, { state: 'paused' }, true);
    if (updated.changes === 0) return;
    await backgroundUploader.pause(jobId);
    await refresh();
  });

  const resumeUpload = useLatestCallback(async (jobId: string) => {
    const job = await getDurableUploadJob(jobId);
    if (!job) return;
    const retryPending = (job.nextAttemptAt ?? 0) > Date.now();
    const nextState = retryPending ? 'retry_scheduled'
      : online && canUseNetworkSession ? 'queued' : 'waiting_network';
    if (!isAllowedUploadTransition(job.state, nextState === 'retry_scheduled' ? 'queued' : nextState)) return;
    const updated = await patchDurableUploadJob(jobId, {
      state: nextState,
      nextAttemptAt: retryPending ? job.nextAttemptAt : null,
      errorCode: null,
      errorMessage: null,
    }, true);
    if (updated.changes === 0) return;
    await backgroundUploader.resume(jobId);
    await backgroundUploader.reconcile();
    await refresh();
  });

  const retryUpload = useLatestCallback(async (jobId: string) => {
    const job = await getDurableUploadJob(jobId);
    if (!job || job.state === 'paused' || job.errorCode === 'FILE_TOO_LARGE_PERMANENT') return;
    const retryAfterTooLarge = job.errorCode === 'FILE_TOO_LARGE';
    const retryPending = (job.nextAttemptAt ?? 0) > Date.now();
    const nextState = retryPending ? 'retry_scheduled'
      : online && canUseNetworkSession ? 'queued' : 'waiting_network';
    if (!isAllowedUploadTransition(job.state, nextState === 'retry_scheduled' ? 'queued' : nextState)) return;
    const updated = await patchDurableUploadJob(jobId, {
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
      // A manual retry restarts from the phase it re-enters, not from the failed attempt's value.
      progress: retryAfterTooLarge || !job.preparedUri ? 0 : SENDING_START_PROGRESS,
      authRefreshAttempted: false,
      nextAttemptAt: retryPending ? job.nextAttemptAt : null,
      errorCode: retryAfterTooLarge ? 'FORCE_AGGRESSIVE_COMPRESSION' : null,
      errorMessage: null,
      finishedAt: null,
    });
    if (updated.changes === 0) return;
    // A manual retry is a new attempt: the ring may restart from the new phase.
    displayProgress.reset(jobId);
    if (retryAfterTooLarge) {
      await backgroundUploader.cancel(jobId).catch(() => undefined);
      if (job.batchId) await cancelMediaUploadBatch(job.batchId).catch(() => undefined);
    }
    await refresh();
  });

  const cancelUpload = useLatestCallback(async (jobId: string) => {
    const job = await getDurableUploadJob(jobId);
    if (!job) return;
    const updated = await patchDurableUploadJob(jobId, {
      state: 'cancelled', finishedAt: Date.now(), errorCode: 'CANCELLED',
      errorMessage: i18n.t('inbox.uploadErrorCancelled'),
    }, true);
    if (updated.changes === 0) return;
    await backgroundUploader.cancel(jobId).catch(() => undefined);
    if (job.batchId) await cancelMediaUploadBatch(job.batchId).catch(() => undefined);
    await deleteStagedUploadJob(jobId).catch(() => undefined);
    await refresh();
  });

  useEffect(() => {
    let cancelled = false;
    const previousOwner = ownerIdRef.current;
    const nextOwner = ownerId;
    ownerIdRef.current = nextOwner;
    if (previousOwner && previousOwner !== nextOwner) {
      void (async () => {
        const ids = await purgeOwnerDurableUploadJobs(previousOwner);
        await Promise.all(ids.map(async (id) => {
          await backgroundUploader.cancel(id).catch(() => undefined);
          await deleteStagedUploadJob(id).catch(() => undefined);
        }));
        if (!cancelled && ownerIdRef.current === null) publishJobs([]);
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [ownerId, publishJobs]);

  useEffect(() => {
    let cancelled = false;
    if (!ownerId) {
      queueMicrotask(() => {
        if (cancelled) return;
        setReady(true);
        displayProgress.clear();
        publishJobs([]);
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
      await purgeFinishedJobs(true);

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
                : i18n.t('inbox.uploadErrorFileNotRecoverable'),
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
            errorMessage: i18n.t('inbox.uploadErrorFileMissing'),
            finishedAt: Date.now(),
          });
        }
      }));

      const legacy = await readUploadQueueSnapshot();
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
            }, ownerId, false, false, task.id);
            return true;
          } catch {
            // stageAndInsert normally persists an actionable failed row. Keep
            // the legacy source if even that durable transaction did not land.
            return Boolean(await getDurableUploadJob(task.id));
          }
        }));
        if (migrationResults.every(Boolean)) await clearUploadQueueSnapshot();
      }

      const nativeSnapshots = await backgroundUploader.reconcile();
      const nativeJobIds = new Set(nativeSnapshots.filter((snapshot) =>
        !needsNativeTransferRecovery(snapshot)
      ).map((snapshot) => snapshot.jobId));
      const recoveredJobs = await listDurableUploadJobs(ownerId);
      await Promise.all(recoveredJobs.map(async (job) => {
        if (nativeJobIds.has(job.id)) return;
        if (job.moderationJobId && job.state === 'finalizing') return;
        if (['preparing', 'requesting_target', 'uploading', 'finalizing'].includes(job.state)) {
          await patchDurableUploadJob(job.id, {
            state: (job.nextAttemptAt ?? 0) > Date.now() ? 'retry_scheduled' : 'queued',
            progress: job.preparedUri ? Math.max(job.progress, SENDING_START_PROGRESS) : 0,
          });
        }
      }));
      return listDurableUploadJobs(ownerId);
    };

    void restoreOwnerJobs().then(
      (latestJobs) => {
        if (cancelled || ownerIdRef.current !== ownerId) return;
        publishJobs(latestJobs);
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
  }, [displayProgress, ownerId, publishJobs, purgeFinishedJobs]);

  // Back online (or the session became usable while online): wake jobs parked on the network.
  // Connectivity comes from the shared store, which debounces short reachability blips.
  useEffect(() => {
    if (!online || !canUseNetworkSession) return;
    void (async () => {
      const currentJobs = jobsRef.current.filter((job) =>
        job.state === 'waiting_network' && !inFlightUploadJobIds.has(job.id)
      );
      // Compare-and-set: the processor may already be sending a job parked offline (it picks
      // `waiting_network` too); a late wake must not move it back to `queued`.
      await Promise.all(currentJobs.map((job) =>
        persistDurableUploadJob(job.id, {
          state: (job.nextAttemptAt ?? 0) > Date.now() ? 'retry_scheduled' : 'queued',
        }, { onlyStates: ['waiting_network'] })
      ));
      await backgroundUploader.reconcile();
      await refresh();
    })();
  }, [canUseNetworkSession, online, refresh]);

  useEffect(() => {
    const handleSnapshot = (snapshot: Awaited<ReturnType<typeof backgroundUploader.listTasks>>[number]) => {
      if (needsNativeTransferRecovery(snapshot)) return;
      if (snapshot.updatedAt < (nativeEventTimesRef.current.get(snapshot.jobId) ?? 0)) return;
      if (snapshot.state === 'uploading') {
        const now = Date.now();
        const last = lastProgressPersistRef.current.get(snapshot.jobId);
        if (
          last
          && now - last.at < PROGRESS_PERSIST_INTERVAL_MS
          && Math.abs(snapshot.progress - last.progress) < PROGRESS_PERSIST_MIN_DELTA
        ) {
          return;
        }
        lastProgressPersistRef.current.set(snapshot.jobId, { at: now, progress: snapshot.progress });
      } else {
        lastProgressPersistRef.current.delete(snapshot.jobId);
      }
      nativeEventTimesRef.current.set(snapshot.jobId, snapshot.updatedAt);
      void (async () => {
        const current = await getDurableUploadJob(snapshot.jobId);
        if (!current || STOPPED_UPLOAD_STATES.includes(current.state)
          || nativeEventTimesRef.current.get(snapshot.jobId) !== snapshot.updatedAt) return;
        const nativeState = mapNativeUploadState(snapshot.state);
        const parsedFinalize = snapshot.state === 'completed'
          ? parseFinalizeUploadStatus(snapshot.responseBody)
          : null;
        const finalState = parsedFinalize?.state ?? nativeState;

        if (snapshot.state === 'completed' && parsedFinalize?.state === 'finalizing') {
          if (!parsedFinalize.jobId) {
            await patchDurableUploadJob(snapshot.jobId, {
              state: 'failed',
              errorCode: 'UNKNOWN',
              errorMessage: i18n.t('inbox.uploadErrorModerationQueueMissing'),
              finishedAt: Date.now(),
            });
            await refresh();
            return;
          }
          await patchDurableUploadJob(snapshot.jobId, {
            state: 'finalizing',
            moderationJobId: parsedFinalize.jobId,
            progress: CONFIRMING_PROGRESS,
            finishedAt: null,
            errorCode: null,
            errorMessage: null,
          });
          void settleMediaModeration(snapshot.jobId, parsedFinalize.jobId);
          await refresh();
          return;
        }

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
            progress: Math.max(current.progress, SENDING_START_PROGRESS),
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
                  errorMessage: i18n.t('inbox.uploadErrorSessionExpired'),
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
        const updated = await patchDurableUploadJob(snapshot.jobId, {
          state: finalState,
          // Paused / waiting / retry snapshots carry the raw transfer fraction; they keep the
          // current value instead of moving the ring backwards (SEND-3).
          progress: nativeSnapshotDisplayProgress(snapshot.state, snapshot.progress, current.progress),
          bytesSent: snapshot.bytesSent,
          bytesTotal: snapshot.bytesTotal,
          retryCount: Math.max(current.retryCount, snapshot.attempt),
          nextAttemptAt: snapshot.nextRetryAt ?? null,
          errorCode: snapshotErrorCode,
          errorMessage: snapshotErrorCode === 'FILE_TOO_LARGE_PERMANENT'
            ? i18n.t('inbox.uploadErrorTooLarge')
            : snapshot.errorMessage ?? null,
          finishedAt: snapshot.state === 'completed' || snapshot.state === 'cancelled'
            ? Date.now()
            : null,
        });
        if (updated.changes === 0) return;
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
  }, [queryClient, refresh, settleMediaModeration]);

  useEffect(() => {
    if (!ready || !ownerId || !canUseNetworkSession || !online) return;
    for (const job of jobs) {
      if (
        job.ownerId === ownerId
        && job.state === 'finalizing'
        && job.moderationJobId
      ) {
        void settleMediaModeration(job.id, job.moderationJobId);
      }
    }
  }, [canUseNetworkSession, jobs, online, ownerId, ready, settleMediaModeration]);

  // Single-flight processor. With network the whole pipeline runs; offline (or without a usable
  // session) only the local preparation does, so the network phase starts at once on reconnect
  // (OFF-11).
  useEffect(() => {
    if (!ready || processingRef.current || !ownerId) return;
    const next = selectNextUploadJob(jobs, {
      ownerId,
      now: Date.now(),
      networkReady,
      busyJobIds: inFlightUploadJobIds,
    });
    if (!next) return;
    processingRef.current = true;
    void processJob(next.job, next.mode).finally(async () => {
      processingRef.current = false;
      await refresh();
    });
  }, [jobs, networkReady, ownerId, processJob, ready, refresh]);

  // Without network a prepared job left in „queued” (restored after a kill, or the network went
  // away between steps) is parked as `waiting_network` — „Czeka na sieć” instead of a stale
  // queued state — and woken by the reconnect effect above.
  useEffect(() => {
    if (!ready || !ownerId || networkReady) return;
    const toPark = selectPreparedJobsToPark(jobs, {
      ownerId,
      now: Date.now(),
      busyJobIds: inFlightUploadJobIds,
    });
    if (toPark.length === 0) return;
    void (async () => {
      const results = await Promise.all(toPark.map((job) =>
        persistDurableUploadJob(job.id, { state: 'waiting_network' }, {
          onlyStates: ['queued', 'retry_scheduled'],
        }).catch(() => ({ changes: 0 }))
      ));
      if (results.some((result) => result.changes > 0)) await refresh();
    })();
  }, [jobs, networkReady, ownerId, ready, refresh]);

  useEffect(() => {
    if (!ready || !ownerId) return;
    let nextAttemptAt: number | null = null;
    for (const job of jobs) {
      if (
        job.ownerId !== ownerId
        || !['retry_scheduled', 'queued', 'waiting_network'].includes(job.state)
        || typeof job.nextAttemptAt !== 'number'
        || job.nextAttemptAt <= Date.now()
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

  const summary = useMemo(() => buildUploadQueueSummary(jobs), [jobs]);
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
      const failureKey = `${liveActivityMode.slice('attention:'.length)}:${locale}`;
      if (liveActivityFailureKeyRef.current !== failureKey) {
        const props = buildUploadLiveActivityProps(buildUploadQueueSummary(jobsRef.current), Date.now(), locale);
        startUploadLiveActivity(props);
        liveActivityFailureKeyRef.current = failureKey;
      }
      liveActivityStartedRef.current = true;
    } else if (liveActivityMode.startsWith('idle:')) {
      liveActivityFailureKeyRef.current = '';
      if (liveActivityStartedRef.current && liveActivityMode === 'idle:completed') {
        endUploadLiveActivity(
          buildUploadLiveActivityProps(buildUploadQueueSummary(jobsRef.current), Date.now(), locale),
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
      startUploadLiveActivity(buildUploadLiveActivityProps(buildUploadQueueSummary(jobsRef.current), Date.now(), locale));
      liveActivityStartedRef.current = true;
    }
  }, [liveActivityMode, locale]);

  useEffect(() => {
    if (liveActivityMode === 'active' && liveActivityStartedRef.current) {
      updateUploadLiveActivity(buildUploadLiveActivityProps(summary, Date.now(), locale));
    }
  }, [liveActivityMode, summary, locale]);

  // SEND-2: the native background writer needs the whole queue (compression, moderation…),
  // not just URLSession transfers, before it may show progress or „Sent” on its own.
  useEffect(() => {
    reportUploadLiveActivityState(buildUploadLiveActivityNativeState(jobs, Date.now(), locale));
  }, [jobs, locale]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const latestSummary = buildUploadQueueSummary(jobsRef.current);
      if (
        state === 'background'
        && (latestSummary.activeCount > 0 || latestSummary.failedCount > 0)
      ) {
        // Force the latest state through before iOS suspends JS. A throttled
        // progress update may otherwise never reach the Dynamic Island.
        startUploadLiveActivity(buildUploadLiveActivityProps(latestSummary, Date.now(), locale));
        liveActivityStartedRef.current = true;
      }
      if (state === 'active') void backgroundUploader.reconcile().then(refresh);
    });
    return () => subscription.remove();
  }, [refresh, locale]);

  // The real „sent” moment: one success haptic per batch when its delivery is confirmed while the
  // app is in front (the send sheet only gives a light tap, because then nothing is sent yet).
  // Each video segment is its own batch, so completions of one send are coalesced into one buzz.
  const announcedBatchesRef = useRef(new Set<string>());
  const lastSuccessHapticAtRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    let completedNow = false;
    for (const job of jobs) {
      if (job.state !== 'completed' && job.state !== 'partially_completed') continue;
      const key = job.batchId ?? job.id;
      if (announcedBatchesRef.current.has(key)) continue;
      announcedBatchesRef.current.add(key);
      if (now - (job.finishedAt ?? 0) < 5_000) completedNow = true;
    }
    if (
      completedNow
      && AppState.currentState === 'active'
      && now - lastSuccessHapticAtRef.current > SUCCESS_HAPTIC_COALESCE_MS
    ) {
      lastSuccessHapticAtRef.current = now;
      hapticNotify('success');
    }
  }, [jobs]);

  const actions = useMemo<UploadQueueActions>(() => ({
    enqueueMediaBatch,
    pauseUpload,
    resumeUpload,
    retryUpload,
    cancelUpload,
    refresh,
  }), [cancelUpload, enqueueMediaBatch, pauseUpload, refresh, resumeUpload, retryUpload]);
  const state = useMemo<UploadQueueState>(
    () => ({ ready, stagingCount, jobs, summary }),
    [jobs, ready, stagingCount, summary],
  );

  return { actions, state };
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const { actions, state } = useUploadQueueController();
  return (
    <UploadQueueActionsContext.Provider value={actions}>
      <UploadQueueStateContext.Provider value={state}>{children}</UploadQueueStateContext.Provider>
    </UploadQueueActionsContext.Provider>
  );
}
