import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledgeViewedNix,
  enqueueViewedAck,
  flushPendingViewedAcks,
  sanitizePendingViewedAcks,
  viewedAckRetryDelayMs,
} from './viewedAckQueue';

const { storage, mockGetCurrentUser, mockMarkViewed } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  mockGetCurrentUser: vi.fn(),
  mockMarkViewed: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  },
}));

vi.mock('../services/profileService', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('../services/nixService', () => ({ markNixViewedWithCleanup: mockMarkViewed }));

describe('viewed acknowledgement queue', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'receiver-1' });
    mockMarkViewed.mockResolvedValue(undefined);
  });

  it('deduplikuje wpisy i dostarcza je tylko raz', async () => {
    const ack = {
      nixId: 'nix-1',
      mediaPath: 'nixes/receiver-1/nix-1.jpg',
      createdAt: 1,
      attemptCount: 0,
      nextAttemptAt: 0,
    };
    await enqueueViewedAck('receiver-1', ack);
    await enqueueViewedAck('receiver-1', ack);

    await flushPendingViewedAcks('receiver-1', { force: true });

    expect(mockMarkViewed).toHaveBeenCalledTimes(1);
    expect(storage.size).toBe(0);
  });

  it('zachowuje nieudane potwierdzenie i usuwa je po ponowieniu', async () => {
    mockMarkViewed.mockRejectedValueOnce(new Error('offline'));

    await expect(
      acknowledgeViewedNix({ id: 'nix-2', media_path: 'nixes/receiver-1/nix-2.jpg' })
    ).resolves.toBe(false);
    expect(storage.size).toBe(1);

    mockMarkViewed.mockResolvedValue(undefined);
    await flushPendingViewedAcks('receiver-1', { force: true });

    expect(mockMarkViewed).toHaveBeenCalledTimes(2);
    expect(storage.size).toBe(0);
  });

  it('izoluje kolejki różnych użytkowników', async () => {
    await enqueueViewedAck('receiver-1', {
      nixId: 'one',
      mediaPath: 'one.jpg',
      createdAt: 1,
      attemptCount: 0,
      nextAttemptAt: 0,
    });
    await enqueueViewedAck('receiver-2', {
      nixId: 'two',
      mediaPath: 'two.jpg',
      createdAt: 1,
      attemptCount: 0,
      nextAttemptAt: 0,
    });

    await flushPendingViewedAcks('receiver-1', { force: true });

    expect(mockMarkViewed).toHaveBeenCalledWith('one', 'one.jpg');
    expect(mockMarkViewed).not.toHaveBeenCalledWith('two', 'two.jpg');
    expect(storage.size).toBe(1);
  });

  it('sanityzuje dane i stosuje ograniczony backoff', () => {
    expect(sanitizePendingViewedAcks([null, { nixId: '', mediaPath: '' }])).toEqual([]);
    expect(viewedAckRetryDelayMs(1)).toBe(60_000);
    expect(viewedAckRetryDelayMs(2)).toBe(300_000);
    expect(viewedAckRetryDelayMs(99)).toBe(900_000);
  });
});
