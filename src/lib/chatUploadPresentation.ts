import type { ChatNixEvent } from '../services/nixService';
import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';
import type { ChatMediaAnchor } from './chatTimeline';
import { COMPLETED_UPLOAD_VISIBILITY_MS } from './uploadProgress';

export type ChatUploadAction = 'retry' | 'resume' | 'cancel';


const HIDDEN_STATES = new Set<UploadJobState>(['cancelled', 'expired']);
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

export function selectChatUploadJobs(
  jobs: readonly DurableUploadJob[],
  peerId: string,
  serverNixes: readonly ChatNixEvent[],
  {
    now = Date.now(),
    completedVisibilityMs = COMPLETED_UPLOAD_VISIBILITY_MS,
  }: {
    now?: number;
    completedVisibilityMs?: number;
  } = {}
): DurableUploadJob[] {
  const finalizedBatchIds = new Set(
    serverNixes.flatMap((nix) =>
      nix.direction === 'sent' && nix.client_upload_id ? [nix.client_upload_id] : []
    )
  );

  const visibleJobs: DurableUploadJob[] = [];
  for (const job of jobs) {
    if (!job.recipients.some((recipient) => recipient.receiverId === peerId)) continue;
    if (HIDDEN_STATES.has(job.state)) continue;
    // Once the server row exists the upload is delivered, whatever the local job still says
    // (e.g. `failed` after a moderation timeout); showing both would duplicate the message.
    if (job.batchId && finalizedBatchIds.has(job.batchId)) continue;
    if (
      (job.state === 'completed' || job.state === 'partially_completed')
      && now - (job.finishedAt ?? job.updatedAt) > completedVisibilityMs
    ) {
      continue;
    }
    visibleJobs.push(job);
  }
  return visibleJobs.sort((a, b) => a.createdAt - b.createdAt);
}

export function chatUploadActions(job: DurableUploadJob): ChatUploadAction[] {
  const actions: ChatUploadAction[] = [];
  if (
    (job.state === 'failed' || job.state === 'waiting_for_auth')
    && job.errorCode !== 'FILE_TOO_LARGE_PERMANENT'
  ) {
    actions.push('retry');
  }
  // A paused job ignores „retry”; offer the action the queue actually honours.
  if (job.state === 'paused') actions.push('resume');
  if (CANCELLABLE_STATES.has(job.state)) actions.push('cancel');
  return actions;
}

export function sharedRecipientCount(job: DurableUploadJob): number {
  return new Set(job.recipients.map((recipient) => recipient.receiverId)).size;
}

export type ChatMediaBubbleIcon = 'retry' | 'completed' | 'offline' | 'paused' | 'failed';

export type ChatMediaBubblePresentation = {
  mediaType: 'image' | 'video';
  /** Rendered from the delivered server NiX rather than the local job. */
  delivered: boolean;
  failed: boolean;
  tone: 'neutral' | 'success' | 'destructive';
  icon: ChatMediaBubbleIcon | null;
  /** 0…1 while bytes move, `null` for an indeterminate spinner (or no progress at all). */
  progress: number | null;
  /** A user-triggered action is running: show a spinner instead of the icon. */
  busy: boolean;
  actions: ChatUploadAction[];
};

/**
 * Single model for the outgoing media cell (SEND-8): a delivered NiX wins over whatever the local
 * job still says, so the cell never flips back to „failed” next to delivered content.
 */
export function chatMediaBubblePresentation(
  job: DurableUploadJob | null,
  nix: Pick<ChatNixEvent, 'media_type'> | null,
  busyAction: string | null
): ChatMediaBubblePresentation {
  const uploadJob = nix ? null : job;
  const busy = busyAction !== null;
  const actions = uploadJob ? chatUploadActions(uploadJob) : [];
  const failed = Boolean(
    uploadJob
    && busyAction !== 'retry'
    && (uploadJob.state === 'failed' || uploadJob.state === 'waiting_for_auth')
  );
  const completed =
    nix !== null
    || uploadJob?.state === 'completed'
    || uploadJob?.state === 'partially_completed'
    // Uploaded and waiting for moderation: presented as sent (a rejection surfaces separately).
    || uploadJob?.state === 'finalizing';
  let icon: ChatMediaBubbleIcon | null = null;
  if (actions.includes('retry')) icon = 'retry';
  else if (completed) icon = 'completed';
  else if (uploadJob?.state === 'waiting_network') icon = 'offline';
  else if (uploadJob?.state === 'paused') icon = 'paused';
  else if (failed) icon = 'failed';
  return {
    mediaType: (nix?.media_type ?? uploadJob?.mediaType) === 'video' ? 'video' : 'image',
    delivered: nix !== null,
    failed,
    tone: failed ? 'destructive' : completed ? 'success' : 'neutral',
    icon,
    progress: uploadJob && !busy ? chatUploadProgress(uploadJob) : null,
    busy,
    actions,
  };
}

/** Determinate fraction for the chat bubble; `null` while nothing measurable happens. */
export function chatUploadProgress(job: DurableUploadJob): number | null {
  if (job.state !== 'uploading') return null;
  return Math.max(0, Math.min(1, Number.isFinite(job.progress) ? job.progress : 0));
}

const MEDIA_ANCHOR_LIMIT = 200;
/** NiXy żyją maksymalnie 24 h (+ replay), więc starsze kotwice nie mają już czego trzymać. */
const MEDIA_ANCHOR_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const EMPTY_ANCHORS: readonly ChatMediaAnchor[] = [];

/**
 * Pure: adds anchors for jobs that already have a batch id. Returns `previous` itself when nothing
 * changed, so memoized consumers do not re-render.
 */
export function mergeChatMediaAnchors(
  previous: readonly ChatMediaAnchor[],
  jobs: readonly DurableUploadJob[],
  now: number = Date.now()
): readonly ChatMediaAnchor[] {
  const known = new Set(previous.map((anchor) => anchor.jobId));
  const added: ChatMediaAnchor[] = [];
  for (const job of jobs) {
    if (!job.batchId || known.has(job.id)) continue;
    known.add(job.id);
    added.push({ jobId: job.id, batchId: job.batchId, createdAt: job.createdAt });
  }
  const fresh = previous.filter((anchor) => now - anchor.createdAt <= MEDIA_ANCHOR_MAX_AGE_MS);
  if (added.length === 0 && fresh.length === previous.length) return previous;
  return [...fresh, ...added].slice(-MEDIA_ANCHOR_LIMIT);
}

// Per peer, for the app session: re-entering the chat keeps a delivered NiX where its upload was.
// Only ids and timestamps are stored, no content.
const mediaAnchorsByPeer = new Map<string, readonly ChatMediaAnchor[]>();

export function rememberChatMediaAnchors(
  peerId: string,
  jobs: readonly DurableUploadJob[],
  now: number = Date.now()
): readonly ChatMediaAnchor[] {
  if (!peerId) return EMPTY_ANCHORS;
  const previous = mediaAnchorsByPeer.get(peerId) ?? EMPTY_ANCHORS;
  const next = mergeChatMediaAnchors(previous, jobs, now);
  if (next !== previous) mediaAnchorsByPeer.set(peerId, next);
  return next;
}

/** Test helper. */
export function resetChatMediaAnchorsForTests() {
  mediaAnchorsByPeer.clear();
}
