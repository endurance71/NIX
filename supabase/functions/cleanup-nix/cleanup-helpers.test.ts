import { describe, expect, it } from 'vitest';
import { canCleanupNixMedia, isValidCleanupPayload, nextCleanupAttemptDelayMs } from './cleanup-helpers';

describe('cleanup helpers', () => {
  it('waliduje payload cleanup', () => {
    expect(isValidCleanupPayload({ nixId: '1', mediaPath: 'nixes/a.jpg' })).toBe(true);
    expect(isValidCleanupPayload({ nixId: '1' })).toBe(false);
    expect(isValidCleanupPayload({ mediaPath: 'nixes/a.jpg' })).toBe(false);
  });

  it('wylicza opóźnienie retry z limitem górnym', () => {
    expect(nextCleanupAttemptDelayMs(1)).toBe(60_000);
    expect(nextCleanupAttemptDelayMs(5)).toBe(300_000);
    expect(nextCleanupAttemptDelayMs(30)).toBe(900_000);
  });

  it('pozwala na cleanup po replay', () => {
    expect(
      canCleanupNixMedia({
        is_replayed: true,
        replay_expires_at: '2026-07-26T12:10:00.000Z',
      })
    ).toBe(true);
  });

  it('blokuje cleanup w aktywnym oknie replay', () => {
    expect(
      canCleanupNixMedia(
        {
          is_replayed: false,
          replay_expires_at: '2026-07-26T12:10:00.000Z',
        },
        new Date('2026-07-26T12:05:00.000Z')
      )
    ).toBe(false);
  });

  it('pozwala na cleanup po wygaśnięciu TTL bez replay', () => {
    expect(
      canCleanupNixMedia(
        {
          is_replayed: false,
          replay_expires_at: '2026-07-26T12:10:00.000Z',
        },
        new Date('2026-07-26T12:10:00.000Z')
      )
    ).toBe(true);
  });

  it('pozwala na cleanup legacy bez deadline', () => {
    expect(canCleanupNixMedia({ is_replayed: false, replay_expires_at: null })).toBe(true);
  });
});
