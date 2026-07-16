import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ScreenCapture from 'expo-screen-capture';
import {
  __resetViewerCaptureProtectionForTests,
  disableViewerCaptureProtection,
  enableViewerCaptureProtection,
} from './viewerCaptureProtection';

vi.mock('expo-screen-capture', () => ({
  allowScreenCaptureAsync: vi.fn().mockResolvedValue(undefined),
  disableAppSwitcherProtectionAsync: vi.fn().mockResolvedValue(undefined),
  enableAppSwitcherProtectionAsync: vi.fn().mockResolvedValue(undefined),
  preventScreenCaptureAsync: vi.fn().mockResolvedValue(undefined),
}));

const allowScreenCaptureAsync = vi.mocked(ScreenCapture.allowScreenCaptureAsync);
const disableAppSwitcherProtectionAsync = vi.mocked(ScreenCapture.disableAppSwitcherProtectionAsync);
const enableAppSwitcherProtectionAsync = vi.mocked(ScreenCapture.enableAppSwitcherProtectionAsync);
const preventScreenCaptureAsync = vi.mocked(ScreenCapture.preventScreenCaptureAsync);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('viewerCaptureProtection', () => {
  beforeEach(() => {
    __resetViewerCaptureProtectionForTests();
    allowScreenCaptureAsync.mockReset().mockResolvedValue(undefined);
    disableAppSwitcherProtectionAsync.mockReset().mockResolvedValue(undefined);
    enableAppSwitcherProtectionAsync.mockReset().mockResolvedValue(undefined);
    preventScreenCaptureAsync.mockReset().mockResolvedValue(undefined);
  });

  it('włącza oba natywne mechanizmy ochrony', async () => {
    await enableViewerCaptureProtection();

    expect(preventScreenCaptureAsync).toHaveBeenCalledWith('viewer-capture-guard');
    expect(enableAppSwitcherProtectionAsync).toHaveBeenCalledWith(0.72);
  });

  it('czeka z cleanupem na trwającą aktywację i kończy w stanie wyłączonym', async () => {
    const preventFinished = deferred();
    preventScreenCaptureAsync.mockReturnValueOnce(preventFinished.promise);

    const enable = enableViewerCaptureProtection();
    const disable = disableViewerCaptureProtection();

    expect(allowScreenCaptureAsync).not.toHaveBeenCalled();
    preventFinished.resolve();
    await Promise.all([enable, disable]);

    expect(enableAppSwitcherProtectionAsync).toHaveBeenCalledTimes(1);
    expect(allowScreenCaptureAsync).toHaveBeenCalledWith('viewer-capture-guard');
    expect(disableAppSwitcherProtectionAsync).toHaveBeenCalledTimes(1);
    expect(enableAppSwitcherProtectionAsync.mock.invocationCallOrder[0]).toBeLessThan(
      allowScreenCaptureAsync.mock.invocationCallOrder[0],
    );
  });

  it('serializuje ponowną aktywację po cleanupie i respektuje ostatni stan', async () => {
    await Promise.all([
      enableViewerCaptureProtection(),
      disableViewerCaptureProtection(),
      enableViewerCaptureProtection(),
    ]);

    expect(preventScreenCaptureAsync).toHaveBeenCalledTimes(2);
    expect(allowScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(disableAppSwitcherProtectionAsync).toHaveBeenCalledTimes(1);
    expect(allowScreenCaptureAsync.mock.invocationCallOrder[0]).toBeLessThan(
      preventScreenCaptureAsync.mock.invocationCallOrder[1],
    );
  });

  it('wycofuje częściową ochronę, gdy app switcher protection nie uruchomi się', async () => {
    enableAppSwitcherProtectionAsync.mockRejectedValueOnce(new Error('native failure'));

    await expect(enableViewerCaptureProtection()).rejects.toThrow('native failure');

    expect(allowScreenCaptureAsync).toHaveBeenCalledWith('viewer-capture-guard');
    expect(disableAppSwitcherProtectionAsync).toHaveBeenCalledTimes(1);
  });

  it('próbuje wyłączyć oba mechanizmy nawet po błędzie pierwszego', async () => {
    allowScreenCaptureAsync.mockRejectedValueOnce(new Error('allow failure'));

    await expect(disableViewerCaptureProtection()).rejects.toThrow('allow failure');

    expect(disableAppSwitcherProtectionAsync).toHaveBeenCalledTimes(1);
  });
});
