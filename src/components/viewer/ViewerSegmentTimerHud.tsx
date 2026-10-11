import { View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

type ViewerTimerHudStyles = {
  hud: ViewStyle;
  segmentTrack: ViewStyle;
  segmentFillDone: ViewStyle;
  segmentFillActive: ViewStyle;
};

type ViewerTimerQueueItem = { id: string };

type Props = {
  queue: ViewerTimerQueueItem[];
  slideIndex: number;
  topOffset: number;
  styles: ViewerTimerHudStyles;
  activeSegmentFillStyle: AnimatedStyle<ViewStyle>;
  /** "NiX 2 z 5". */
  accessibilityValueText: string;
};

/** Thin Stories-style segment bars; hidden for a single NiX (nothing to navigate). */
export function ViewerSegmentTimerHud({
  queue,
  slideIndex,
  topOffset,
  styles,
  activeSegmentFillStyle,
  accessibilityValueText,
}: Props) {
  if (queue.length <= 1) return null;
  return (
    <View
      style={[styles.hud, { top: topOffset }]}
      pointerEvents="none"
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ text: accessibilityValueText }}>
      {queue.map((nix, segIndex) => {
        const isDone = segIndex < slideIndex;
        const isActive = segIndex === slideIndex;
        return (
          <View key={nix.id} style={styles.segmentTrack}>
            {isDone ? <View style={styles.segmentFillDone} /> : null}
            {isActive ? <Animated.View style={[styles.segmentFillActive, activeSegmentFillStyle]} /> : null}
          </View>
        );
      })}
    </View>
  );
}
