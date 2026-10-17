import type { FriendProfile } from '../services/friendService';
import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import {
  formatInboxTimestamp,
  type InboxRowModel,
  type RecipientUploadPhase,
  type RecipientUploadPresentation,
} from './inboxPresentation';
import { COMPLETED_UPLOAD_VISIBILITY_MS } from './uploadProgress';

/**
 * Fallback when a server row has no `client_upload_id`: its `created_at` comes from the server
 * clock, the job's from the device. Tolerate a skewed device clock instead of keeping a
 * completed overlay on top of the row that already represents it.
 */
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

const PHASE_PRIORITY: Record<RecipientUploadPhase, number> = {
  completed: 0,
  confirming: 5,
  uploading: 10,
  preparing: 20,
  retry_scheduled: 30,
  paused: 40,
  waiting_network: 50,
  failed: 60,
};

const PAUSABLE_STATES = new Set<UploadJobState>([
  'queued',
  'preparing',
  'requesting_target',
  'uploading',
  'waiting_network',
  'retry_scheduled',
  'finalizing',
]);

const CANCELLABLE_STATES = new Set<UploadJobState>([
  ...PAUSABLE_STATES,
  'waiting_for_auth',
  'paused',
  'failed',
]);

function clampProgress(progress: number) {
  return Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
}

function phaseForState(state: UploadJobState): RecipientUploadPhase | null {
  switch (state) {
    case 'failed':
    case 'waiting_for_auth':
      return 'failed';
    case 'waiting_network':
      return 'waiting_network';
    case 'paused':
      return 'paused';
    case 'retry_scheduled':
      return 'retry_scheduled';
    case 'staging':
    case 'queued':
    case 'preparing':
    case 'requesting_target':
      return 'preparing';
    case 'uploading':
      return 'uploading';
    case 'finalizing':
      return 'confirming';
    case 'completed':
    case 'partially_completed':
      return 'completed';
    case 'cancelled':
    case 'expired':
      return null;
  }
}

/**
 * Equal weight per job. Byte weighting switched modes (and jumped) whenever a segment's
 * `bytesTotal` went from 0 to known or from the source to the compressed size (SEND-14); the
 * average of monotonic per-job values stays monotonic.
 */
function aggregatedProgress(jobs: DurableUploadJob[]) {
  if (jobs.length === 0) return 0;
  return jobs.reduce((sum, job) => sum + clampProgress(job.progress), 0) / jobs.length;
}

function uniqueRecipientCount(job: DurableUploadJob) {
  return new Set(job.recipients.map((recipient) => recipient.receiverId)).size;
}

function isRecentlyCompleted(job: DurableUploadJob, now: number, visibilityMs: number) {
  if (job.state !== 'completed' && job.state !== 'partially_completed') return true;
  return now - (job.finishedAt ?? job.updatedAt) <= visibilityMs;
}

