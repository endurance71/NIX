import { describe, expect, it } from 'vitest';
import {
  mediaContentFit,
  mediaEditingViewport,
  mediaRotationDegrees,
  videoContentFit,
} from './mediaPresentation';

describe('media presentation', () => {
  it('contains landscape media without cropping', () => {
    expect(mediaContentFit({ width: 1920, height: 1080 })).toBe('contain');
    expect(mediaEditingViewport({
      media: { width: 1920, height: 1080 },
      viewportWidth: 390,
      viewportHeight: 844,
    })).toEqual({ left: 0, top: 312.3125, width: 390, height: 219.375 });
  });

  it('keeps the existing cover presentation for portrait media', () => {
    expect(mediaContentFit({ width: 1080, height: 1920 })).toBe('cover');
    expect(mediaEditingViewport({
      media: { width: 1080, height: 1920 },
      viewportWidth: 390,
      viewportHeight: 844,
    })).toEqual({ left: 0, top: 0, width: 390, height: 844 });
  });

  it('fills portrait video even when iOS reports its untransformed landscape track', () => {
    expect(videoContentFit({ width: 1280, height: 720 })).toBe('cover');
    expect(mediaEditingViewport({
      media: { width: 1280, height: 720 },
      viewportWidth: 390,
      viewportHeight: 844,
      captureOrientation: 'portrait',
    })).toEqual({ left: 0, top: 0, width: 390, height: 844 });
  });

  it('defaults unknown media to contain', () => {
    expect(mediaContentFit({})).toBe('contain');
  });

  it('classifies square media as portrait-compatible', () => {
    expect(mediaContentFit({ width: 1000, height: 1000 })).toBe('cover');
  });

  it('builds a full-screen rotated stage for the captured landscape direction', () => {
    expect(mediaRotationDegrees('landscapeLeft')).toBe(90);
    expect(mediaRotationDegrees('landscapeRight')).toBe(-90);
    expect(mediaEditingViewport({
      media: { width: 1920, height: 1080 },
      viewportWidth: 390,
      viewportHeight: 844,
      captureOrientation: 'landscapeRight',
    })).toEqual({
      left: -227,
      top: 227,
      width: 844,
      height: 390,
      rotationDegrees: -90,
    });
  });
});
