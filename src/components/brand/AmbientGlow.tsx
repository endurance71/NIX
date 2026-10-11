import { useEffect } from 'react';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

/**
 * A soft glow of the accent colour behind the scenes: it breathes slowly and drifts against the
 * swipe, so the backdrop has depth without competing with the scene.
 */
export function AmbientGlow({
  color,
  width,
  height,
  scrollX,
  motionEnabled,
  centerY = 0.32,
  intensity = 1,
}: {
  color: string;
  width: number;
  height: number;
  /** Horizontal scroll to drift against; omit for a still stage. */
  scrollX?: SharedValue<number>;
  motionEnabled: boolean;
  /** Vertical centre of the glow, as a fraction of `height`. */
  centerY?: number;
  /** Peak strength; lower on light backgrounds, where a full glow reads as a stain. */
  intensity?: number;
}) {
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!motionEnabled) return;
    breath.set(withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(breath);
  }, [breath, motionEnabled]);
  const size = width * 1.6;
  const style = useAnimatedStyle(() => {
    const drift = scrollX ? Math.sin((scrollX.get() / Math.max(1, width)) * Math.PI * 0.5) * width * 0.18 : 0;
    return {
      opacity: (0.55 + breath.get() * 0.25) * intensity,
      transform: [{ translateX: -drift }, { scale: 1 + breath.get() * 0.08 }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.glow, { width: size, height: size, left: (width - size) / 2, top: height * centerY - size / 2 }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="welcomeGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0.12} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill="url(#welcomeGlow)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
  },
});