export function buildRecipientUploadPresentations(
  jobs: DurableUploadJob[],
  {
    now = Date.now(),
    completedVisibilityMs = COMPLETED_UPLOAD_VISIBILITY_MS,
  }: {
    now?: number;
    completedVisibilityMs?: number;
  } = {}
) {
  const jobsByRecipient = new Map<string, DurableUploadJob[]>();

  for (const job of jobs) {
    const phase = phaseForState(job.state);
    if (!phase || !isRecentlyCompleted(job, now, completedVisibilityMs)) continue;
    for (const receiverId of new Set(job.recipients.map((recipient) => recipient.receiverId))) {
      const recipientJobs = jobsByRecipient.get(receiverId) ?? [];
      recipientJobs.push(job);
      jobsByRecipient.set(receiverId, recipientJobs);
    }
  }

  const result = new Map<string, RecipientUploadPresentation>();
  for (const [receiverId, recipientJobs] of jobsByRecipient) {
    const phases = recipientJobs
      .map((job) => phaseForState(job.state))
      .filter((phase): phase is RecipientUploadPhase => phase !== null);
    const phase = phases.reduce((current, candidate) =>
      PHASE_PRIORITY[candidate] > PHASE_PRIORITY[current] ? candidate : current
    );
    const sortedJobs = [...recipientJobs].sort((a, b) => a.createdAt - b.createdAt);
    const pauseJobIds: string[] = [];
    const resumeJobIds: string[] = [];
    const retryJobIds: string[] = [];
    const cancelJobIds: string[] = [];
    for (const job of sortedJobs) {
      if (PAUSABLE_STATES.has(job.state)) pauseJobIds.push(job.id);
      if (job.state === 'paused') resumeJobIds.push(job.id);
      if (job.state === 'failed' || job.state === 'waiting_for_auth') {
        retryJobIds.push(job.id);
      }
      if (CANCELLABLE_STATES.has(job.state)) cancelJobIds.push(job.id);
    }

    result.set(receiverId, {
      phase,
      progress: aggregatedProgress(sortedJobs),
      jobIds: sortedJobs.map((job) => job.id),
      batchIds: sortedJobs.flatMap((job) => (job.batchId ? [job.batchId] : [])),
      jobCount: sortedJobs.length,
      sharedRecipientCount: Math.max(...sortedJobs.map(uniqueRecipientCount)),
      createdAt: Math.min(...sortedJobs.map((job) => job.createdAt)),
      updatedAt: Math.max(...sortedJobs.map((job) => job.updatedAt)),
      mediaType: sortedJobs.some((job) => job.mediaType === 'video') ? 'video' : 'image',
      actions: {
        pauseJobIds,
        resumeJobIds,
        retryJobIds,
        cancelJobIds,
      },
    });
  }

  return result;
}

function serverRowAlreadyRepresentsCompletedUpload(
  row: InboxRowModel,
  upload: RecipientUploadPresentation
) {
  if (upload.phase !== 'completed' || row.direction !== 'sent') return false;
  if (row.kind === 'nix' && row.clientUploadId && upload.batchIds.length > 0) {
    return upload.batchIds.includes(row.clientUploadId);
  }
  const serverTimestamp = Date.parse(row.createdAt);
  return Number.isFinite(serverTimestamp)
    && serverTimestamp >= upload.createdAt - CLOCK_SKEW_TOLERANCE_MS;
}

/**
 * Position of a conversation in the inbox. Uses when the upload started, never `updatedAt`:
 * that changes on every progress tick and made two uploading rows swap places (SEND-14).
 */
function rowSortTimestamp(row: InboxRowModel & { upload: RecipientUploadPresentation | null }) {
  const serverTimestamp = Date.parse(row.createdAt);
  return Math.max(
    Number.isFinite(serverTimestamp) ? serverTimestamp : 0,
    row.upload?.createdAt ?? 0,
  );
}

export function mergeInboxRowsWithUploads(
  rows: InboxRowModel[],
  uploadsByRecipient: ReadonlyMap<string, RecipientUploadPresentation>,
  friends: FriendProfile[],
  {
    unknownUsername,
    locale,
    yesterdayLabel,
    now,
  }: {
    unknownUsername: string;
    locale: string;
    yesterdayLabel: string;
    now?: Date;
  }
) {
  const friendsById = new Map(friends.map((friend) => [friend.id, friend]));
  const existingPeerIds = new Set(rows.map((row) => row.peerId));
  const mergedRows = rows.map((row) => {
    const candidate = uploadsByRecipient.get(row.peerId) ?? null;
    const upload = candidate && !serverRowAlreadyRepresentsCompletedUpload(row, candidate)
      ? candidate
      : null;
    // Most conversations have no upload: keep the server row object instead of cloning it.
    return upload === row.upload ? row : { ...row, upload };
  });

  for (const [peerId, upload] of uploadsByRecipient) {
    if (existingPeerIds.has(peerId)) continue;
    const friend = friendsById.get(peerId);
    const createdAt = new Date(upload.createdAt).toISOString();
    mergedRows.push({
      id: `upload:${peerId}`,
      peerId,
      kind: 'nix',
      username: friend?.username || unknownUsername,
      display_name: friend?.display_name ?? null,
      direction: 'sent',
      unread: false,
      status: 'sent',
      // Only shown once the upload finished; while it runs the row shows its upload phase.
      messageStatus: upload.phase === 'failed' ? 'failed' : upload.phase === 'completed' ? 'sent' : 'sending',
      messageKind: upload.mediaType === 'video' ? 'video' : 'photo',
      createdAt,
      timestampLabel: formatInboxTimestamp(createdAt, locale, { now, yesterdayLabel }),
      avatarStoragePath: friend?.avatar_storage_path ?? null,
      avatarEmoji: friend?.avatar_emoji ?? null,
      mediaType: upload.mediaType,
      upload,
      openParams: null,
    });
  }

  return mergedRows.sort((a, b) => rowSortTimestamp(b) - rowSortTimestamp(a));
}

