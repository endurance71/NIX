import { useEffect } from 'react';
import { notify, tap, type ImpactIntensity } from '../../lib/haptics';
import { Easing, cancelAnimation, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/**
 * Motion-graphics timeline for the welcome scenes: one value runs 0 → 1 per cycle on the UI
 * thread, and every element maps its own slice of it (`seg`) through an easing curve. While a
 * page is off screen its timeline rests at 0; with Reduce Motion it holds a single key frame.
 */
export function useSceneTimeline(active: boolean, cycleMs: number, motionEnabled: boolean, keyFrame: number) {
  const t = useSharedValue(motionEnabled ? 0 : keyFrame);
  useEffect(() => {
    if (!motionEnabled) {
      t.set(keyFrame);
      return;
    }
    cancelAnimation(t);
    t.set(0);
    if (!active) return;
    t.set(withRepeat(withTiming(1, { duration: cycleMs, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [active, cycleMs, keyFrame, motionEnabled, t]);
  return t;
}

/** Progress of `t` through [start, end], clamped to 0…1. */
export function seg(t: number, start: number, end: number) {
  'worklet';
  return Math.min(1, Math.max(0, (t - start) / (end - start)));
}

export function easeOut(x: number) {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}

export function easeInOut(x: number) {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Ease-out with a small overshoot, for things that pop in. */
export function backOut(x: number) {
  'worklet';
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Everything fades out at the end of a cycle so the loop restarts from a clean stage. */
export function cycleFade(t: number) {
  'worklet';
  return 1 - seg(t, 0.93, 1);
}

/** In at [a, b] (ease-out, or with an overshoot when `pop`), out with the cycle. */
export function appear(t: number, a: number, b: number, pop = false) {
  'worklet';
  const x = seg(t, a, b);
  return (pop ? backOut(x) : easeOut(x)) * cycleFade(t);
}

/** A haptic on a scene's key moment: an impact, or `success` for a completed action. */
export type SceneBeat = { at: number; feel: ImpactIntensity | 'success' };

/**
 * Plays the scene's haptic beats in step with its first cycle after the page arrives (the user
 * swiped there, so they are feedback, not noise); the looping repeats stay silent.
 */
export function useSceneBeats(active: boolean, cycleMs: number, motionEnabled: boolean, beats: readonly SceneBeat[]) {
  useEffect(() => {
    if (!active || !motionEnabled) return;
    const timers = beats.map((beat) =>
      setTimeout(() => (beat.feel === 'success' ? notify('success') : tap(beat.feel)), beat.at * cycleMs),
    );
    return () => timers.forEach(clearTimeout);
    // `beats` is a module constant per scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cycleMs, motionEnabled]);
}
