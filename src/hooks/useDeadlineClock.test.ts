import { describe, expect, it } from 'vitest';
import { nextDeadlineAfter } from './useDeadlineClock';

describe('nextDeadlineAfter', () => {
  it('returns the nearest future deadline for a single timer', () => {
    expect(nextDeadlineAfter([1_000, 5_000, 3_000, Number.NaN], 2_000)).toBe(3_000);
    expect(nextDeadlineAfter([1_000], 2_000)).toBeNull();
    expect(nextDeadlineAfter([], 2_000)).toBeNull();
  });
});
