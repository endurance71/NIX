import { useEffect } from 'react';
import { Easing, interpolateColor, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * A colour that eases to each new value instead of jumping (the accent picked during set-up
 * recolours the stage live). Mid-way changes start from the colour on screen.
 */
export function useAnimatedColor(color: string, duration = 420) {
  const from = useSharedValue(color);
  const to = useSharedValue(color);
  const progress = useSharedValue(1);

  useEffect(() => {
    if (to.get() === color) return;
    from.set(interpolateColor(progress.get(), [0, 1], [from.get(), to.get()]));
    to.set(color);
    progress.set(0);
    progress.set(withTiming(1, { duration, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
  }, [color, duration, from, progress, to]);

  return useDerivedValue(() => interpolateColor(progress.get(), [0, 1], [from.get(), to.get()]));
}
