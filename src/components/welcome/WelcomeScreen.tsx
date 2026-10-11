import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Host } from '@expo/ui';
import { Button, Text as SwiftText } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, font, foregroundStyle, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuth } from '../../hooks/useAuth';
import { notify, selection, tap } from '../../lib/haptics';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import { markWelcomeSeen } from '../../lib/welcomeOnboarding';
import { darkColors } from '../../theme/colors';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';
import { useMotionEnabled } from '../../theme/motion';
import { APP_FONT_FAMILY, typography } from '../../theme/typography';
import { WelcomeLogo } from './WelcomeLogo';
import { WelcomeSetup, type WelcomeSetupSummary } from './WelcomeSetup';
import {
  CaptureScene,
  ChatScene,
  EphemeralScene,
  MemoriesScene,
  WelcomeScene,
  type SceneProps,
} from './WelcomeScenes';

const ink = darkColors;

const SCENE_PAGES: readonly { key: string; Scene: ComponentType<SceneProps> }[] = [
  { key: 'welcome', Scene: WelcomeScene },
  { key: 'capture', Scene: CaptureScene },
  { key: 'ephemeral', Scene: EphemeralScene },
  { key: 'chat', Scene: ChatScene },
  { key: 'memories', Scene: MemoriesScene },
];

const FEATURES: readonly { key: string; icon: AppIconName }[] = [
  { key: 'friends', icon: 'friends' },
  { key: 'streaks', icon: 'streak' },
  { key: 'widgets', icon: 'widgets' },
  { key: 'safety', icon: 'privacySecurity' },
];

const PAGE_COUNT = SCENE_PAGES.length + 1;
const DOT = 7;
/** The logo plays this long when the tour opens and again as it closes. */
const LOGO_DRAW_MS = 2100;
const CURTAIN_EASE = Easing.bezier(0.23, 1, 0.32, 1);

type Curtain = 'intro' | 'outro' | null;

/** Where a page sits relative to the viewport: -1 left of it, 0 centred, 1 right of it. */
function pageProgress(scrollX: SharedValue<number>, index: number, width: number) {
  'worklet';
  return (scrollX.get() - index * width) / Math.max(1, width);
}

