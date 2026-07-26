import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestPermissionsAsync, assetCreate, downloadAsync, makeDirectoryAsync, deleteAsync } = vi.hoisted(() => ({
  requestPermissionsAsync: vi.fn(),
  assetCreate: vi.fn(),
  downloadAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

vi.mock('expo-media-library', () => ({
  Asset: { create: assetCreate },
  requestPermissionsAsync,
}));

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync,
  makeDirectoryAsync,
  deleteAsync,
}));

describe('saveToMediaLibrary', () => {
  let ensureWritePermission: typeof import('./saveToMediaLibrary').ensureWritePermission;
  let saveLocalUrisToLibrary: typeof import('./saveToMediaLibrary').saveLocalUrisToLibrary;
  let saveRemoteUriToLibrary: typeof import('./saveToMediaLibrary').saveRemoteUriToLibrary;

  beforeEach(async () => {
    vi.resetModules();
    requestPermissionsAsync.mockReset();
    assetCreate.mockReset();
    downloadAsync.mockReset();
    makeDirectoryAsync.mockReset();
    deleteAsync.mockReset();
    assetCreate.mockResolvedValue({ id: 'asset-1' });
    makeDirectoryAsync.mockResolvedValue(undefined);
    deleteAsync.mockResolvedValue(undefined);
    const mod = await import('./saveToMediaLibrary');
    ensureWritePermission = mod.ensureWritePermission;
    saveLocalUrisToLibrary = mod.saveLocalUrisToLibrary;
    saveRemoteUriToLibrary = mod.saveRemoteUriToLibrary;
  });

  it('ensureWritePermission returns granted', async () => {
    requestPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true });
    await expect(ensureWritePermission()).resolves.toBe('granted');
    expect(requestPermissionsAsync).toHaveBeenCalledWith(true);
  });

  it('ensureWritePermission returns blocked when cannot ask again', async () => {
    requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
    await expect(ensureWritePermission()).resolves.toBe('blocked');
  });

  it('ensureWritePermission returns denied when can ask again', async () => {
    requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: true });
    await expect(ensureWritePermission()).resolves.toBe('denied');
  });

  it('saveLocalUrisToLibrary creates assets for each uri', async () => {
    await saveLocalUrisToLibrary(['file:///a.jpg', 'file:///b.mp4']);
    expect(assetCreate).toHaveBeenCalledTimes(2);
    expect(assetCreate).toHaveBeenNthCalledWith(1, 'file:///a.jpg');
    expect(assetCreate).toHaveBeenNthCalledWith(2, 'file:///b.mp4');
  });

  it('saveLocalUrisToLibrary rejects empty list', async () => {
    await expect(saveLocalUrisToLibrary([])).rejects.toThrow(/Brak plików/);
    expect(assetCreate).not.toHaveBeenCalled();
  });

  it('saveLocalUrisToLibrary propagates create errors', async () => {
    assetCreate.mockRejectedValueOnce(new Error('create failed'));
    await expect(saveLocalUrisToLibrary(['file:///a.jpg'])).rejects.toThrow('create failed');
  });

  it('saveRemoteUriToLibrary downloads then creates asset and cleans up', async () => {
    downloadAsync.mockResolvedValue({ uri: 'file:///cache/nix-save-to-library/temp.jpg' });
    await saveRemoteUriToLibrary('https://cdn.example/photo.jpg', 'jpg');
    expect(makeDirectoryAsync).toHaveBeenCalled();
    expect(downloadAsync).toHaveBeenCalled();
    expect(assetCreate).toHaveBeenCalledWith('file:///cache/nix-save-to-library/temp.jpg');
    expect(deleteAsync).toHaveBeenCalled();
  });

  it('saveRemoteUriToLibrary treats file:// as local', async () => {
    await saveRemoteUriToLibrary('file:///local/video.mp4');
    expect(downloadAsync).not.toHaveBeenCalled();
    expect(assetCreate).toHaveBeenCalledWith('file:///local/video.mp4');
  });

  it('saveRemoteUriToLibrary fails when download has no uri', async () => {
    downloadAsync.mockResolvedValue({ uri: '' });
    await expect(saveRemoteUriToLibrary('https://cdn.example/photo.jpg')).rejects.toThrow(/Pobieranie/);
  });
});
