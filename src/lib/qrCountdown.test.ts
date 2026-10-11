import { describe, expect, it } from 'vitest';
import { msUntilNextQrMinuteTick, qrMinutesRemaining } from './qrCountdown';

describe('qrMinutesRemaining', () => {
  const now = 1_000_000;

  it('rounds up to whole minutes', () => {
    expect(qrMinutesRemaining(now + 5 * 60_000, now)).toBe(5);
    expect(qrMinutesRemaining(now + 4 * 60_000 + 1, now)).toBe(5);
    expect(qrMinutesRemaining(now + 1, now)).toBe(1);
  });

  it('is 0 once expired and null when unknown', () => {
    expect(qrMinutesRemaining(now, now)).toBe(0);
    expect(qrMinutesRemaining(now - 1, now)).toBe(0);
    expect(qrMinutesRemaining(null, now)).toBeNull();
    expect(qrMinutesRemaining(Number.NaN, now)).toBeNull();
  });
});

describe('msUntilNextQrMinuteTick', () => {
  it('waits until the minute label changes', () => {
    expect(msUntilNextQrMinuteTick(90_000, 0)).toBe(30_050);
    expect(msUntilNextQrMinuteTick(120_000, 0)).toBe(60_050);
    expect(msUntilNextQrMinuteTick(0, 10)).toBe(0);
  });
});
