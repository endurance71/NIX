import { createContext, useContext } from 'react';

import type {
  DurableUploadJob,
  EnqueueMediaBatchInput,
  UploadQueueSummary,
} from '../types/uploadQueue';

export type UploadQueueActions = {
  enqueueMediaBatch(input: EnqueueMediaBatchInput): Promise<{ jobId: string; batchId: string }>;
  pauseUpload(jobId: string): Promise<void>;
  resumeUpload(jobId: string): Promise<void>;
  retryUpload(jobId: string): Promise<void>;
  cancelUpload(jobId: string): Promise<void>;
  refresh(): Promise<void>;
};

export type UploadQueueState = {
  ready: boolean;
  stagingCount: number;
  jobs: DurableUploadJob[];
  summary: UploadQueueSummary;
};

export type UploadQueueContextValue = UploadQueueActions & UploadQueueState;

// Split so screens that only trigger actions (send-to) don't re-render on every progress tick.
export const UploadQueueActionsContext = createContext<UploadQueueActions | null>(null);
export const UploadQueueStateContext = createContext<UploadQueueState | null>(null);

export function useUploadQueueActions() {
  const value = useContext(UploadQueueActionsContext);
  if (!value) throw new Error('useUploadQueueActions must be used inside UploadQueueProvider.');
  return value;
}

function useUploadQueueState() {
  const value = useContext(UploadQueueStateContext);
  if (!value) throw new Error('Upload queue state must be read inside UploadQueueProvider.');
  return value;
}

export function useUploadJobs() {
  return useUploadQueueState().jobs;
}

export function useUploadQueueSummary() {
  return useUploadQueueState().summary;
}
