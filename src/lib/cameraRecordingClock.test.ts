import { describe, expect, it } from 'vitest';
import { formatRecordingClock, recordingProgress } from './cameraRecordingClock';

describe('formatRecordingClock', () => {
  it('formats mm:ss with leading zeros', () => {
    expect(formatRecordingClock(0)).toBe('00:00');
    expect(formatRecordingClock(7_999)).toBe('00:07');
    expect(formatRecordingClock(65_000)).toBe('01:05');
    expect(formatRecordingClock(180_000)).toBe('03:00');
  });

  it('treats invalid input as zero', () => {
    expect(formatRecordingClock(-5)).toBe('00:00');
    expect(formatRecordingClock(Number.NaN)).toBe('00:00');
  });
});

describe('recordingProgress', () => {
  it('is the clamped share of the limit', () => {
    expect(recordingProgress(0, 180_000)).toBe(0);
    expect(recordingProgress(90_000, 180_000)).toBe(0.5);
    expect(recordingProgress(200_000, 180_000)).toBe(1);
    expect(recordingProgress(10, 0)).toBe(0);
  });
});
