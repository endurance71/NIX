import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { pressScaleTo, pressSpring, useMotionEnabled } from '../../theme/motion';

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Wyłącz scale (np. gdy rodzic obsługuje glass inaczej). */
  disableScale?: boolean;
};

/**
 * Pressable z lekkim spring scale na UI thread.
 * Przy Reduce Motion — zwykły Pressable bez transform.
 */
export function PressableScale({
  children,
  style,
  disabled,
  disableScale,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const motionEnabled = useMotionEnabled();
  const scale = useSharedValue(1);
  const useScale = motionEnabled && !disableScale && !disabled;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!useScale) {
    return (
      <Pressable style={style} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut} {...rest}>
        {children}
      </Pressable>
    );
  }

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(event) => {
        scale.set(withSpring(pressScaleTo, pressSpring));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withSpring(1, pressSpring));
        onPressOut?.(event);
      }}
      {...rest}>
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