function sameStrings(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function uploadPresentationsEqual(
  a: RecipientUploadPresentation | null,
  b: RecipientUploadPresentation | null
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.phase === b.phase
    && a.progress === b.progress
    && a.jobCount === b.jobCount
    && a.sharedRecipientCount === b.sharedRecipientCount
    && a.createdAt === b.createdAt
    && a.updatedAt === b.updatedAt
    && a.mediaType === b.mediaType
    && sameStrings(a.jobIds, b.jobIds)
    && sameStrings(a.batchIds, b.batchIds)
    && sameStrings(a.actions.pauseJobIds, b.actions.pauseJobIds)
    && sameStrings(a.actions.resumeJobIds, b.actions.resumeJobIds)
    && sameStrings(a.actions.retryJobIds, b.actions.retryJobIds)
    && sameStrings(a.actions.cancelJobIds, b.actions.cancelJobIds);
}

function shallowEqualRecords(a: object | null, b: object | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  return keys.length === Object.keys(bRecord).length
    && keys.every((key) => Object.is(aRecord[key], bRecord[key]));
}

/** Field-by-field equality of two inbox rows (`upload` and `openParams` compared by value). */
export function inboxRowsEqual(a: InboxRowModel, b: InboxRowModel) {
  if (a === b) return true;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  if (keys.length !== Object.keys(bRecord).length) return false;
  return keys.every((key) => {
    if (key === 'upload') return uploadPresentationsEqual(a.upload, b.upload);
    if (key === 'openParams') return shallowEqualRecords(a.openParams, b.openParams);
    return Object.is(aRecord[key], bRecord[key]);
  });
}

/**
 * Structural sharing for the inbox list. Every upload progress tick rebuilds the presentations
 * (and every new message rebuilds the threads), which used to hand `memo(MessageRow)` a new object
 * for every conversation. `reconcile` keeps the previous object of each conversation
 * (`peer:${peerId}`, the same key as the list) whose fields did not change, and the previous
 * array when nothing changed at all, so only the rows that really changed re-render.
 */
export function createInboxRowIdentityCache() {
  let previousByKey = new Map<string, InboxRowModel>();
  let previousRows: InboxRowModel[] = [];

  return {
    reconcile(rows: InboxRowModel[]): InboxRowModel[] {
      const nextByKey = new Map<string, InboxRowModel>();
      let changed = rows.length !== previousRows.length;
      const result = rows.map((row, index) => {
        const key = `peer:${row.peerId}`;
        const previous = previousByKey.get(key);
        const kept = previous && inboxRowsEqual(previous, row) ? previous : row;
        nextByKey.set(key, kept);
        if (kept !== previousRows[index]) changed = true;
        return kept;
      });
      if (!changed) return previousRows;
      previousByKey = nextByKey;
      previousRows = result;
      return result;
    },
  };
}
