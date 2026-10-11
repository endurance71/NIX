import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { duration } from '../../theme/motion';
import {
  VIEWER_HOLD_TO_PAUSE_MS,
  resolveViewerTapZone,
  shouldDismissViewer,
  viewerDismissProgress,
  viewerDismissScale,
  type ViewerTapZone,
} from '../../lib/viewerGestures';

type Params = {
  width: number;
  height: number;
  motionEnabled: boolean;
  /** Tap zones and hold-to-pause (only once the slide is on screen). */
  tapEnabled: boolean;
  /** Swipe-down to dismiss. */
  panEnabled: boolean;
  onTapZone: (zone: ViewerTapZone) => void;
  onHoldChange: (held: boolean) => void;
  onDismiss: () => void;
};

/**
 * Stories gestures on the UI thread: tap left/right, hold to pause (chrome fades out), swipe down
 * to close. Pan wins over both taps once the finger moves 10 pt down; a hold wins over the tap.
 */
export function useViewerGestures({
  width,
  height,
  motionEnabled,
  tapEnabled,
  panEnabled,
  onTapZone,
  onHoldChange,
  onDismiss,
}: Params) {
  const dragY = useSharedValue(0);
  const chromeOpacity = useSharedValue(1);

  const gesture = useMemo(() => {
    const fadeChrome = (to: number) => {
      'worklet';
      // Reduce Motion: the chrome hides and returns instantly.
      chromeOpacity.set(motionEnabled ? withTiming(to, { duration: duration.fast }) : to);
    };

    const hold = Gesture.LongPress()
      .enabled(tapEnabled)
      .minDuration(VIEWER_HOLD_TO_PAUSE_MS)
      .maxDistance(12)
      .onStart(() => {
        fadeChrome(0);
        scheduleOnRN(onHoldChange, true);
      })
      .onFinalize((_event, success) => {
        if (!success) return;
        fadeChrome(1);
        scheduleOnRN(onHoldChange, false);
      });

    const tap = Gesture.Tap()
      .enabled(tapEnabled)
      .onEnd((event, success) => {
        if (!success) return;
        scheduleOnRN(onTapZone, resolveViewerTapZone(event.x, width));
      });

    const settle = (velocityY: number) => {
      'worklet';
      dragY.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: velocityY }));
    };

    const pan = Gesture.Pan()
      .enabled(panEnabled)
      // Down only; a horizontal swipe is left to the system.
      .activeOffsetY(10)
      .failOffsetX([-10, 10])
      .onUpdate((event) => {
        dragY.set(Math.max(0, event.translationY));
      })
      .onEnd((event, success) => {
        if (!success) return;
        if (shouldDismissViewer(event.translationY, event.velocityY, height)) {
          if (motionEnabled) {
            dragY.set(
              withSpring(height, {
                duration: 300,
                dampingRatio: 1,
                velocity: event.velocityY,
                overshootClamping: true,
              }),
            );
          }
          scheduleOnRN(onDismiss);
          return;
        }
        settle(event.velocityY);
      })
      .onFinalize((_event, success) => {
        if (!success) settle(0);
      });

    return Gesture.Race(pan, Gesture.Exclusive(hold, tap));
  }, [
    chromeOpacity,
    dragY,
    height,
    motionEnabled,
    onDismiss,
    onHoldChange,
    onTapZone,
    panEnabled,
    tapEnabled,
    width,
  ]);

  /** Follows the finger and shrinks to 0.9; with Reduce Motion it only fades. */
  const stageStyle = useAnimatedStyle<ViewStyle>(() => {
    const y = dragY.get();
    const progress = viewerDismissProgress(y, height);
    if (!motionEnabled) return { opacity: 1 - progress * 0.6 };
    return {
      transform: [{ translateY: y }, { scale: viewerDismissScale(y, height) }],
      borderRadius: progress * 32,
    };
  });

  /** The cinema backdrop dims away, revealing the screen under the viewer. */
  const backdropStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: 1 - viewerDismissProgress(dragY.get(), height),
  }));

  const chromeStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: chromeOpacity.get(),
  }));

  return {
    gesture,
    stageStyle: stageStyle as AnimatedStyle<ViewStyle>,
    backdropStyle: backdropStyle as AnimatedStyle<ViewStyle>,
    chromeStyle: chromeStyle as AnimatedStyle<ViewStyle>,
  };
}
