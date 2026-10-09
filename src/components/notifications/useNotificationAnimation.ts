import { useCallback, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { cancelAnimation, ReduceMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { appNotificationQueue, type NotificationSnapshot, type NotificationToken } from '../../lib/notificationQueue';
import { presentAppNotification } from '../../lib/notificationFeedback';
import {
  COLLAPSE_SPRING, DROP_SPRING, EXPAND_SPRING, FADE_SPRING, RETURN_SPRING,
  REVEAL_SPRING, TINT_SPRING, ENTER_TINT_DELAY, ENTER_EXPAND_DELAY,
  ENTER_REVEAL_DELAY, EXIT_COLLAPSE_DELAY, EXIT_DROP_DELAY,
} from './vendor/timeline';

export function useNotificationAnimation(snapshot: NotificationSnapshot, reducedMotion: boolean, morph: boolean, screenReader: boolean, surfaceReady: boolean) {
  const drop = useSharedValue(0);
  const expand = useSharedValue(0);
  const reveal = useSharedValue(0);
  const tint = useSharedValue(0);
  const dragY = useSharedValue(0);
  const { notification, phase, generation } = snapshot;
  const id = notification?.id;

  const presented = useCallback((token: NotificationToken) => {
    presentAppNotification(token, screenReader ? (message) => {
      AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    } : undefined);
  }, [screenReader]);

  useEffect(() => {
    if (!id || phase === 'visible' || !surfaceReady) return;
    const token = { id, generation };
    const short = reducedMotion || !morph;
    cancelAnimation(drop);
    cancelAnimation(expand);
    cancelAnimation(reveal);
    cancelAnimation(tint);

    if (phase === 'entering') {
      drop.value = short ? 1 : 0;
      expand.value = short ? 1 : 0;
      tint.value = short ? 1 : 0;
      reveal.value = 0;
      dragY.value = 0;
      if (!short) {
        drop.value = withSpring(1, DROP_SPRING);
        tint.value = withDelay(ENTER_TINT_DELAY, withSpring(1, TINT_SPRING));
        expand.value = withDelay(ENTER_EXPAND_DELAY, withSpring(1, EXPAND_SPRING));
      }
      const onPresented = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(presented, token);
      };
      reveal.value = short
        ? withTiming(1, { duration: reducedMotion ? 120 : 180, reduceMotion: ReduceMotion.Never }, onPresented)
        : withDelay(ENTER_REVEAL_DELAY, withSpring(1, REVEAL_SPRING, onPresented));
    } else if (phase === 'exiting') {
      const settle = appNotificationQueue.finishDismiss;
      reveal.value = short
        ? withTiming(0, { duration: 120, reduceMotion: ReduceMotion.Never })
        : withSpring(0, FADE_SPRING);
      if (short) {
        expand.value = withTiming(0, { duration: 120, reduceMotion: ReduceMotion.Never }, (finished) => {
          if (finished) scheduleOnRN(settle, token);
        });
      } else {
        expand.value = withDelay(EXIT_COLLAPSE_DELAY, withSpring(0, COLLAPSE_SPRING));
        tint.value = withDelay(EXIT_DROP_DELAY, withSpring(0, RETURN_SPRING));
        drop.value = withDelay(EXIT_DROP_DELAY, withSpring(0, RETURN_SPRING, (finished) => {
          if (finished) scheduleOnRN(settle, token);
        }));
      }
    }
  }, [id, phase, generation, reducedMotion, morph, screenReader, surfaceReady, presented, drop, expand, reveal, tint, dragY]);

  useEffect(() => () => {
    [drop, expand, reveal, tint, dragY].forEach(cancelAnimation);
  }, [drop, expand, reveal, tint, dragY]);

  return { drop, expand, reveal, tint, dragY };
}
