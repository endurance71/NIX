import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  },
}));

// eslint-disable-next-line import/first
import {
  HOLD_HINT_MAX_SHOWS,
  loadHoldHintCount,
  nextHoldHintCount,
  normalizeHoldHintCount,
  saveHoldHintCount,
  shouldShowHoldHint,
} from './cameraHoldHint';

describe('camera hold hint counter', () => {
  beforeEach(() => storage.clear());

  it('shows the hint for the first launches only', () => {
    expect(shouldShowHoldHint(0)).toBe(true);
    expect(shouldShowHoldHint(HOLD_HINT_MAX_SHOWS - 1)).toBe(true);
    expect(shouldShowHoldHint(HOLD_HINT_MAX_SHOWS)).toBe(false);
  });

  it('counts shows and retires the hint on dismiss or a recorded video', () => {
    expect(nextHoldHintCount(0, 'shown')).toBe(1);
    expect(nextHoldHintCount(HOLD_HINT_MAX_SHOWS, 'shown')).toBe(HOLD_HINT_MAX_SHOWS);
    expect(nextHoldHintCount(0, 'dismissed')).toBe(HOLD_HINT_MAX_SHOWS);
    expect(nextHoldHintCount(1, 'recorded')).toBe(HOLD_HINT_MAX_SHOWS);
  });

  it('normalizes stored values', () => {
    expect(normalizeHoldHintCount(null)).toBe(0);
    expect(normalizeHoldHintCount('2')).toBe(2);
    expect(normalizeHoldHintCount('garbage')).toBe(0);
    expect(normalizeHoldHintCount(-3)).toBe(0);
    expect(normalizeHoldHintCount(99)).toBe(HOLD_HINT_MAX_SHOWS);
  });

  it('persists the count', async () => {
    expect(await loadHoldHintCount()).toBe(0);
    await saveHoldHintCount(2);
    expect(await loadHoldHintCount()).toBe(2);
  });
});
