import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { AmbientGlow } from '../brand/AmbientGlow';
import { DrawnLogo } from '../brand/DrawnLogo';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMotionEnabled } from '../../theme/motion';
import { typography } from '../../theme/typography';

const LOGO_DRAW_MS = 2000;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Faint moments drifting behind the logo (placeholder stock photos, see assets/onboarding). */
const BACKDROP: readonly { image: ImageSource; x: number; y: number; rotate: number; size: number; phase: number }[] = [
  { image: require('../../../assets/onboarding/welcome.jpg'), x: -0.34, y: 0.1, rotate: -12, size: 0.36, phase: 0 },
  { image: require('../../../assets/onboarding/memories.jpg'), x: 0.36, y: 0.06, rotate: 10, size: 0.32, phase: 0.3 },
  { image: require('../../../assets/onboarding/capture.jpg'), x: -0.42, y: 0.3, rotate: 8, size: 0.26, phase: 0.55 },
  { image: require('../../../assets/onboarding/chat.jpg'), x: 0.42, y: 0.28, rotate: -9, size: 0.27, phase: 0.8 },
];

/** Space the hero takes above the form, below the safe area. */
export function loginHeroHeight(width: number) {
  return Math.round(logoSize(width) * 2.2 + 30);
}

function logoSize(width: number) {
  return Math.min(108, width * 0.27);
}

/**
 * The login stage, in the welcome tour's language (light or dark with the system): a backdrop with the breathing accent
 * glow and faint moments drifting, the NiX logo drawing itself with the wordmark and tagline,
 * then the native form rising in. The hero steps aside while the keyboard is up.
 */
export function LoginStage({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const keyboard = useAnimatedKeyboard();
  const logo = useSharedValue(motionEnabled ? 0 : 1);
  const formIn = useSharedValue(motionEnabled ? 0 : 1);
  const drift = useSharedValue(0);

  useEffect(() => {
    if (!motionEnabled) return;
    logo.set(withDelay(250, withTiming(1, { duration: LOGO_DRAW_MS, easing: Easing.linear })));
    formIn.set(withDelay(1250, withTiming(1, { duration: 700, easing: EASE_OUT })));
    drift.set(withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1, false));
    return () => {
      cancelAnimation(logo);
      cancelAnimation(formIn);
      cancelAnimation(drift);
    };
  }, [drift, formIn, logo, motionEnabled]);

  const size = logoSize(width);
  const heroStyle = useAnimatedStyle(() => {
    const k = Math.min(1, keyboard.height.get() / 260);
    return { opacity: 1 - k, transform: [{ translateY: -40 * k }, { scale: 1 - 0.15 * k }] };
  });
  const taglineStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (logo.get() - 0.85) / 0.15));
    return { opacity: p, transform: [{ translateY: (1 - p) * 8 }] };
  });
  const formStyle = useAnimatedStyle(() => ({
    opacity: formIn.get(),
    transform: [{ translateY: (1 - formIn.get()) * 48 }],
  }));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AmbientGlow color={colors.accent} width={width} height={height} motionEnabled={motionEnabled} centerY={0.2} intensity={isDark ? 1 : 0.45} />
      {BACKDROP.map((card, index) => (
        <BackdropCard
          key={index}
          {...card}
          drift={drift}
          width={width}
          top={insets.top}
          opacity={isDark ? 0.32 : 0.22}
          motionEnabled={motionEnabled}
        />
      ))}
      {/* Fades the backdrop into the stage under the form. */}
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', colors.background]}
        locations={[0.12, 0.4]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View pointerEvents="none" style={[styles.hero, { top: insets.top + 28 }, heroStyle]}>
        <DrawnLogo progress={logo} size={size} glowColor={colors.accent} inkColor={colors.label} />
        <Animated.View style={taglineStyle}>
          <Text style={[styles.tagline, { color: colors.secondaryLabel }]}>{t('auth.tagline')}</Text>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.form, formStyle]}>{children}</Animated.View>
    </View>
  );
}

function BackdropCard({
  image,
  x,
  y,
  rotate,
  size,
  phase,
  drift,
  width,
  top,
  opacity,
  motionEnabled,
}: {
  image: ImageSource;
  x: number;
  y: number;
  rotate: number;
  size: number;
  phase: number;
  drift: SharedValue<number>;
  width: number;
  top: number;
  opacity: number;
  motionEnabled: boolean;
}) {
  const w = width * size;
  const style = useAnimatedStyle(() => {
    const a = (drift.get() + phase) * Math.PI * 2;
    return {
      transform: motionEnabled
        ? [{ translateX: Math.sin(a) * 10 }, { translateY: Math.cos(a) * 14 }, { rotate: `${rotate + Math.sin(a) * 2}deg` }]
        : [{ rotate: `${rotate}deg` }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.card,
        {
          width: w,
          height: w * 1.3,
          left: width / 2 + x * width - w / 2,
          top: top + y * width,
          borderRadius: w * 0.12,
          opacity,
        },
        style,
      ]}>
      <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={2} accessible={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    overflow: 'hidden',
  },
  hero: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
  },
  tagline: {
    ...typography.subheadline,
    textAlign: 'center',
  },
  form: {
    flex: 1,
  },
});
