import { describe, expect, it } from 'vitest';
import {
  consumeViewerPhotoTimer,
  createViewerPhotoTimer,
  isViewerPlaybackPaused,
  resolveViewerTapZone,
  shouldDismissViewer,
  shouldViewerAutoAdvance,
  viewerDismissProgress,
  viewerDismissScale,
  viewerPhotoSlideMs,
  viewerPhotoTimerProgress,
} from './viewerGestures';

describe('resolveViewerTapZone', () => {
  it('restarts in the left third and advances everywhere else', () => {
    expect(resolveViewerTapZone(0, 390)).toBe('back');
    expect(resolveViewerTapZone(129, 390)).toBe('back');
    expect(resolveViewerTapZone(130, 390)).toBe('next');
    expect(resolveViewerTapZone(389, 390)).toBe('next');
  });

  it('advances when the width is unknown', () => {
    expect(resolveViewerTapZone(10, 0)).toBe('next');
  });
});

describe('photo timer', () => {
  it('resumes from the remaining time after a pause', () => {
    const timer = createViewerPhotoTimer('n1', 5000);
    const paused = consumeViewerPhotoTimer(timer, 2000);
    expect(paused.remainingMs).toBe(3000);
    expect(viewerPhotoTimerProgress(paused)).toBeCloseTo(0.6);
    const pausedAgain = consumeViewerPhotoTimer(paused, 1000);
    expect(pausedAgain.remainingMs).toBe(2000);
    expect(pausedAgain.slideId).toBe('n1');
  });

  it('never goes below zero or backwards', () => {
    const timer = createViewerPhotoTimer('n1', 1000);
    expect(consumeViewerPhotoTimer(timer, 5000).remainingMs).toBe(0);
    expect(consumeViewerPhotoTimer(timer, -50).remainingMs).toBe(1000);
    expect(consumeViewerPhotoTimer(timer, Number.NaN).remainingMs).toBe(1000);
  });

  it('reports full progress before start and none for an empty timer', () => {
    expect(viewerPhotoTimerProgress(createViewerPhotoTimer('n1', 4000))).toBe(1);
    expect(viewerPhotoTimerProgress(createViewerPhotoTimer('n1', 0))).toBe(0);
  });

  it('maps view duration to slide length; 0 means unlimited', () => {
    expect(viewerPhotoSlideMs(0)).toBeNull();
    expect(viewerPhotoSlideMs(null)).toBe(5000);
    expect(viewerPhotoSlideMs(3)).toBe(3000);
    expect(viewerPhotoSlideMs(0.2)).toBe(1000);
  });
});

describe('swipe-down dismiss', () => {
  const height = 800;

  it('dismisses past a quarter of the height', () => {
    expect(shouldDismissViewer(201, 0, height)).toBe(true);
    expect(shouldDismissViewer(199, 0, height)).toBe(false);
  });

  it('dismisses on a fast downward flick even when short', () => {
    expect(shouldDismissViewer(30, 900, height)).toBe(true);
    expect(shouldDismissViewer(30, 700, height)).toBe(false);
  });

  it('never dismisses when dragged up', () => {
    expect(shouldDismissViewer(-300, 1200, height)).toBe(false);
    expect(shouldDismissViewer(0, 1200, height)).toBe(false);
  });

  it('scales the content from 1 to 0.9 over half the screen', () => {
    expect(viewerDismissScale(0, height)).toBe(1);
    expect(viewerDismissScale(200, height)).toBeCloseTo(0.95);
    expect(viewerDismissScale(400, height)).toBeCloseTo(0.9);
    expect(viewerDismissScale(800, height)).toBeCloseTo(0.9);
    expect(viewerDismissProgress(-50, height)).toBe(0);
    expect(viewerDismissProgress(50, 0)).toBe(0);
  });
});

describe('pause and auto-advance rules', () => {
  const none = { hold: false, safetyMenu: false, reply: false, appInactive: false };

  it('pauses for any single reason', () => {
    expect(isViewerPlaybackPaused(none)).toBe(false);
    expect(isViewerPlaybackPaused({ ...none, hold: true })).toBe(true);
    expect(isViewerPlaybackPaused({ ...none, safetyMenu: true })).toBe(true);
    expect(isViewerPlaybackPaused({ ...none, reply: true })).toBe(true);
    expect(isViewerPlaybackPaused({ ...none, appInactive: true })).toBe(true);
  });

  it('advances only manually while an assistive technology runs', () => {
    expect(shouldViewerAutoAdvance(true)).toBe(false);
    expect(shouldViewerAutoAdvance(false)).toBe(true);
  });
});
