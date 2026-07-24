import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { pressScaleTo, useMotionEnabled } from '../../theme/motion';

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Wyłącz scale (np. gdy rodzic obsługuje glass inaczej). */
  disableScale?: boolean;
};

/**
 * Pressable z natywnym scale feedback (bez shared-value mutation / GestureDetector).
 * Przy Reduce Motion — bez transform.
 */
export function PressableScale({
  children,
  style,
  disabled,
  disableScale,
  ...rest
}: PressableScaleProps) {
  const motionEnabled = useMotionEnabled();
  const useScale = motionEnabled && !disableScale && !disabled;

  return (
    <Pressable
      disabled={disabled}
      style={(state) => [style, useScale && state.pressed ? { transform: [{ scale: pressScaleTo }] } : null]}
      {...rest}>
      {children}
    </Pressable>
  );
}
