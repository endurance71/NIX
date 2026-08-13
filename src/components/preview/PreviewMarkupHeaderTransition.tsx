import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { duration, useMotionEnabled } from '../../theme/motion';

type PreviewMarkupHeaderTransitionProps = {
  isDrawing: boolean;
  isTextEditing: boolean;
  normalHeader: ReactNode;
  drawingHeader: ReactNode;
};

export function PreviewMarkupHeaderTransition({
  isDrawing,
  isTextEditing,
  normalHeader,
  drawingHeader,
}: PreviewMarkupHeaderTransitionProps) {
  const motionEnabled = useMotionEnabled();
  const progress = useSharedValue(isDrawing ? 1 : 0);

  useEffect(() => {
    progress.set(
      withTiming(isDrawing ? 1 : 0, {
        duration: motionEnabled ? duration.medium : duration.fast,
        easing: Easing.inOut(Easing.cubic),
      })
    );
  }, [isDrawing, motionEnabled, progress]);

  const normalStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
  }));
  const drawingStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
  }));

  const normalHidden = isDrawing || isTextEditing;
  const drawingHidden = !isDrawing;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View
        style={[styles.layer, normalStyle]}
        pointerEvents={normalHidden ? 'none' : 'auto'}
        accessibilityElementsHidden={normalHidden}
        importantForAccessibility={normalHidden ? 'no-hide-descendants' : 'auto'}>
        {normalHeader}
      </Animated.View>
      <Animated.View
        style={[styles.layer, drawingStyle]}
        pointerEvents={drawingHidden ? 'none' : 'auto'}
        accessibilityElementsHidden={drawingHidden}
        importantForAccessibility={drawingHidden ? 'no-hide-descendants' : 'auto'}>
        {drawingHeader}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    height: 48,
  },
  layer: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
