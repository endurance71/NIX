/**
 * Video segment progress runs as a linear `withTiming` on the UI thread instead of a JS event per
 * frame. Sparse `timeUpdate` events only correct the animation when it drifts from the player.
 */
export const VIEWER_VIDEO_PROGRESS_SYNC_SEC = 0.5;
/** ≈ 2% of the segment; smaller drift is invisible in an 8 pt track. */
export const VIEWER_VIDEO_PROGRESS_DRIFT = 0.02;

export type LinearProgressAnimation = {
  fromProgress: number;
  startedAtMs: number;
  durationMs: number;
};

/** Remaining fraction (1 → 0) or null while the duration is unknown. */
export function remainingVideoProgress(currentTime: number, duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return null;
  return Math.max(0, Math.min(1, 1 - currentTime / duration));
}

/** Wall-clock time for the remaining fraction to reach 0 at the given playback rate. */
export function remainingVideoProgressMs(progress: number, duration: number, playbackRate = 1): number {
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  return Math.max(0, (progress * duration * 1000) / rate);
}

/** Where the linear UI-thread animation is now, computed on JS without reading the shared value. */
export function projectLinearProgress(animation: LinearProgressAnimation, nowMs: number): number {
  if (animation.durationMs <= 0) return 0;
  const elapsed = Math.max(0, nowMs - animation.startedAtMs);
  return animation.fromProgress * Math.max(0, 1 - elapsed / animation.durationMs);
}

export function shouldResyncVideoProgress(
  animation: LinearProgressAnimation | null,
  actualProgress: number,
  nowMs: number,
  tolerance = VIEWER_VIDEO_PROGRESS_DRIFT,
): boolean {
  if (!animation) return true;
  return Math.abs(projectLinearProgress(animation, nowMs) - actualProgress) > tolerance;
}
