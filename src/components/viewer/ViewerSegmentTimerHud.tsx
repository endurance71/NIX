import { View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

type ViewerTimerHudStyles = {
  timerHudShell: ViewStyle;
  timerBlur: ViewStyle;
  timerHudInner: ViewStyle;
  segmentsRow: ViewStyle;
  segmentCell: ViewStyle;
  timerTrack: ViewStyle;
  segmentFill: ViewStyle;
  segmentFillDone: ViewStyle;
  segmentProgressMask: ViewStyle;
};

type ViewerTimerQueueItem = { id: string };

type Props = {
  queue: ViewerTimerQueueItem[];
  slideIndex: number;
  topOffset: number;
  isDark: boolean;
  styles: ViewerTimerHudStyles;
  activeSegmentMaskStyle: AnimatedStyle<ViewStyle>;
};

export function ViewerSegmentTimerHud({
  queue,
  slideIndex,
  topOffset,
  isDark,
  styles,
  activeSegmentMaskStyle,
}: Props) {
  return (
    <View style={[styles.timerHudShell, { top: topOffset }]}>
      <BlurView intensity={isDark ? 72 : 58} tint={isDark ? 'dark' : 'light'} style={styles.timerBlur} />
      <View style={styles.timerHudInner}>
        <View style={styles.segmentsRow}>
          {queue.map((nix, segIndex) => {
            const isDone = segIndex < slideIndex;
            const isActive = segIndex === slideIndex;
            return (
              <View key={nix.id} style={styles.segmentCell}>
                <View style={styles.timerTrack}>
                  {isDone ? (
                    <View style={styles.segmentFillDone} />
                  ) : isActive ? (
                    <>
                      <View style={styles.segmentFill} />
                      <Animated.View
                        style={[styles.segmentProgressMask, activeSegmentMaskStyle]}
                        pointerEvents="none"
                      />
                    </>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
