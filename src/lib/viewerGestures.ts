/**
 * Pure viewer interaction rules (Stories-style): tap zones, the pausable photo timer and the
 * swipe-down dismiss threshold. Worklet-safe where the gesture handlers call them on the UI thread.
 */

/** The left third restarts the current slide; the rest advances (Instagram / Snapchat). */
const VIEWER_BACK_ZONE_FRACTION = 1 / 3;
/** Hold this long to pause (shorter is a tap). */
export const VIEWER_HOLD_TO_PAUSE_MS = 200;
/** Swipe-down closes past this share of the screen height… */
const VIEWER_DISMISS_DISTANCE_FRACTION = 0.25;
/** …or when flicked down faster than this (pt/s). */
const VIEWER_DISMISS_VELOCITY = 800;
/** Content scale at the full drag distance. */
const VIEWER_DISMISS_MIN_SCALE = 0.9;

export type ViewerTapZone = 'back' | 'next';

export function resolveViewerTapZone(x: number, width: number): ViewerTapZone {
  'worklet';
  if (!(width > 0)) return 'next';
  return x < width * VIEWER_BACK_ZONE_FRACTION ? 'back' : 'next';
}

export function shouldDismissViewer(translationY: number, velocityY: number, height: number): boolean {
  'worklet';
  if (translationY <= 0) return false;
  return translationY > height * VIEWER_DISMISS_DISTANCE_FRACTION || velocityY > VIEWER_DISMISS_VELOCITY;
}

/** 0 → 1 as the content is dragged down by half the screen. */
export function viewerDismissProgress(translationY: number, height: number): number {
  'worklet';
  if (!(height > 0) || translationY <= 0) return 0;
  return Math.min(1, translationY / (height * 0.5));
}

export function viewerDismissScale(translationY: number, height: number): number {
  'worklet';
  return 1 - (1 - VIEWER_DISMISS_MIN_SCALE) * viewerDismissProgress(translationY, height);
}

/**
 * Photo slide timer that can pause and resume from where it stopped (hold-to-pause, safety menu,
 * reply field, app inactive) instead of restarting from zero.
 */
export type ViewerPhotoTimer = {
  slideId: string;
  totalMs: number;
  remainingMs: number;
};

export function createViewerPhotoTimer(slideId: string, totalMs: number): ViewerPhotoTimer {
  const total = Math.max(0, totalMs);
  return { slideId, totalMs: total, remainingMs: total };
}

/** The timer after it ran for `elapsedMs`; never below zero. */
export function consumeViewerPhotoTimer(timer: ViewerPhotoTimer, elapsedMs: number): ViewerPhotoTimer {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return { ...timer, remainingMs: Math.max(0, timer.remainingMs - elapsed) };
}

/** Segment progress as the HUD expects it: 1 = nothing watched yet, 0 = finished. */
export function viewerPhotoTimerProgress(timer: ViewerPhotoTimer): number {
  if (timer.totalMs <= 0) return 0;
  return Math.min(1, Math.max(0, timer.remainingMs / timer.totalMs));
}

/** Photo slide length; `view_duration_sec === 0` means "until the user moves on". */
export function viewerPhotoSlideMs(viewDurationSec: number | null | undefined): number | null {
  if (viewDurationSec === 0) return null;
  return Math.max(1000, (viewDurationSec ?? 5) * 1000);
}

type ViewerPauseReasons = {
  hold: boolean;
  safetyMenu: boolean;
  reply: boolean;
  appInactive: boolean;
};

export function isViewerPlaybackPaused(reasons: ViewerPauseReasons): boolean {
  return reasons.hold || reasons.safetyMenu || reasons.reply || reasons.appInactive;
}

/**
 * VoiceOver / Switch Control users advance manually (WCAG 2.2.1): a slide must never be
 * consumed before it could be heard.
 */
export function shouldViewerAutoAdvance(assistiveTechnologyRunning: boolean): boolean {
  return !assistiveTechnologyRunning;
}
