import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { impactAsync, selectionAsync, notificationAsync } = vi.hoisted(() => ({
  impactAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
    Soft: 'Soft',
    Rigid: 'Rigid',
  },
  NotificationFeedbackType: {
    Success: 'Success',
    Warning: 'Warning',
    Error: 'Error',
  },
  impactAsync,
  selectionAsync,
  notificationAsync,
}));

describe('haptics', () => {
  let tap: typeof import('./haptics').tap;
  let selection: typeof import('./haptics').selection;
  let notify: typeof import('./haptics').notify;

  beforeEach(async () => {
    vi.resetModules();
    process.env.EXPO_OS = 'ios';
    const m = await import('./haptics');
    tap = m.tap;
    selection = m.selection;
    notify = m.notify;
    impactAsync.mockClear();
    selectionAsync.mockClear();
    notificationAsync.mockClear();
    impactAsync.mockImplementation(() => Promise.resolve());
    selectionAsync.mockImplementation(() => Promise.resolve());
    notificationAsync.mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    process.env.EXPO_OS = 'ios';
  });

  it('tap mapuje intensywność na impactAsync (iOS)', () => {
    tap('light');
    tap('medium');
    tap('heavy');
    tap('soft');
    tap('rigid');
    expect(impactAsync).toHaveBeenNthCalledWith(1, 'Light');
    expect(impactAsync).toHaveBeenNthCalledWith(2, 'Medium');
    expect(impactAsync).toHaveBeenNthCalledWith(3, 'Heavy');
    expect(impactAsync).toHaveBeenNthCalledWith(4, 'Soft');
    expect(impactAsync).toHaveBeenNthCalledWith(5, 'Rigid');
  });

  it('selection wywołuje selectionAsync na iOS', () => {
    selection();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
    expect(impactAsync).not.toHaveBeenCalled();
  });

  it('notify mapuje rodzaj na notificationAsync', () => {
    notify('success');
    notify('warning');
    notify('error');
    expect(notificationAsync).toHaveBeenNthCalledWith(1, 'Success');
    expect(notificationAsync).toHaveBeenNthCalledWith(2, 'Warning');
    expect(notificationAsync).toHaveBeenNthCalledWith(3, 'Error');
  });

  it('odrzucony Promise z impactAsync nie propaguje (catch wewnętrzny)', async () => {
    impactAsync.mockRejectedValueOnce(new Error('haptics unavailable'));
    expect(() => tap('light')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
