import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearUploadQueueSnapshot,
  readUploadQueueSnapshot,
} from '../lib/uploadQueuePersistence';

const { getItemMock, removeItemMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  removeItemMock: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: getItemMock,
    removeItem: removeItemMock,
  },
}));

describe('uploadQueuePersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('odczytuje poprawny snapshot', async () => {
    getItemMock.mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        tasks: [],
        activeTaskId: null,
        paused: true,
        updatedAt: 321,
      })
    );
    const snapshot = await readUploadQueueSnapshot();
    expect(snapshot?.paused).toBe(true);
    expect(snapshot?.version).toBe(1);
  });

  it('ignoruje uszkodzony snapshot', async () => {
    getItemMock.mockResolvedValueOnce('{invalid');
    const snapshot = await readUploadQueueSnapshot();
    expect(snapshot).toBeNull();
  });

  it('czyści snapshot', async () => {
    await clearUploadQueueSnapshot();
    expect(removeItemMock).toHaveBeenCalledTimes(1);
  });
});
