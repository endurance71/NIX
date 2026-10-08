import { useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { appNotificationQueue, type NotificationToken } from '../../lib/notificationQueue';

export function useNotificationGesture(token: NotificationToken, dragY: SharedValue<number>, canSwipe: boolean) {
  const { id, generation } = token;
  const dismiss = useCallback(() => {
    appNotificationQueue.dismiss({ id, generation });
  }, [id, generation]);
  const press = useCallback(() => {
    const snapshot = appNotificationQueue.getSnapshot();
    if (snapshot.generation !== generation || snapshot.notification?.id !== id) return;
    if (!appNotificationQueue.dismiss({ id, generation })) return;
    snapshot.notification.onPress?.();
  }, [id, generation]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().enabled(canSwipe)
      .activeOffsetY([-10, 10]).failOffsetX([-18, 18])
      .onChange((event) => { dragY.set((value) => Math.max(-120, Math.min(24, value + event.changeY))); })
      .onEnd((event, success) => {
        if (!success) return;
        if (dragY.get() < -24 || event.velocityY < -420) scheduleOnRN(dismiss);
        else dragY.set(withSpring(0, { duration: 280, dampingRatio: 1 }));
      })
      .onFinalize((_event, success) => {
        if (!success) dragY.set(withSpring(0, { duration: 280, dampingRatio: 1 }));
      });
    const tap = Gesture.Tap().onEnd((_event, success) => {
      if (success) scheduleOnRN(press);
    });
    return Gesture.Exclusive(pan, tap);
  }, [canSwipe, dragY, dismiss, press]);
  return { gesture, dismiss, press };
}
