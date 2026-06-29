import { describe, expect, it } from 'vitest';
import { getCameraLightProps } from './cameraLightProps';

describe('getCameraLightProps', () => {
  it('keeps native flash off while still photo flash is only a user preference', () => {
    expect(
      getCameraLightProps({
        captureMode: 'picture',
        facing: 'back',
        flash: 'on',
        stillFlashArmed: false,
        videoTorchRequested: false,
        videoPreparing: false,
        recordingVideo: false,
      })
    ).toEqual({ flash: 'off', enableTorch: false });
  });

  it('uses flash for an armed still photo capture without enabling torch', () => {
    expect(
      getCameraLightProps({
        captureMode: 'picture',
        facing: 'back',
        flash: 'on',
        stillFlashArmed: true,
        videoTorchRequested: false,
        videoPreparing: false,
        recordingVideo: false,
      })
    ).toEqual({ flash: 'on', enableTorch: false });
  });

  it('enables torch when video torch is requested before switching modes', () => {
    expect(
      getCameraLightProps({
        captureMode: 'video',
        facing: 'back',
        flash: 'on',
        stillFlashArmed: false,
        videoTorchRequested: true,
        videoPreparing: false,
        recordingVideo: false,
      })
    ).toEqual({ flash: 'off', enableTorch: true });
  });

  it('enables torch while video mode is preparing', () => {
    expect(
      getCameraLightProps({
        captureMode: 'video',
        facing: 'back',
        flash: 'on',
        stillFlashArmed: false,
        videoTorchRequested: false,
        videoPreparing: true,
        recordingVideo: false,
      })
    ).toEqual({ flash: 'off', enableTorch: true });
  });

  it('keeps torch enabled while recording video', () => {
    expect(
      getCameraLightProps({
        captureMode: 'video',
        facing: 'back',
        flash: 'on',
        stillFlashArmed: false,
        videoTorchRequested: false,
        videoPreparing: false,
        recordingVideo: true,
      })
    ).toEqual({ flash: 'off', enableTorch: true });
  });

  it('does not enable torch when flash is off', () => {
    expect(
      getCameraLightProps({
        captureMode: 'video',
        facing: 'back',
        flash: 'off',
        stillFlashArmed: false,
        videoTorchRequested: true,
        videoPreparing: true,
        recordingVideo: true,
      })
    ).toEqual({ flash: 'off', enableTorch: false });
  });

  it('does not enable torch for the front camera', () => {
    expect(
      getCameraLightProps({
        captureMode: 'video',
        facing: 'front',
        flash: 'on',
        stillFlashArmed: false,
        videoTorchRequested: true,
        videoPreparing: true,
        recordingVideo: true,
      })
    ).toEqual({ flash: 'off', enableTorch: false });
  });
});
