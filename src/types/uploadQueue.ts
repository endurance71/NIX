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
