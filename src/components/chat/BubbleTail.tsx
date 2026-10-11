import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const TAIL_WIDTH = 24;
const TAIL_HEIGHT = 20;
/** How far the tip sticks out past the bubble edge. */
const TAIL_OUTSET = 6;

/*
 * Drawn BEHIND the bubble (render it before the bubble view): the part overlapping the bubble is
 * hidden by the bubble's own fill. The edge the tail grows from is at x = 18 (right) / x = 6
 * (left), the bubble bottom at y = 20. The side edge runs straight down and flares out into the
 * tip; the bottom edge comes back from the tip with a slight concave dip before it meets the
 * bubble's rounded corner, like iMessage.
 */
const RIGHT_PATH = 'M0 0H18V4C18 12 19.5 17 24 20C19.5 20.4 15.5 19.4 12.6 17.4C10 19 6 20 0 20Z';
const LEFT_PATH = 'M24 0H6V4C6 12 4.5 17 0 20C4.5 20.4 8.5 19.4 11.4 17.4C14 19 18 20 24 20Z';

/** iMessage-style tail on the last bubble of a group; decorative, hidden from VoiceOver. */
export function BubbleTail({ color, side }: { color: string; side: 'left' | 'right' }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tail, side === 'right' ? styles.right : styles.left]}>
      <Svg width={TAIL_WIDTH} height={TAIL_HEIGHT} viewBox={`0 0 ${TAIL_WIDTH} ${TAIL_HEIGHT}`}>
        <Path d={side === 'right' ? RIGHT_PATH : LEFT_PATH} fill={color} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tail: {
    position: 'absolute',
    bottom: 0,
    width: TAIL_WIDTH,
    height: TAIL_HEIGHT,
  },
  right: {
    right: -TAIL_OUTSET,
  },
  left: {
    left: -TAIL_OUTSET,
  },
});
