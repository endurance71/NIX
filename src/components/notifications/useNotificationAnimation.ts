import { useCallback, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  cancelAnimation, Easing, ReduceMotion, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { appNotificationQueue, type NotificationSnapshot, type NotificationToken } from '../../lib/notificationQueue';
import { presentAppNotification } from '../../lib/notificationFeedback';
import {
  CARD_ENTER_MS, CARD_EXIT_MS, CARD_REDUCED_MOTION_MS,
  COLLAPSE_SPRING, DROP_SPRING, EXPAND_SPRING, FADE_SPRING, RETURN_SPRING,
  REVEAL_SPRING, TINT_SPRING, ENTER_TINT_DELAY, ENTER_EXPAND_DELAY,
  ENTER_REVEAL_DELAY, EXIT_COLLAPSE_DELAY, EXIT_DROP_DELAY,
} from './vendor/timeline';

// Strong ease-out: the card is legible after ~40% of the duration.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * `morph` = the rare island sequence (upstream springs). Everything else is the fast card:
 * `reveal` 0→1 in CARD_ENTER_MS, 1→0 in CARD_EXIT_MS; Reduce Motion is a CARD_REDUCED_MOTION_MS fade.
 * An interrupted exit (an error pre-empting the card) always takes the fast path, morph included.
 */
export function useNotificationAnimation(snapshot: NotificationSnapshot, reducedMotion: boolean, morph: boolean, screenReader: boolean, surfaceReady: boolean) {
  const drop = useSharedValue(0);
  const expand = useSharedValue(0);
  const reveal = useSharedValue(0);
  const tint = useSharedValue(0);
  const dragY = useSharedValue(0);
  const { notification, phase, generation, interrupted } = snapshot;
  const id = notification?.id;

  const presented = useCallback((token: NotificationToken) => {
    presentAppNotification(token, screenReader ? (message) => {
      AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    } : undefined);
  }, [screenReader]);

  useEffect(() => {
    if (!id || phase === 'visible' || !surfaceReady) return;
    const token = { id, generation };
    const island = morph && !reducedMotion;
    const timing = (duration: number, easing = !reducedMotion) => ({
      duration, reduceMotion: ReduceMotion.Never, ...(easing ? { easing: EASE_OUT } : null),
    });
    cancelAnimation(drop);
    cancelAnimation(expand);
    cancelAnimation(reveal);
    cancelAnimation(tint);

    if (phase === 'entering') {
      drop.value = island ? 0 : 1;
      expand.value = island ? 0 : 1;
      tint.value = island ? 0 : 1;
      reveal.value = 0;
      dragY.value = 0;
      const onPresented = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(presented, token);
      };
      if (island) {
        drop.value = withSpring(1, DROP_SPRING);
        tint.value = withDelay(ENTER_TINT_DELAY, withSpring(1, TINT_SPRING));
        expand.value = withDelay(ENTER_EXPAND_DELAY, withSpring(1, EXPAND_SPRING));
        reveal.value = withDelay(ENTER_REVEAL_DELAY, withSpring(1, REVEAL_SPRING, onPresented));
      } else {
        reveal.value = withTiming(1, timing(reducedMotion ? CARD_REDUCED_MOTION_MS : CARD_ENTER_MS), onPresented);
      }
    } else if (phase === 'exiting') {
      const settle = appNotificationQueue.finishDismiss;
      const onSettled = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(settle, token);
      };
      if (island && !interrupted) {
        reveal.value = withSpring(0, FADE_SPRING);
        expand.value = withDelay(EXIT_COLLAPSE_DELAY, withSpring(0, COLLAPSE_SPRING));
        tint.value = withDelay(EXIT_DROP_DELAY, withSpring(0, RETURN_SPRING));
        drop.value = withDelay(EXIT_DROP_DELAY, withSpring(0, RETURN_SPRING, onSettled));
      } else {
        const duration = reducedMotion ? CARD_REDUCED_MOTION_MS : CARD_EXIT_MS;
        if (island) {
          // Interrupted morph: retract the droplet together with the fading content.
          drop.value = withTiming(0, timing(duration));
          expand.value = withTiming(0, timing(duration));
          tint.value = withTiming(0, timing(duration));
        }
        reveal.value = withTiming(0, timing(duration), onSettled);
      }
    }
  }, [id, phase, generation, interrupted, reducedMotion, morph, screenReader, surfaceReady, presented, drop, expand, reveal, tint, dragY]);

  useEffect(() => () => {
    [drop, expand, reveal, tint, dragY].forEach(cancelAnimation);
  }, [drop, expand, reveal, tint, dragY]);

  return { drop, expand, reveal, tint, dragY };
}
