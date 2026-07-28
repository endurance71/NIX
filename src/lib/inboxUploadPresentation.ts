import type { FriendProfile } from '../services/friendService';
import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import {
  formatInboxTimestamp,
  type InboxRowModel,
  type RecipientUploadPhase,
  type RecipientUploadPresentation,
} from './inboxPresentation';

const COMPLETED_VISIBILITY_MS = 30_000;

const PHASE_PRIORITY: Record<RecipientUploadPhase, number> = {
  completed: 0,
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
    case 'finalizing':
      return 'uploading';
    case 'completed':
    case 'partially_completed':
      return 'completed';
    case 'cancelled':
    case 'expired':
      return null;
  }
}

function aggregatedProgress(jobs: DurableUploadJob[]) {
  if (jobs.length === 0) return 0;
  const canWeightEveryJob = jobs.every((job) => job.bytesTotal > 0);
  if (!canWeightEveryJob) {
    return jobs.reduce((sum, job) => sum + clampProgress(job.progress), 0) / jobs.length;
  }
  const totalBytes = jobs.reduce((sum, job) => sum + job.bytesTotal, 0);
  if (totalBytes <= 0) return 0;
  return jobs.reduce(
    (sum, job) => sum + clampProgress(job.progress) * job.bytesTotal,
    0
  ) / totalBytes;
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
    completedVisibilityMs = COMPLETED_VISIBILITY_MS,
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
  const serverTimestamp = Date.parse(row.createdAt);
  return upload.phase === 'completed'
    && row.direction === 'sent'
    && Number.isFinite(serverTimestamp)
    && serverTimestamp >= upload.createdAt;
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
    const upload = uploadsByRecipient.get(row.peerId) ?? null;
    return {
      ...row,
      upload: upload && !serverRowAlreadyRepresentsCompletedUpload(row, upload)
        ? upload
        : null,
    };
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
      createdAt,
      timestampLabel: formatInboxTimestamp(createdAt, locale, { now, yesterdayLabel }),
      avatarStoragePath: friend?.avatar_storage_path ?? null,
      avatarEmoji: friend?.avatar_emoji ?? null,
      mediaType: upload.mediaType,
      upload,
      openParams: null,
    });
  }

  return mergedRows.sort((a, b) => {
    const aTimestamp = a.upload?.updatedAt ?? Date.parse(a.createdAt);
    const bTimestamp = b.upload?.updatedAt ?? Date.parse(b.createdAt);
    return bTimestamp - aTimestamp;
  });
}
