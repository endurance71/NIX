import { describe, expect, it, vi } from 'vitest';
import { setNativeVideoTorchForRecording } from './videoTorchSession';

vi.mock('../../modules/nix-camera-torch', () => ({
  setTorchEnabledAsync: vi.fn().mockResolvedValue({ available: false, enabled: false }),
}));

describe('videoTorchSession', () => {
  it('does not enable native torch when the recording state does not need it', async () => {
    const controller = {
      setTorchEnabledAsync: vi.fn().mockResolvedValue({ available: true, enabled: true }),
    };

    await expect(
      setNativeVideoTorchForRecording({ platform: 'ios', facing: 'front', flash: 'on' }, true, controller)
    ).resolves.toBeNull();

    expect(controller.setTorchEnabledAsync).not.toHaveBeenCalled();
  });

  it('enables and disables native torch through the controller', async () => {
    const controller = {
      setTorchEnabledAsync: vi
        .fn()
        .mockResolvedValueOnce({ available: true, enabled: true })
        .mockResolvedValueOnce({ available: true, enabled: false }),
    };
    const state = { platform: 'ios', facing: 'back' as const, flash: 'on' as const };

    await expect(setNativeVideoTorchForRecording(state, true, controller)).resolves.toEqual({
      available: true,
      enabled: true,
    });
    await expect(setNativeVideoTorchForRecording(state, false, controller)).resolves.toEqual({
      available: true,
      enabled: false,
    });

    expect(controller.setTorchEnabledAsync).toHaveBeenNthCalledWith(1, true);
    expect(controller.setTorchEnabledAsync).toHaveBeenNthCalledWith(2, false);
  });

  it('still attempts cleanup disable even when flash is off', async () => {
    const controller = {
      setTorchEnabledAsync: vi.fn().mockResolvedValue({ available: true, enabled: false }),
    };

    await setNativeVideoTorchForRecording({ platform: 'ios', facing: 'back', flash: 'off' }, false, controller);

    expect(controller.setTorchEnabledAsync).toHaveBeenCalledWith(false);
  });

  it('returns unavailable status when the native controller throws', async () => {
    const controller = {
      setTorchEnabledAsync: vi.fn().mockRejectedValue(new Error('lock failed')),
    };

    await expect(
      setNativeVideoTorchForRecording({ platform: 'ios', facing: 'back', flash: 'on' }, true, controller)
    ).resolves.toEqual({ available: false, enabled: false });
  });
});
