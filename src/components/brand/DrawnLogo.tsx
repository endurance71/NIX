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
const STEM = { d: 'M272 752 L272 272 L512 512', length: 480 + 339.41 };
const FALL = { d: 'M388 388 L752 752', length: 514.77 };
// Drawn from its bright top end down into the glass, so it starts as a clear stroke.
const RISE = { d: 'M752 272 L272 752', length: 678.82 };
const WORD = ['N', 'i', 'X'] as const;

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
  // A stroke stays hidden until its pen-down: a zero-length dash still paints the round cap.
  // The dash gap is twice the length, so the pattern's next dash never caps the far end. Each
  // stroke leaves fast and lands softly (ease-out): no lingering pen-down dot.
  const stemProps = useAnimatedProps(() => {
    const p = seg(progress.get(), 0, 0.36);
    return { strokeDashoffset: STEM.length * (1 - easeOut(p)), strokeOpacity: p > 0 ? 1 : 0 };
  });
  const fallProps = useAnimatedProps(() => {
    const p = seg(progress.get(), 0.28, 0.52);
    return { strokeDashoffset: FALL.length * (1 - easeOut(p)), strokeOpacity: p > 0 ? 1 : 0 };
  });
  // The rising stroke is glass from the first frame and stays under the other two, as in the icon.
  const riseProps = useAnimatedProps(() => {
    const p = seg(progress.get(), 0.44, 0.74);
    return { strokeDashoffset: RISE.length * (1 - easeOut(p)), strokeOpacity: p > 0 ? 1 : 0 };
  });
  // Felt as it is written: a tick as the pen touches down, a tap as each stroke lands, a firmer
  // one for the last, and soft taps as the letters drop in.
  useAnimatedReaction(
    () => progress.get(),
    (now, before) => {
      if (before == null || now <= before) return;
      const crossed = (mark: number) => before < mark && now >= mark;
      if (crossed(0.01)) scheduleOnRN(tap, 'soft');
      if (crossed(0.36)) scheduleOnRN(tap, 'light');
      if (crossed(0.52)) scheduleOnRN(tap, 'light');
      if (crossed(0.74)) scheduleOnRN(tap, 'heavy');
      if (crossed(0.72)) scheduleOnRN(tap, 'rigid');
      if (crossed(0.79)) scheduleOnRN(tap, 'soft');
      if (crossed(0.86)) scheduleOnRN(tap, 'soft');
      if (crossed(0.93)) scheduleOnRN(tap, 'soft');
    },
  );
  // A small settle once the last stroke lands.
  const markStyle = useAnimatedStyle(() => {
    const settle = seg(progress.get(), 0.72, 0.86);
    return { transform: [{ scale: settle > 0 ? 0.94 + 0.06 * backOut(settle) : 1 }] };
  });
  const glowStyle = useAnimatedStyle(() => {
    const bloom = easeOut(seg(progress.get(), 0.62, 0.9));
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
                d={STEM.d}
                stroke={inkColor}
                strokeDasharray={`${STEM.length} ${STEM.length * 2}`}
                animatedProps={stemProps}
              />
              <AnimatedPath
                d={FALL.d}
                stroke={inkColor}
                strokeDasharray={`${FALL.length} ${FALL.length * 2}`}
                animatedProps={fallProps}
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
    const p = seg(progress.get(), 0.6 + index * 0.07, 0.8 + index * 0.07);
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
