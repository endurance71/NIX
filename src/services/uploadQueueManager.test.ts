import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearUploadQueueNixeshot,
  readUploadQueueNixeshot,
  writeUploadQueueNixeshot,
} from '../lib/uploadQueuePersistence';

const { getItemMock, setItemMock, removeItemMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  setItemMock: vi.fn(),
  removeItemMock: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: getItemMock,
    setItem: setItemMock,
    removeItem: removeItemMock,
  },
}));

describe('uploadQueuePersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('zapisuje nixeshot kolejki', async () => {
    await writeUploadQueueNixeshot({
      version: 1,
      tasks: [],
      activeTaskId: null,
      paused: false,
      updatedAt: 123,
    });
    expect(setItemMock).toHaveBeenCalledTimes(1);
  });

  it('odczytuje poprawny nixeshot', async () => {
    getItemMock.mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        tasks: [],
        activeTaskId: null,
        paused: true,
        updatedAt: 321,
      })
    );
    const nixeshot = await readUploadQueueNixeshot();
    expect(nixeshot?.paused).toBe(true);
    expect(nixeshot?.version).toBe(1);
  });

  it('ignoruje uszkodzony nixeshot', async () => {
    getItemMock.mockResolvedValueOnce('{invalid');
    const nixeshot = await readUploadQueueNixeshot();
    expect(nixeshot).toBeNull();
  });

  it('czyści nixeshot', async () => {
    await clearUploadQueueNixeshot();
    expect(removeItemMock).toHaveBeenCalledTimes(1);
  });
});
