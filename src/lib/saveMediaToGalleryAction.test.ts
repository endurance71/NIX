import { beforeEach, describe, expect, it, vi } from 'vitest';

const bakeMediaOverlays = vi.fn();
const releaseBakedOverlayUris = vi.fn(async (_uris: unknown): Promise<void> => undefined);
const ensureWritePermission = vi.fn(async () => 'granted');
const saveLocalUrisToLibrary = vi.fn(async (_uris: unknown) => undefined);

vi.mock('./bakeMediaTextOverlay', () => ({
  bakeMediaOverlays: (args: unknown) => bakeMediaOverlays(args),
  releaseBakedOverlayUris: (uris: unknown) => releaseBakedOverlayUris(uris),
}));

vi.mock('./saveToMediaLibrary', () => ({
  ensureWritePermission: () => ensureWritePermission(),
  saveLocalUrisToLibrary: (uris: unknown) => saveLocalUrisToLibrary(uris),
  saveRemoteUriToLibrary: vi.fn(async () => undefined),
}));

vi.mock('./appNotify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock('./haptics', () => ({ tap: vi.fn() }));
vi.mock('./telemetry', () => ({ trackEvent: vi.fn() }));
vi.mock('./i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() }, Linking: { openSettings: vi.fn() } }));

describe('saveLocalMediaToGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureWritePermission.mockResolvedValue('granted');
  });

  it('bakes segments concurrently and saves them in source order', async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    bakeMediaOverlays.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve))
    );
    const { saveLocalMediaToGallery } = await import('./saveMediaToGalleryAction');

    const saving = saveLocalMediaToGallery({
      source: 'preview',
      uris: ['file:///first.mp4', 'file:///second.mp4'],
      mediaType: 'video',
      viewportWidth: 390,
      viewportHeight: 844,
    });

    await vi.waitFor(() => expect(bakeMediaOverlays).toHaveBeenCalledTimes(2));
    resolvers[1]({
      uri: 'file:///baked-second.mp4',
      didBake: true,
      temporaryUris: ['file:///temp-second.mp4'],
    });
    resolvers[0]({
      uri: 'file:///baked-first.mp4',
      didBake: true,
      temporaryUris: ['file:///temp-first.mp4'],
    });

    await expect(saving).resolves.toBe(true);
    expect(saveLocalUrisToLibrary).toHaveBeenCalledWith([
      'file:///baked-first.mp4',
      'file:///baked-second.mp4',
    ]);
    expect(releaseBakedOverlayUris).toHaveBeenCalledWith([
      'file:///temp-first.mp4',
      'file:///temp-second.mp4',
    ]);
    expect(bakeMediaOverlays).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ viewportWidth: 390, viewportHeight: 844 })
    );
  });

  it('cleans successful temporary files and skips saving after a partial failure', async () => {
    let finishCleanup: (() => void) | undefined;
    releaseBakedOverlayUris.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishCleanup = resolve))
    );
    bakeMediaOverlays
      .mockResolvedValueOnce({
        uri: 'file:///baked-first.mp4',
        didBake: true,
        temporaryUris: ['file:///temp-first.mp4'],
      })
      .mockRejectedValueOnce(new Error('bake failed'));
    const { saveLocalMediaToGallery } = await import('./saveMediaToGalleryAction');

    const saving = saveLocalMediaToGallery({
      source: 'preview',
      uris: ['file:///first.mp4', 'file:///second.mp4'],
      mediaType: 'video',
      viewportWidth: 390,
      viewportHeight: 844,
    });

    await vi.waitFor(() => expect(releaseBakedOverlayUris).toHaveBeenCalledTimes(1));
    let settled = false;
    void saving.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finishCleanup?.();
    await expect(saving).resolves.toBe(false);

    expect(saveLocalUrisToLibrary).not.toHaveBeenCalled();
    expect(releaseBakedOverlayUris).toHaveBeenCalledWith(['file:///temp-first.mp4']);
  });
});
