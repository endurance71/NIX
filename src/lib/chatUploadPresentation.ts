import type { ChatNixEvent } from '../services/nixService';
import type { DurableUploadJob, UploadJobState } from '../types/uploadQueue';

export type ChatUploadAction = 'retry' | 'cancel';

const COMPLETED_VISIBILITY_MS = 30_000;

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
    completedVisibilityMs = COMPLETED_VISIBILITY_MS,
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
    if (job.state === 'completed' || job.state === 'partially_completed') {
      if (job.batchId && finalizedBatchIds.has(job.batchId)) continue;
      if (now - (job.finishedAt ?? job.updatedAt) > completedVisibilityMs) continue;
    }
    visibleJobs.push(job);
  }
  return visibleJobs.sort((a, b) => a.createdAt - b.createdAt);
}

export function chatUploadActions(job: DurableUploadJob): ChatUploadAction[] {
  const actions: ChatUploadAction[] = [];
  if (
    (
      job.state === 'failed'
      || job.state === 'waiting_for_auth'
      || job.state === 'retry_scheduled'
      || job.state === 'paused'
    )
    && job.errorCode !== 'FILE_TOO_LARGE_PERMANENT'
  ) {
    actions.push('retry');
  }
  if (CANCELLABLE_STATES.has(job.state)) actions.push('cancel');
  return actions;
}

export function sharedRecipientCount(job: DurableUploadJob): number {
  return new Set(job.recipients.map((recipient) => recipient.receiverId)).size;
}
