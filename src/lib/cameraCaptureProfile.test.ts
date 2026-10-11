import { describe, expect, it } from 'vitest';
import { CAMERA_CAPTURE_PROFILE } from './cameraCaptureProfile';

describe('camera capture profile', () => {
  it('keeps picture and video sessions on the same 16:9 aspect ratio', () => {
    const [pictureWidth, pictureHeight] = CAMERA_CAPTURE_PROFILE.pictureSize
      .split('x')
      .map(Number);
    const videoDimensions = CAMERA_CAPTURE_PROFILE.videoQuality === '1080p'
      ? [1920, 1080]
      : [0, 1];

    expect(pictureWidth / pictureHeight).toBe(16 / 9);
    expect(videoDimensions[0] / videoDimensions[1]).toBe(16 / 9);
  });

  it('records on the same session preset as stills, so starting a video does not reconfigure', () => {
    expect(CAMERA_CAPTURE_PROFILE.pictureSize).toBe('1920x1080');
    expect(CAMERA_CAPTURE_PROFILE.videoQuality).toBe('1080p');
  });

  it('disables the recording-time stabilization crop', () => {
    expect(CAMERA_CAPTURE_PROFILE.videoStabilizationMode).toBe('off');
  });
});
