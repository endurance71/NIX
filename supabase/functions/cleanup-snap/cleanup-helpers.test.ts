import { describe, expect, it } from 'vitest';
import { isValidCleanupPayload, nextCleanupAttemptDelayMs } from './cleanup-helpers';

describe('cleanup helpers', () => {
  it('waliduje payload cleanup', () => {
    expect(isValidCleanupPayload({ snapId: '1', mediaPath: 'snaps/a.jpg' })).toBe(true);
    expect(isValidCleanupPayload({ snapId: '1' })).toBe(false);
    expect(isValidCleanupPayload({ mediaPath: 'snaps/a.jpg' })).toBe(false);
  });

  it('wylicza opóźnienie retry z limitem górnym', () => {
    expect(nextCleanupAttemptDelayMs(1)).toBe(60_000);
    expect(nextCleanupAttemptDelayMs(5)).toBe(300_000);
    expect(nextCleanupAttemptDelayMs(30)).toBe(900_000);
  });
});
