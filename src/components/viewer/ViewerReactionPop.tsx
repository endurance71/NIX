import { useEffect, useEffectEvent } from 'react';
import { Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, Keyframe } from 'react-native-reanimated';
import { VIEWER_REACTION_POP_MS } from '../../lib/viewerReactions';
import { MESSAGE_REACTION_GLYPHS } from '../../services/messageReactionService';
import type { MessageReactionEmoji } from '../../types/database.types';
import { duration } from '../../theme/motion';

export type ViewerReactionPopState = { emoji: MessageReactionEmoji; key: number };

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** Pops slightly past full size and settles: the reaction "lands" on the NiX. */
const POP_IN = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.8 }] },
  55: { opacity: 1, transform: [{ scale: 1.12 }], easing: EASE_OUT },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_IN_OUT },
}).duration(320);

/**
 * Short confirmation after reacting to a NiX: a large emoji over the media that fades away.
 * Reduce Motion keeps only the fade. Decorative for VoiceOver (the result is announced).
 */
export function ViewerReactionPop({
  pop,
  motionEnabled,
  onDone,
  layerStyle,
  glyphStyle,
}: {
  pop: ViewerReactionPopState | null;
  motionEnabled: boolean;
  onDone: () => void;
  layerStyle: StyleProp<ViewStyle>;
  glyphStyle: StyleProp<TextStyle>;
}) {
  const popKey = pop?.key ?? null;
  const finish = useEffectEvent(onDone);
  // Each new reaction restarts the hold; re-renders do not.
  useEffect(() => {
    if (popKey === null) return;
    const timer = setTimeout(() => finish(), VIEWER_REACTION_POP_MS);
    return () => clearTimeout(timer);
  }, [popKey]);

  if (!pop) return null;
  return (
    <Animated.View
      key={pop.key}
      style={layerStyle}
      entering={motionEnabled ? POP_IN : FadeIn.duration(duration.fast)}
      exiting={FadeOut.duration(motionEnabled ? duration.medium : duration.fast)}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={glyphStyle} allowFontScaling={false}>
        {MESSAGE_REACTION_GLYPHS[pop.emoji]}
      </Text>
    </Animated.View>
  );
}
