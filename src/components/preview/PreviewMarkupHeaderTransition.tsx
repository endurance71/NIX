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
      {/* In flow (not absolute) so the vertical tool column sets the header height; box-none so
          the empty area between the clusters still reaches the media and stickers below. */}
      <Animated.View
        style={[styles.normalLayer, normalStyle]}
        pointerEvents={normalHidden ? 'none' : 'box-none'}
        accessibilityElementsHidden={normalHidden}
        importantForAccessibility={normalHidden ? 'no-hide-descendants' : 'auto'}>
        {normalHeader}
      </Animated.View>
      <Animated.View
        style={[styles.drawingLayer, drawingStyle]}
        pointerEvents={drawingHidden ? 'none' : 'auto'}
        accessibilityElementsHidden={drawingHidden}
        importantForAccessibility={drawingHidden ? 'no-hide-descendants' : 'auto'}>
        {drawingHeader}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawingLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  container: {
    alignSelf: 'stretch',
    minHeight: 48,
  },
  normalLayer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
});
