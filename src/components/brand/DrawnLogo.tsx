import { StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps, useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { tap } from '../../lib/haptics';
import { darkColors } from '../../theme/colors';
import { APP_FONT_FAMILY } from '../../theme/typography';
import { backOut, easeOut, seg } from '../welcome/welcomeMotion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The NiX mark, the brand source of truth: `assets/brand/master/*.svg` and every icon export
 * follow it (see assets/brand/README.md). An N whose right leg is an X on a 1024 grid, one 100 px
 * round stroke. Lengths are the path lengths, for the draw-on dash.
 */
// The N in one pen move: up the stem, then down the diagonal to the far corner. The icon draws
// the diagonal as two overlapping strokes (stem to the centre, fall from inside it); drawn
// separately, the fall spent its first third hidden under the stem and the pen seemed to stall.
const N_STROKE = { d: 'M272 752 L272 272 L752 752', length: 480 + 678.82 };
// Drawn from its bright top end down into the glass, so it starts as a clear stroke.
const RISE = { d: 'M752 272 L272 752', length: 678.82 };
const WORD = ['N', 'i', 'X'] as const;

/**
 * Timeline (fractions of `progress`): the two strokes share 0 → 0.78 in proportion to their
 * lengths (1159 : 679) with a short lift between them; the letters follow.
 */
const N_AT = [0, 0.47] as const;
/** Where the pen turns at the top of the stem (480 of 1159 along the N). */
const N_CORNER = N_AT[1] * (480 / 1158.82);
const RISE_AT = [0.5, 0.78] as const;
const LETTERS_AT = 0.8;
const LETTER_STEP = 0.05;

/** Mostly constant speed with a light ease at both ends, like a hand-drawn line. */
function pen(x: number) {
  'worklet';
  const eased = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  return 0.65 * x + 0.35 * eased;
}

const ink = darkColors;

/**
 * The mark draws itself like a pen writing the N and its X (stem, fall, then the rising
 * stroke across), the accent glow blooms behind it and the wordmark rises letter by letter.
 * `progress` runs 0 → 1; the parent decides the timing.
 */
export function DrawnLogo({
  progress,
  size,
  glowColor,
  inkColor = ink.label,
}: {
  progress: SharedValue<number>;
  size: number;
  glowColor: string;
  /** Stroke and wordmark colour; white on the dark stages, the label colour elsewhere. */
  inkColor?: string;
}) {
  // One pen at a steady pace: each stroke takes time in proportion to its length, with a short
  // lift between strokes, and only a light ease at either end (`pen`), so the long first stroke
  // neither rushes nor the later ones crawl. A stroke stays hidden until its pen-down (a
  // zero-length dash still paints a round cap) and the dash gap is twice the length, so the
  // pattern's next dash never caps the far end.
  const nProps = useAnimatedProps(() => {
    const p = seg(progress.get(), N_AT[0], N_AT[1]);
    return { strokeDashoffset: N_STROKE.length * (1 - pen(p)), strokeOpacity: p > 0 ? 1 : 0 };
  });
  // The rising stroke is glass from the first frame and stays under the other two, as in the icon.
  const riseProps = useAnimatedProps(() => {
    const p = seg(progress.get(), RISE_AT[0], RISE_AT[1]);
    return { strokeDashoffset: RISE.length * (1 - pen(p)), strokeOpacity: p > 0 ? 1 : 0 };
  });
  // Felt as it is written: a tick as the pen touches down, a tap as each stroke lands, a firmer
  // one for the last, and soft taps as the letters drop in.
  useAnimatedReaction(
    () => progress.get(),
    (now, before) => {
      if (before == null || now <= before) return;
      const crossed = (mark: number) => before < mark && now >= mark;
      if (crossed(0.01)) scheduleOnRN(tap, 'soft');
      if (crossed(N_CORNER)) scheduleOnRN(tap, 'light');
      if (crossed(N_AT[1])) scheduleOnRN(tap, 'light');
      if (crossed(RISE_AT[1])) scheduleOnRN(tap, 'heavy');
      for (let index = 0; index < WORD.length; index += 1) {
        if (crossed(LETTERS_AT + index * LETTER_STEP + 0.03)) scheduleOnRN(tap, 'soft');
      }
    },
  );
  // A small settle once the last stroke lands.
  const markStyle = useAnimatedStyle(() => {
    const settle = seg(progress.get(), RISE_AT[1], RISE_AT[1] + 0.1);
    return { transform: [{ scale: settle > 0 ? 0.94 + 0.06 * backOut(settle) : 1 }] };
  });
  const glowStyle = useAnimatedStyle(() => {
    const bloom = easeOut(seg(progress.get(), RISE_AT[0] + 0.1, RISE_AT[1] + 0.12));
    return { opacity: bloom * 0.9, transform: [{ scale: 0.6 + 0.4 * bloom }] };
  });

  const glowSize = size * 2.6;
  return (
    <View style={styles.root} pointerEvents="none">
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[styles.glow, { width: glowSize, height: glowSize }, glowStyle]}>
          <Svg width={glowSize} height={glowSize}>
            <Defs>
              <RadialGradient id="logoGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={glowColor} stopOpacity={0.7} />
                <Stop offset="0.5" stopColor={glowColor} stopOpacity={0.18} />
                <Stop offset="1" stopColor={glowColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={glowSize} height={glowSize} fill="url(#logoGlow)" />
          </Svg>
        </Animated.View>
        <Animated.View style={markStyle}>
          <Svg width={size} height={size} viewBox="0 0 1024 1024">
            <Defs>
              {/* The rising stroke is a little translucent, as in the icon: it reads as glass. */}
              <LinearGradient id="rise" x1="272" y1="752" x2="752" y2="272" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={inkColor} stopOpacity={0.55} />
                <Stop offset="1" stopColor={inkColor} stopOpacity={0.92} />
              </LinearGradient>
            </Defs>
            <G fill="none" strokeWidth={100} strokeLinecap="round" strokeLinejoin="round">
              <AnimatedPath
                d={RISE.d}
                stroke="url(#rise)"
                strokeDasharray={`${RISE.length} ${RISE.length * 2}`}
                animatedProps={riseProps}
              />
              <AnimatedPath
                d={N_STROKE.d}
                stroke={inkColor}
                strokeDasharray={`${N_STROKE.length} ${N_STROKE.length * 2}`}
                animatedProps={nProps}
              />
            </G>
          </Svg>
        </Animated.View>
      </View>
      <View style={styles.word}>
        {WORD.map((letter, index) => (
          <WordLetter key={letter} letter={letter} index={index} progress={progress} size={size} color={inkColor} />
        ))}
      </View>
    </View>
  );
}

function WordLetter({
  letter,
  index,
  progress,
  size,
  color,
}: {
  letter: string;
  index: number;
  progress: SharedValue<number>;
  size: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const p = seg(progress.get(), LETTERS_AT + index * LETTER_STEP, LETTERS_AT + index * LETTER_STEP + 0.12);
    return {
      opacity: easeOut(p),
      transform: [{ translateY: (1 - easeOut(p)) * 22 }, { scale: 0.85 + 0.15 * backOut(p) }],
    };
  });
  return (
    <Animated.Text style={[styles.letter, { fontSize: size * 0.36, color }, style]}>{letter}</Animated.Text>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
  },
  word: {
    flexDirection: 'row',
    marginTop: 18,
  },
  letter: {
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
