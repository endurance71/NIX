import { describe, expect, it } from 'vitest';

import { buildUploadLiveActivityProps } from './uploadLiveActivityPresentation';
import type { UploadQueueSummary } from '../types/uploadQueue';

function summary(
  overrides: Partial<UploadQueueSummary> = {}
): UploadQueueSummary {
  return {
    activeCount: 1,
    waitingCount: 0,
    failedCount: 0,
    completedCount: 0,
    progress: 0.3,
    phase: 'uploading',
    ...overrides,
  };
}

describe('upload Live Activity presentation', () => {
  it('shows an actionable error for an automatically scheduled retry', () => {
    expect(buildUploadLiveActivityProps(
      summary({ waitingCount: 1, phase: 'retry_scheduled' }),
      123
    )).toEqual({
      phase: 'failed',
      progress: 0.3,
      remainingCount: 1,
      updatedAt: 123,
    });
  });

  it('shows an actionable error while authentication is required', () => {
    expect(buildUploadLiveActivityProps(
      summary({ waitingCount: 1, phase: 'waiting_for_auth' })
    ).phase).toBe('failed');
  });

  it('keeps network waiting distinct from a failed upload', () => {
    expect(buildUploadLiveActivityProps(
      summary({ waitingCount: 1, phase: 'waiting_network' })
    ).phase).toBe('waiting_network');
  });
});
