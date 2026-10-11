import { describe, expect, it } from 'vitest';
import {
  projectLinearProgress,
  remainingVideoProgress,
  remainingVideoProgressMs,
  shouldResyncVideoProgress,
} from './viewerVideoProgress';

describe('viewer video progress', () => {
  it('maps player time to the remaining fraction', () => {
    expect(remainingVideoProgress(0, 10)).toBe(1);
    expect(remainingVideoProgress(2.5, 10)).toBe(0.75);
    expect(remainingVideoProgress(12, 10)).toBe(0);
    expect(remainingVideoProgress(1, 0)).toBeNull();
    expect(remainingVideoProgress(1, Number.NaN)).toBeNull();
  });

  it('derives the UI-thread animation length from the remaining time and rate', () => {
    expect(remainingVideoProgressMs(0.5, 10)).toBe(5000);
    expect(remainingVideoProgressMs(0.5, 10, 2)).toBe(2500);
    expect(remainingVideoProgressMs(0.5, 10, 0)).toBe(5000);
  });

  it('projects the linear animation without reading the shared value', () => {
    const animation = { fromProgress: 0.8, startedAtMs: 1000, durationMs: 8000 };
    expect(projectLinearProgress(animation, 1000)).toBeCloseTo(0.8);
    expect(projectLinearProgress(animation, 5000)).toBeCloseTo(0.4);
    expect(projectLinearProgress(animation, 20_000)).toBe(0);
  });

  it('resyncs only on noticeable drift (stall, seek, loop)', () => {
    const animation = { fromProgress: 1, startedAtMs: 0, durationMs: 10_000 };
    expect(shouldResyncVideoProgress(animation, 0.5, 5000)).toBe(false);
    expect(shouldResyncVideoProgress(animation, 0.6, 5000)).toBe(true);
    expect(shouldResyncVideoProgress(animation, 1, 9900)).toBe(true);
    expect(shouldResyncVideoProgress(null, 0.5, 0)).toBe(true);
  });
});
