export type NativeUploadState =
  | 'queued'
  | 'uploading'
  | 'retry_scheduled'
  | 'waiting_network'
  | 'waiting_for_auth'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type NativeUploadSnapshot = {
  jobId: string;
  batchId: string;
  state: NativeUploadState;
  progress: number;
  bytesSent: number;
  bytesTotal: number;
  attempt: number;
  statusCode?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  responseBody?: string | null;
  updatedAt: number;
  putStartedAt?: number | null;
  putEndedAt?: number | null;
  finalizeStartedAt?: number | null;
  finalizeEndedAt?: number | null;
};

export type NativeEnqueueOptions = {
  jobId: string;
  batchId: string;
  fileUri: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  finalizeUrl: string;
  finalizeHeaders: Record<string, string>;
  finalizeToken: string;
  expiresAt: number;
  mediaType: 'image' | 'video';
  sizeBytes: number;
};

export type NativeBackgroundUploaderEvents = {
  onUploadProgress: (event: {
    jobId: string;
    batchId: string;
    progress: number;
    bytesSent: number;
    bytesTotal: number;
  }) => void;
  onUploadState: (event: NativeUploadSnapshot) => void;
};

export type NativeBackgroundUploaderModule = {
  stageFile(jobId: string, sourceUri: string, fileName: string): Promise<{ uri: string; sizeBytes: number }>;
  findStagedFile(jobId: string, role: 'source' | 'prepared'): Promise<{ uri: string; sizeBytes: number } | null>;
  deleteStagedJob(jobId: string): Promise<void>;
  enqueue(options: NativeEnqueueOptions): Promise<{ scheduled: boolean; nativeTaskId?: number; duplicate?: boolean }>;
  pause(jobId: string): Promise<void>;
  resume(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
  listTasks(): Promise<NativeUploadSnapshot[]>;
  reconcile(): Promise<NativeUploadSnapshot[]>;
};
