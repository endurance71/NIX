import { describe, expect, it } from 'vitest';
import { getCameraLightProps } from './cameraLightProps';

describe('getCameraLightProps', () => {
  it('uses flash for still photos without enabling torch', () => {
    expect(
      getCameraLightProps({
        captureMode: 'picture',
        facing: 'back',
        flash: 'on',
        videoPreparing: false,
        recordingVideo: false,
      })
    ).toEqual({ flash: 'on', enableTorch: false });
  });

  it('enables torch while video mode is preparing', () => {
    expect(
      getCameraLightProps({
        captureMode: 'video',
        facing: 'back',
        flash: 'on',
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
        videoPreparing: true,
        recordingVideo: true,
      })
    ).toEqual({ flash: 'off', enableTorch: false });
  });
});
