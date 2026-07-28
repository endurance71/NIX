export type UploadTaskStage =
  | 'queued'
  | 'compressing'
  | 'upload_preparing'
  | 'uploading'
  | 'persisting_metadata'
  | 'cleanup'
  | 'success'
  | 'failed'
  | 'paused'
  | 'cancelled';

type UploadTaskMediaType = 'image' | 'video';

export type UploadTaskProgress = {
  stage: UploadTaskStage;
  progress: number;
  attempt: number;
  bytesSent?: number;
  bytesTotal?: number;
  message?: string;
};

export type UploadTask = {
  id: string;
  uploadFlowId: string;
  mediaType: UploadTaskMediaType;
  receiverId: string;
  fileUri: string;
  viewDurationSec: number;
  segmentDurationMs?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  retryCount: number;
  maxRetries: number;
  progress: UploadTaskProgress;
  optimisticId: string;
  error?: string | null;
};

export type UploadQueueNixeshot = {
  version: 1;
  tasks: UploadTask[];
  activeTaskId: string | null;
  paused: boolean;
  updatedAt: number;
};

export type UploadJobState =
  | 'staging'
  | 'queued'
  | 'preparing'
  | 'requesting_target'
  | 'uploading'
  | 'waiting_network'
  | 'waiting_for_auth'
  | 'retry_scheduled'
  | 'finalizing'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'expired';

export type DurableUploadRecipient = {
  receiverId: string;
  viewDurationSec: number;
  sequenceIndex: number;
};

export type DurableUploadJob = {
  id: string;
  idempotencyKey: string;
  ownerId: string;
  mediaType: 'image' | 'video';
  state: UploadJobState;
  stagedUri: string;
  preparedUri: string | null;
  contentType: string | null;
  fileExtension: string | null;
  originalSizeBytes: number | null;
  finalSizeBytes: number | null;
  playbackDurationMs: number | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  thumbnailB64: string | null;
  batchId: string | null;
  assetId: string | null;
  storagePath: string | null;
  uploadUrl: string | null;
  uploadHeaders: Record<string, string> | null;
  uploadUrlExpiresAt: number | null;
  finalizeUrl: string | null;
  finalizeHeaders: Record<string, string> | null;
  finalizeToken: string | null;
  progress: number;
  bytesSent: number;
  bytesTotal: number;
  retryCount: number;
  authRefreshAttempted: boolean;
  nextAttemptAt: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  recipients: DurableUploadRecipient[];
};

export type EnqueueMediaBatchInput = {
  fileUri: string;
  mediaType: 'image' | 'video';
  recipients: {
    receiverId: string;
    viewDurationSec: number;
    sequenceIndex?: number;
  }[];
  playbackDurationMs?: number;
  sourceWidth?: number;
  sourceHeight?: number;
};

export type UploadQueueSummary = {
  activeCount: number;
  waitingCount: number;
  failedCount: number;
  completedCount: number;
  progress: number;
  phase: UploadJobState | null;
};
