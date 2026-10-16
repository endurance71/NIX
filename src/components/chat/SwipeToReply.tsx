import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SymbolView } from 'expo-symbols';
import { useAppTheme } from '../../hooks/useAppTheme';
import { tap } from '../../lib/haptics';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { appleUiSpring } from '../../theme/motion';

/** Drag distance that arms the reply (one light tap when crossed). */
const REPLY_THRESHOLD = 56;
/** Past the threshold the bubble follows the finger at a quarter of the speed, up to this. */
const MAX_TRAVEL = 84;
const ICON_SLOT = 30;
const ACTIVATION_PX = 16;

function travelFor(dx: number) {
  'worklet';
  const raw = Math.max(0, dx);
  const resisted = raw <= REPLY_THRESHOLD ? raw : REPLY_THRESHOLD + (raw - REPLY_THRESHOLD) * 0.25;
  return Math.min(resisted, MAX_TRAVEL);
}

/**
 * Swipe a bubble to the right to answer it (iMessage / WhatsApp). The reply arrow waits behind
 * the bubble's leading edge and fades in as the bubble slides; releasing past the threshold
 * replies, anything shorter springs back. Only rightward horizontal drags start it, so vertical
 * scrolling, the interactive keyboard dismiss and long press keep working.
 *
 * VoiceOver users get „Odpowiedz” in the bubble's rotor instead.
 */
export function SwipeToReply({
  enabled,
  onReply,
  style,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  const travel = useSharedValue(0);
  const armed = useSharedValue(false);

  const pan = usePanGesture({
    enabled,
    activeOffsetX: ACTIVATION_PX,
    failOffsetX: -12,
    failOffsetY: [-12, 12],
    onUpdate: (event) => {
      'worklet';
      travel.set(travelFor(event.translationX));
      const nowArmed = event.translationX >= REPLY_THRESHOLD;
      if (nowArmed === armed.get()) return;
      armed.set(nowArmed);
      if (nowArmed) scheduleOnRN(tap, 'light');
    },
    onDeactivate: () => {
      'worklet';
      if (armed.get()) scheduleOnRN(onReply);
    },
    onFinalize: () => {
      'worklet';
      armed.set(false);
      travel.set(withSpring(0, appleUiSpring));
    },
  });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: travel.get() }],
  }));
  const iconStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, travel.get() / REPLY_THRESHOLD);
    return {
      opacity: progress,
      transform: [{ scale: interpolate(progress, [0, 1], [0.5, 1]) }],
    };
  });

  return (
    <View style={style}>
      <Animated.View
        pointerEvents="none"
        style={[styles.icon, { backgroundColor: colors.secondarySystemFill }, iconStyle]}>
        <SymbolView
          name={resolveAppIconName('reply')}
          size={APP_ICON_SIZE.sm}
          tintColor={colors.secondaryLabel}
          weight="semibold"
        />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={contentStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -ICON_SLOT / 2,
    width: ICON_SLOT,
    height: ICON_SLOT,
    borderRadius: ICON_SLOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