/**
 * The welcome tour: each page plays a short motion-graphics scene built from the app's own
 * interface (camera, timer, chat, Memories), with the copy under it and a native button; it ends
 * on a "What's New"-style list. Dark in both themes, like the camera and viewer.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [page, setPage] = useState(0);
  const finishingRef = useRef(false);
  const isLast = page === PAGE_COUNT - 1;
  // The logo curtain: drawn over everything when the tour opens and when it ends.
  const [curtain, setCurtain] = useState<Curtain>('intro');
  const logo = useSharedValue(motionEnabled ? 0 : 1);
  const curtainOpacity = useSharedValue(1);
  // After the tour, signed-in users set the app up before the closing logo.
  const { session } = useAuth();
  const [phase, setPhase] = useState<'tour' | 'setup'>('tour');
  const [summary, setSummary] = useState<WelcomeSetupSummary | null>(null);
  const prep = useSharedValue(0);

  const liftCurtain = () => {
    'worklet';
    curtainOpacity.set(
      withTiming(0, { duration: 480, easing: CURTAIN_EASE }, (finished) => {
        if (finished) scheduleOnRN(setCurtain, null);
      }),
    );
  };

  useEffect(() => {
    if (!motionEnabled) {
      const id = setTimeout(() => setCurtain(null), 700);
      return () => clearTimeout(id);
    }
    logo.set(
      withTiming(1, { duration: LOGO_DRAW_MS, easing: Easing.linear }, (finished) => {
        if (!finished) return;
        curtainOpacity.set(
          withDelay(
            320,
            withTiming(0, { duration: 480, easing: CURTAIN_EASE }, (done) => {
              if (done) scheduleOnRN(setCurtain, null);
            }),
          ),
        );
      }),
    );
    return () => {
      cancelAnimation(logo);
      cancelAnimation(curtainOpacity);
    };
  }, [curtainOpacity, logo, motionEnabled]);

  const skipIntro = () => {
    if (curtain !== 'intro') return;
    tap('light');
    cancelAnimation(logo);
    logo.set(1);
    liftCurtain();
  };

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.set(event.contentOffset.x);
    },
  });
  // A page becomes current once it is more than half in view, so its scene starts mid-swipe.
  useAnimatedReaction(
    () => Math.round(scrollX.get() / Math.max(1, width)),
    (next, previous) => {
      if (next === previous) return;
      scheduleOnRN(setPage, next);
      // A detent as each page snaps in.
      if (previous != null) scheduleOnRN(selection);
    },
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const closeAfterOutro = () => {
    notify('success');
    setTimeout(close, 420);
  };

  // Ends on the logo drawing itself once more while "getting the app ready" ticks off the
  // choices from set-up, then closes.
  const finish = (choices?: WelcomeSetupSummary) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    void markWelcomeSeen();
    if (!motionEnabled) {
      notify('success');
      close();
      return;
    }
    setSummary(choices ?? null);
    const prepMs = choices ? 1500 : 700;
    cancelAnimation(logo);
    logo.set(0);
    prep.set(0);
    curtainOpacity.set(0);
    setCurtain('outro');
    curtainOpacity.set(
      withTiming(1, { duration: 360, easing: CURTAIN_EASE }, (finished) => {
        if (!finished) return;
        logo.set(
          withTiming(1, { duration: LOGO_DRAW_MS, easing: Easing.linear }, (done) => {
            if (!done) return;
            prep.set(
              withTiming(1, { duration: prepMs, easing: Easing.linear }, (ready) => {
                if (ready) scheduleOnRN(closeAfterOutro);
              }),
            );
          }),
        );
      }),
    );
  };

  const startSetup = () => {
    tap('medium');
    if (!session) {
      finish();
      return;
    }
    setPhase('setup');
  };

  const goNext = () => {
    if (isLast) {
      startSetup();
      return;
    }
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: motionEnabled });
  };

  const stageTop = insets.top + 48;
  const stageHeight = Math.round(height * 0.45);
  const controlsBottom = insets.bottom + 16;

  return (
    <View style={[styles.root, { backgroundColor: ink.cinemaBackground }]}>
      <StatusBar style="light" />
      <AmbientGlow color={colors.accent} width={width} height={height} scrollX={scrollX} motionEnabled={motionEnabled} />
      {phase === 'tour' ? (
        <Animated.View exiting={FadeOut.duration(260)} style={StyleSheet.absoluteFill}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}>
          {SCENE_PAGES.map(({ key, Scene }, index) => (
            <ScenePage
              key={key}
              index={index}
              title={t(`welcome.pages.${key}.title`)}
              body={t(`welcome.pages.${key}.body`)}
              scrollX={scrollX}
              width={width}
              height={height}
              stageTop={stageTop}
              stageHeight={stageHeight}
              motionEnabled={motionEnabled}>
              <Scene
                active={page === index && curtain === null}
                width={width}
                height={stageHeight}
                motionEnabled={motionEnabled}
              />
            </ScenePage>
          ))}
          <FeaturesPage
            index={SCENE_PAGES.length}
            active={isLast && curtain === null}
            scrollX={scrollX}
            width={width}
            height={height}
            top={insets.top + 60}
            motionEnabled={motionEnabled}
          />
        </Animated.ScrollView>

        {isLast ? null : (
          <View style={[styles.skip, { top: insets.top + 6 }]}>
            <Host matchContents colorScheme="dark">
              <Button
                label={t('welcome.skip')}
                onPress={() => {
                tap('light');
                finish();
              }}
                modifiers={[buttonStyle(canUseLiquidGlass() ? 'glass' : 'bordered'), tint(ink.label)]}
              />
            </Host>
          </View>
        )}

        <View style={[styles.controls, { bottom: controlsBottom }]} pointerEvents="box-none">
          <PageDots
            count={PAGE_COUNT}
            scrollX={scrollX}
            width={width}
            color={ink.label}
            label={t('welcome.pageA11y', { current: page + 1, total: PAGE_COUNT })}
          />
          <Host matchContents={{ vertical: true }} colorScheme="dark" style={styles.buttonHost}>
            <Button
              onPress={goNext}
              modifiers={[
                buttonStyle(canUseLiquidGlass() ? 'glassProminent' : 'borderedProminent'),
                controlSize('large'),
                tint(colors.accent),
              ]}>
              <SwiftText
                modifiers={[
                  font({ design: 'rounded', textStyle: 'headline', weight: 'semibold' }),
                  foregroundStyle(colors.onAccent),
                  frame({ maxWidth: Infinity, minHeight: 30 }),
                ]}>
                {isLast ? t('welcome.setUp') : t('welcome.next')}
              </SwiftText>
            </Button>
          </Host>
        </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(420).delay(120)} style={StyleSheet.absoluteFill}>
          <WelcomeSetup topInset={insets.top} bottomInset={insets.bottom} onDone={(choices) => finish(choices)} />
        </Animated.View>
      )}

      {curtain ? (
        <LogoCurtain
          logo={logo}
          opacity={curtainOpacity}
          accent={colors.accent}
          width={width}
          onPress={curtain === 'intro' ? skipIntro : undefined}
          label={t('welcome.logoA11y')}
          outro={curtain === 'outro'}
          caption={t('welcome.preparing')}
          summary={summary}
          prep={prep}
        />
      ) : null}
    </View>
  );
}

/**
 * Full-screen stage for the logo, over the tour; the intro can be tapped through. Closing, it
 * says the app is getting ready and ticks off what set-up turned on.
 */
