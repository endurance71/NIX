import { describe, expect, it } from 'vitest';
import {
  CAMERA_PREVIEW_PORTRAIT_ASPECT,
  focusIndicatorOrigin,
  viewPointToDevicePoint,
} from './cameraFocusPoint';

const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 5);

describe('viewPointToDevicePoint', () => {
  // A view with exactly the content aspect: no crop.
  const width = 360;
  const height = 360 / CAMERA_PREVIEW_PORTRAIT_ASPECT;

  it('maps the centre to the centre', () => {
    const point = viewPointToDevicePoint({ x: width / 2, y: height / 2, viewWidth: width, viewHeight: height, mirrored: false });
    close(point.x, 0.5);
    close(point.y, 0.5);
  });

  it('rotates portrait into the landscape-right sensor frame (back camera)', () => {
    // Top-left of a portrait screen is the bottom-left of the landscape-right frame.
    const topLeft = viewPointToDevicePoint({ x: 0, y: 0, viewWidth: width, viewHeight: height, mirrored: false });
    close(topLeft.x, 0);
    close(topLeft.y, 1);
    const bottomRight = viewPointToDevicePoint({ x: width, y: height, viewWidth: width, viewHeight: height, mirrored: false });
    close(bottomRight.x, 1);
    close(bottomRight.y, 0);
  });

  it('flips the horizontal axis for a mirrored front preview', () => {
    const topLeft = viewPointToDevicePoint({ x: 0, y: 0, viewWidth: width, viewHeight: height, mirrored: true });
    close(topLeft.x, 0);
    close(topLeft.y, 0);
  });

  it('accounts for the aspect-fill crop on a tall screen', () => {
    // 390x844 is taller than 9:16, so the content is wider than the view and cropped left/right.
    const viewWidth = 390;
    const viewHeight = 844;
    const contentWidth = viewHeight * CAMERA_PREVIEW_PORTRAIT_ASPECT;
    const cropped = (contentWidth - viewWidth) / 2;
    const leftEdge = viewPointToDevicePoint({ x: 0, y: viewHeight / 2, viewWidth, viewHeight, mirrored: false });
    close(leftEdge.x, 0.5);
    close(leftEdge.y, 1 - cropped / contentWidth);
  });

  it('accounts for the crop on a wide view', () => {
    const viewWidth = 600;
    const viewHeight = 600;
    const contentHeight = viewWidth / CAMERA_PREVIEW_PORTRAIT_ASPECT;
    const cropped = (contentHeight - viewHeight) / 2;
    const top = viewPointToDevicePoint({ x: viewWidth / 2, y: 0, viewWidth, viewHeight, mirrored: false });
    close(top.x, cropped / contentHeight);
    close(top.y, 0.5);
  });

  it('falls back to the centre for an unmeasured view and clamps outside taps', () => {
    expect(viewPointToDevicePoint({ x: 10, y: 10, viewWidth: 0, viewHeight: 0, mirrored: false })).toEqual({ x: 0.5, y: 0.5 });
    const outside = viewPointToDevicePoint({ x: -50, y: 5000, viewWidth: width, viewHeight: height, mirrored: false });
    close(outside.x, 1);
    close(outside.y, 1);
  });
});

describe('focusIndicatorOrigin', () => {
  it('centres the square on the tap', () => {
    expect(focusIndicatorOrigin(200, 300, 400, 800, 80)).toEqual({ left: 160, top: 260 });
  });

  it('keeps the square on screen near the edges', () => {
    expect(focusIndicatorOrigin(5, 795, 400, 800, 80)).toEqual({ left: 0, top: 720 });
  });
});
