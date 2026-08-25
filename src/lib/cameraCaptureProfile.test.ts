import { describe, expect, it } from 'vitest';
import { CAMERA_CAPTURE_PROFILE } from './cameraCaptureProfile';

describe('camera capture profile', () => {
  it('keeps picture and video sessions on the same 16:9 aspect ratio', () => {
    const [pictureWidth, pictureHeight] = CAMERA_CAPTURE_PROFILE.pictureSize
      .split('x')
      .map(Number);
    const videoDimensions = CAMERA_CAPTURE_PROFILE.videoQuality === '720p'
      ? [1280, 720]
      : [0, 1];

    expect(pictureWidth / pictureHeight).toBe(16 / 9);
    expect(videoDimensions[0] / videoDimensions[1]).toBe(16 / 9);
  });

  it('disables the recording-time stabilization crop', () => {
    expect(CAMERA_CAPTURE_PROFILE.videoStabilizationMode).toBe('off');
  });
});