function LogoCurtain({
  logo,
  opacity,
  accent,
  width,
  onPress,
  label,
  outro,
  caption,
  summary,
  prep,
}: {
  logo: SharedValue<number>;
  opacity: SharedValue<number>;
  accent: string;
  width: number;
  onPress?: () => void;
  label: string;
  outro: boolean;
  caption: string;
  summary: WelcomeSetupSummary | null;
  prep: SharedValue<number>;
}) {
  // Lifting off, the logo grows slightly as the curtain fades (it "opens" onto the tour).
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (1 - opacity.get()) * 0.12 }] }));
  const captionStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (logo.get() - 0.8) / 0.2));
    return { opacity: p, transform: [{ translateY: (1 - p) * 10 }] };
  });
  const items = (summary ?? []).filter((item) => item.done);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.curtain, { backgroundColor: ink.cinemaBackground }, style]}>
      <Pressable
        style={styles.curtainPress}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="image"
        accessibilityLabel={outro ? `${label}. ${caption}` : label}>
        <Animated.View style={logoStyle}>
          <WelcomeLogo progress={logo} size={Math.min(148, width * 0.36)} glowColor={accent} />
        </Animated.View>
        {outro ? (
          <View style={styles.prepare}>
            <Animated.View style={[styles.captionRow, captionStyle]}>
              <PrepareSpinner prep={prep} accent={accent} />
              <Text style={[styles.caption, { color: ink.cinemaSecondaryLabel }]}>{caption}</Text>
            </Animated.View>
            {items.map((item, index) => (
              <ChecklistRow key={item.key} label={item.label} index={index} count={items.length} prep={prep} accent={accent} />
            ))}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** A small ring that sweeps while the app "gets ready" and turns into a check at the end. */
function PrepareSpinner({ prep, accent }: { prep: SharedValue<number>; accent: string }) {
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.max(0, (prep.get() - 0.85) / 0.15)),
    transform: [{ rotate: `${prep.get() * 720}deg` }],
  }));
  const checkStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (prep.get() - 0.85) / 0.15));
    return { opacity: p, transform: [{ scale: 0.5 + 0.5 * p }] };
  });
  return (
    <View style={styles.spinner}>
      <Animated.View style={[styles.spinnerRing, { borderColor: ink.cinemaTrack, borderTopColor: accent }, ringStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.spinnerCheck, checkStyle]}>
        <SymbolView name={resolveAppIconName('checkCircleFill')} size={18} tintColor={accent} weight="bold" />
      </Animated.View>
    </View>
  );
}

function ChecklistRow({
  label,
  index,
  count,
  prep,
  accent,
}: {
  label: string;
  index: number;
  count: number;
  prep: SharedValue<number>;
  accent: string;
}) {
  // Rows tick off one after another across the "getting ready" beat.
  const start = (index / Math.max(1, count)) * 0.7;
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (prep.get() - start) / 0.18));
    return { opacity: p, transform: [{ translateY: (1 - p) * 8 }] };
  });
  useAnimatedReaction(
    () => prep.get() >= start + 0.08,
    (ticked, before) => {
      if (ticked && before === false) scheduleOnRN(tap, 'light');
    },
  );
  const checkStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (prep.get() - start - 0.08) / 0.12));
    return { transform: [{ scale: p < 1 ? 0.4 + 0.8 * p : 1 }] };
  });
  return (
    <Animated.View style={[styles.checkRow, style]}>
      <Animated.View style={checkStyle}>
        <SymbolView name={resolveAppIconName('checkmark')} size={14} tintColor={accent} weight="bold" />
      </Animated.View>
      <Text style={[styles.checkText, { color: ink.label }]}>{label}</Text>
    </Animated.View>
  );
}

