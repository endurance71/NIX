import { beforeEach, describe, expect, it, vi } from 'vitest';
const { storage, image, sweep } = vi.hoisted(() => ({
  storage: { getItem: vi.fn(), setItem: vi.fn() },
  image: { clearDiskCache: vi.fn(), clearMemoryCache: vi.fn(), configureCache: vi.fn() },
  sweep: vi.fn(),
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn(() => ({ remove() {} })) } }));
vi.mock('expo-image', () => ({ Image: image }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('./encryptedPhotoCache', () => ({ encryptedPhotoCache: { sweep } }));
vi.mock('./telemetry', () => ({ trackEvent: vi.fn() }));

describe('legacy plaintext photo cache migration', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); storage.getItem.mockResolvedValue(null); image.clearDiskCache.mockResolvedValue(true); image.clearMemoryCache.mockResolvedValue(true); sweep.mockResolvedValue(undefined); });

  it('purges disk once and shares migration between parallel photo loads', async () => {
    const { preparePrivatePhotoCache } = await import('./mediaCache');
    await Promise.all([preparePrivatePhotoCache(), preparePrivatePhotoCache()]);
    expect(image.clearDiskCache).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith('nix.photo-cache.legacy-purged.v1', 'done');
    await preparePrivatePhotoCache(); expect(image.clearDiskCache).toHaveBeenCalledTimes(1);
  });

  it('fails closed and retries if disk purge did not complete', async () => {
    image.clearDiskCache.mockResolvedValueOnce(false);
    const { preparePrivatePhotoCache } = await import('./mediaCache');
    await expect(preparePrivatePhotoCache()).rejects.toThrow('Legacy photo cache purge failed');
    expect(storage.setItem).not.toHaveBeenCalled();
    await preparePrivatePhotoCache(); expect(image.clearDiskCache).toHaveBeenCalledTimes(2);
  });

  it('preserves the separate avatar disk cache after migration has completed', async () => {
    storage.getItem.mockResolvedValue('done');
    const { preparePrivatePhotoCache } = await import('./mediaCache');
    await preparePrivatePhotoCache(); expect(image.clearDiskCache).not.toHaveBeenCalled(); expect(sweep).toHaveBeenCalled();
  });
});
