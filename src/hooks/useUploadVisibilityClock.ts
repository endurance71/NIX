import { useMemo } from 'react';
import type { DurableUploadJob } from '../types/uploadQueue';
import { useDeadlineClock } from './useDeadlineClock';

/**
 * Ticks when a completed upload's „Sent” presentation should go away (`visibilityMs` after it
 * finished). `peerId` limits it to uploads addressed to one conversation.
 */
export function useUploadVisibilityClock(
  uploadJobs: readonly DurableUploadJob[],
  visibilityMs: number,
  peerId?: string,
) {
  const deadlines = useMemo(
    () =>
      uploadJobs.flatMap((job) => {
        if (job.state !== 'completed' && job.state !== 'partially_completed') return [];
        if (peerId && !job.recipients.some((recipient) => recipient.receiverId === peerId)) return [];
        return [(job.finishedAt ?? job.updatedAt) + visibilityMs];
      }),
    [peerId, uploadJobs, visibilityMs],
  );
  return useDeadlineClock(deadlines);
}