/**
 * A soft glow of the accent colour behind the scenes: it breathes slowly and drifts against the
 * swipe, so the backdrop has depth without competing with the scene.
 */
function AmbientGlow({
  color,
  width,
  height,
  scrollX,
  motionEnabled,
}: {
  color: string;
  width: number;
  height: number;
  scrollX: SharedValue<number>;
  motionEnabled: boolean;
}) {
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!motionEnabled) return;
    breath.set(withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(breath);
  }, [breath, motionEnabled]);
  const size = width * 1.6;
  const style = useAnimatedStyle(() => {
    const drift = Math.sin((scrollX.get() / Math.max(1, width)) * Math.PI * 0.5) * width * 0.18;
    return {
      opacity: 0.55 + breath.get() * 0.25,
      transform: [{ translateX: -drift }, { scale: 1 + breath.get() * 0.08 }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.glow, { width: size, height: size, left: (width - size) / 2, top: height * 0.32 - size / 2 }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="welcomeGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0.12} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill="url(#welcomeGlow)" />
      </Svg>
    </Animated.View>
  );
}

function ScenePage({
  index,
  title,
  body,
  scrollX,
  width,
  height,
  stageTop,
  stageHeight,
  motionEnabled,
  children,
}: {
  index: number;
  title: string;
  body: string;
  scrollX: SharedValue<number>;
  width: number;
  height: number;
  stageTop: number;
  stageHeight: number;
  motionEnabled: boolean;
  children: ReactNode;
}) {
  // The scene trails the swipe slightly (parallax); the copy fades and slides a little further.
  const stageStyle = useAnimatedStyle(() => {
    const progress = pageProgress(scrollX, index, width);
    return {
      opacity: interpolate(Math.abs(progress), [0, 0.8], [1, 0], Extrapolation.CLAMP),
      transform: motionEnabled
        ? [{ translateX: progress * width * 0.35 }, { scale: 1 - Math.min(1, Math.abs(progress)) * 0.08 }]
        : [],
    };
  });
  const copyStyle = useAnimatedStyle(() => {
    const progress = pageProgress(scrollX, index, width);
    return {
      opacity: interpolate(Math.abs(progress), [0, 0.5], [1, 0], Extrapolation.CLAMP),
      transform: motionEnabled ? [{ translateX: progress * width * 0.15 }] : [],
    };
  });
  return (
    <View style={{ width, height }}>
      <Animated.View style={[styles.stage, { top: stageTop, height: stageHeight }, stageStyle]}>{children}</Animated.View>
      <Animated.View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${title}. ${body}`}
        style={[styles.copy, { top: stageTop + stageHeight + 24 }, copyStyle]}>
        <Text style={[styles.title, { color: ink.label }]}>{title}</Text>
        <Text style={[styles.body, { color: ink.cinemaSecondaryLabel }]}>{body}</Text>
      </Animated.View>
    </View>
  );
}

function FeaturesPage({
  index,
  active,
  scrollX,
  width,
  height,
  top,
  motionEnabled,
}: {
  index: number;
  active: boolean;
  scrollX: SharedValue<number>;
  width: number;
  height: number;
  top: number;
  motionEnabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ width, height }}>
      <View style={[styles.features, { paddingTop: top }]}>
        <Text accessibilityRole="header" style={[styles.featuresTitle, { color: ink.label }]}>
          {t('welcome.features.title')}
        </Text>
        <Text style={[styles.body, styles.featuresLead, { color: ink.cinemaSecondaryLabel }]}>
          {t('welcome.features.lead')}
        </Text>
        <View style={styles.featureList}>
          {FEATURES.map((feature, order) => (
            <FeatureRow
              key={feature.key}
              icon={feature.icon}
              title={t(`welcome.features.${feature.key}.title`)}
              body={t(`welcome.features.${feature.key}.body`)}
              order={order}
              index={index}
              active={active}
              scrollX={scrollX}
              width={width}
              motionEnabled={motionEnabled}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** Rows settle in one after another as the page arrives; the icon tiles pop (What's New). */
function FeatureRow({
  icon,
  title,
  body,
  order,
  index,
  active,
  scrollX,
  width,
  motionEnabled,
}: {
  icon: AppIconName;
  title: string;
  body: string;
  order: number;
  index: number;
  active: boolean;
  scrollX: SharedValue<number>;
  width: number;
  motionEnabled: boolean;
}) {
  const { colors } = useAppTheme();
  const pop = useSharedValue(motionEnabled ? 0 : 1);
  useEffect(() => {
    if (!motionEnabled) return;
    pop.set(active ? withTiming(1, { duration: 520 + order * 90, easing: Easing.out(Easing.back(2)) }) : 0);
  }, [active, motionEnabled, order, pop]);
  const rowStyle = useAnimatedStyle(() => {
    const progress = -pageProgress(scrollX, index, width);
    const delayed = Math.max(0, progress - order * 0.08);
    return {
      opacity: interpolate(delayed, [0, 0.5], [1, 0], Extrapolation.CLAMP),
      transform: motionEnabled ? [{ translateX: interpolate(delayed, [0, 1], [0, 90], Extrapolation.CLAMP) }] : [],
    };
  });
  const tileStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.4 + 0.6 * pop.get() }] }));
  return (
    <Animated.View style={[styles.featureRow, rowStyle]} accessible accessibilityLabel={`${title}. ${body}`}>
      <Animated.View style={[styles.featureTile, { backgroundColor: colors.accent }, tileStyle]}>
        <SymbolView name={resolveAppIconName(icon)} size={APP_ICON_SIZE.lg} tintColor={colors.onAccent} weight="semibold" />
      </Animated.View>
      <View style={styles.featureTexts}>
        <Text style={[styles.featureTitle, { color: ink.label }]}>{title}</Text>
        <Text style={[styles.featureBody, { color: ink.cinemaSecondaryLabel }]}>{body}</Text>
      </View>
    </Animated.View>
  );
}

function PageDots({
  count,
  scrollX,
  width,
  color,
  label,
}: {
  count: number;
  scrollX: SharedValue<number>;
  width: number;
  color: string;
  label: string;
}) {
  return (
    <View style={styles.dots} accessible accessibilityLabel={label}>
      {Array.from({ length: count }, (_, index) => (
        <Dot key={index} index={index} scrollX={scrollX} width={width} color={color} />
      ))}
    </View>
  );
}

function Dot({
  index,
  scrollX,
  width,
  color,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  color: string;
}) {
  // The current dot stretches into a capsule. Its slot has a fixed width, so only the dot itself
  // is laid out again (scaleX would squash the rounded ends).
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(pageProgress(scrollX, index, width));
    return {
      opacity: interpolate(distance, [0, 1], [1, 0.35], Extrapolation.CLAMP),
      width: interpolate(distance, [0, 1], [DOT * 2.6, DOT], Extrapolation.CLAMP),
    };
  });
  return (
    <View style={styles.dotSlot}>
      <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  curtain: {
    zIndex: 10,
  },
  curtainPress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prepare: {
    position: 'absolute',
    bottom: '16%',
    alignItems: 'center',
    gap: 10,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  caption: {
    ...typography.callout,
    fontWeight: '600',
  },
  spinner: {
    width: 20,
    height: 20,
  },
  spinnerRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
    borderWidth: 2.5,
  },
  spinnerCheck: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkText: {
    ...typography.subheadline,
  },
  glow: {
    position: 'absolute',
  },
  stage: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    position: 'absolute',
    left: 28,
    right: 28,
    gap: 10,
    alignItems: 'center',
  },
  title: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    fontSize: 17,
    lineHeight: 23,
    textAlign: 'center',
  },
  skip: {
    position: 'absolute',
    right: 16,
  },
  controls: {
    position: 'absolute',
    left: 24,
    right: 24,
    gap: 22,
    alignItems: 'center',
  },
  buttonHost: {
    alignSelf: 'stretch',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 12,
  },
  dotSlot: {
    width: DOT * 3,
    alignItems: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  features: {
    flex: 1,
    paddingHorizontal: 28,
  },
  featuresTitle: {
    ...typography.largeTitle,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    textAlign: 'center',
  },
  featuresLead: {
    marginTop: 8,
  },
  featureList: {
    marginTop: 40,
    gap: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  featureTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTexts: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    ...typography.headline,
  },
  featureBody: {
    ...typography.subheadline,
  },
});
