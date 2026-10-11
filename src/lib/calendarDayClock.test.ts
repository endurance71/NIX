import { describe, expect, it } from 'vitest';
import { localDayKey, msUntilNextLocalMidnight } from './calendarDayClock';

describe('calendarDayClock', () => {
  it('keys the local calendar day', () => {
    expect(localDayKey(new Date(2026, 9, 10, 23, 59))).toBe('2026-10-10');
    expect(localDayKey(new Date(2026, 9, 11, 0, 0))).toBe('2026-10-11');
  });

  it('counts down to the next local midnight plus the margin', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 10, 23, 59, 0), 1_000)).toBe(61_000);
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 10, 0, 0, 0), 0)).toBe(
      new Date(2026, 9, 11).getTime() - new Date(2026, 9, 10).getTime()
    );
  });
});
