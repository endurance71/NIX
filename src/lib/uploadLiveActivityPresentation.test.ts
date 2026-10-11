import { describe, expect, it } from 'vitest';

import {
  buildUploadLiveActivityNativeState,
  buildUploadLiveActivityProps,
} from './uploadLiveActivityPresentation';
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
  it('keeps an automatically scheduled retry in the sending state', () => {
    expect(buildUploadLiveActivityProps(
      summary({ waitingCount: 1, phase: 'retry_scheduled' }),
      123
    )).toEqual({
      phase: 'uploading',
      progress: 0.3,
      remainingCount: 1,
      updatedAt: 123,
      locale: 'en',
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

  it('keeps paused uploads distinct from active progress', () => {
    expect(buildUploadLiveActivityProps(
      summary({ activeCount: 1, phase: 'paused' })
    )).toMatchObject({
      phase: 'paused',
      remainingCount: 1,
    });
  });
  it('carries the selected locale to the isolated widget runtime', () => {
    expect(buildUploadLiveActivityProps(summary(), 123, 'pl').locale).toBe('pl');
    expect(buildUploadLiveActivityProps(summary(), 123, 'en').locale).toBe('en');
  });
});

describe('upload Live Activity native queue view', () => {
  it('reports only unfinished jobs so native never ends the activity while work is pending', () => {
    expect(buildUploadLiveActivityNativeState([
      { id: 'sent', state: 'completed', progress: 1 },
      { id: 'partial', state: 'partially_completed', progress: 1 },
      { id: 'gone', state: 'cancelled', progress: 0.4 },
      { id: 'old', state: 'expired', progress: 0.2 },
      { id: 'compressing', state: 'preparing', progress: 0.12345 },
      { id: 'moderation', state: 'finalizing', progress: 0.95 },
      { id: 'retry', state: 'retry_scheduled', progress: 0.5 },
      { id: 'broken', state: 'failed', progress: 0.3 },
    ], 42, 'pl')).toEqual({
      version: 1,
      updatedAt: 42,
      locale: 'pl',
      jobs: [
        { id: 'compressing', state: 'preparing', progress: 0.123 },
        { id: 'moderation', state: 'finalizing', progress: 0.95 },
        { id: 'retry', state: 'retry_scheduled', progress: 0.5 },
        { id: 'broken', state: 'failed', progress: 0.3 },
      ],
    });
  });

  it('clamps invalid progress values', () => {
    expect(buildUploadLiveActivityNativeState([
      { id: 'a', state: 'uploading', progress: Number.NaN },
      { id: 'b', state: 'uploading', progress: 1.4 },
    ], 1).jobs.map((job) => job.progress)).toEqual([0, 1]);
  });

  it('reports an empty queue explicitly', () => {
    expect(buildUploadLiveActivityNativeState([], 7).jobs).toEqual([]);
  });
});
