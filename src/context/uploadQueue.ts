import { createContext, useContext } from 'react';

import type {
  DurableUploadJob,
  EnqueueMediaBatchInput,
  UploadQueueSummary,
} from '../types/uploadQueue';

export type UploadQueueContextValue = {
  ready: boolean;
  stagingCount: number;
  jobs: DurableUploadJob[];
  summary: UploadQueueSummary;
  enqueueMediaBatch(input: EnqueueMediaBatchInput): Promise<{ jobId: string; batchId: string }>;
  pauseUpload(jobId: string): Promise<void>;
  resumeUpload(jobId: string): Promise<void>;
  retryUpload(jobId: string): Promise<void>;
  cancelUpload(jobId: string): Promise<void>;
  refresh(): Promise<void>;
};

export const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function useUploadQueue() {
  const value = useContext(UploadQueueContext);
  if (!value) throw new Error('useUploadQueue must be used inside UploadQueueProvider.');
  return value;
}

export function useUploadJobs() {
  return useUploadQueue().jobs;
}

export function useUploadQueueSummary() {
  return useUploadQueue().summary;
}
