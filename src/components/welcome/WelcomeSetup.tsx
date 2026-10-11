import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Camera } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Host } from '@expo/ui';
import { Button, Text as SwiftText, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, disabled as swiftDisabled, font, foregroundStyle, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { usePushNotifications } from '../../context/pushNotifications';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuth } from '../../hooks/useAuth';
import { useMemoriesAlbum } from '../../hooks/useMemoriesAlbum';
import { selection } from '../../lib/haptics';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import { queryKeys } from '../../lib/queryKeys';
import { getCurrentUserProfile, updateCurrentUserProfile } from '../../services/profileService';
import { darkColors } from '../../theme/colors';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';
import { useMotionEnabled } from '../../theme/motion';
import { APP_FONT_FAMILY, typography } from '../../theme/typography';

const ink = darkColors;

export type WelcomeSetupStep = 'notifications' | 'camera' | 'privacy' | 'memories';
const STEPS: readonly WelcomeSetupStep[] = ['notifications', 'camera', 'privacy', 'memories'];

/** What the user chose, shown back as a checklist while the app gets ready. */
export type WelcomeSetupSummary = { key: WelcomeSetupStep; label: string; done: boolean }[];

/**
 * After the tour: a few native set-up steps (notifications, camera and microphone, account
 * privacy, Memories), each with an animated symbol, a short why, and native buttons. Every step
 * can be skipped; choices apply right away.
 */
export function WelcomeSetup({
  topInset,
  bottomInset,
  onDone,
}: {
  topInset: number;
  bottomInset: number;
  onDone: (summary: WelcomeSetupSummary) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const push = usePushNotifications();
  const album = useMemoriesAlbum();
  const profile = useQuery({
    queryKey: queryKeys.currentUserProfile(userId),
    queryFn: getCurrentUserProfile,
    enabled: Boolean(userId),
  });

  const [index, setIndex] = useState(0);
  const [cameraGranted, setCameraGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [privateChoice, setPrivateChoice] = useState<boolean | null>(null);
  const step = STEPS[index];
  const isPrivate = privateChoice ?? profile.data?.is_private ?? false;
  const memoriesOn = album.preference === 'on';

  useEffect(() => {
    let alive = true;
    void Promise.all([Camera.getCameraPermissionsAsync(), Camera.getMicrophonePermissionsAsync()]).then(
      ([camera, mic]) => {
        if (alive) setCameraGranted(camera.granted && mic.granted);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  const summary = (): WelcomeSetupSummary => [
    { key: 'notifications', label: t('welcome.setup.summary.notifications'), done: push.state === 'enabled' },
    { key: 'camera', label: t('welcome.setup.summary.camera'), done: cameraGranted === true },
    {
      key: 'privacy',
      label: isPrivate ? t('welcome.setup.summary.private') : t('welcome.setup.summary.public'),
      done: true,
    },
    { key: 'memories', label: t('welcome.setup.summary.memories'), done: memoriesOn },
  ];

  const next = () => {
    if (index < STEPS.length - 1) setIndex(index + 1);
    else onDone(summary());
  };

  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };

  const enableNotifications = () =>
    run(async () => {
      if (push.state === 'denied') {
        await push.openSettings();
        return;
      }
      await push.enable();
    });

  const allowCamera = () =>
    run(async () => {
      const camera = await Camera.requestCameraPermissionsAsync();
      const mic = await Camera.requestMicrophonePermissionsAsync();
      setCameraGranted(camera.granted && mic.granted);
    });

  const choosePrivacy = (value: boolean) => {
    if (value === isPrivate) return;
    selection();
    setPrivateChoice(value);
    void updateCurrentUserProfile({ is_private: value }).then(
      () => queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile(userId) }),
      () => setPrivateChoice(!value),
    );
  };

  const chooseMemories = (value: boolean) => {
    if (album.preference === (value ? 'on' : 'off')) return;
    selection();
    void album.setSavingEnabled(value).catch(() => undefined);
  };

  // Granting moves on by itself, like the system set-up assistant.
  const notificationsOn = push.state === 'enabled';
  useEffect(() => {
    if (step === 'notifications' && notificationsOn && busy === false) {
      const id = setTimeout(() => setIndex((value) => (STEPS[value] === 'notifications' ? value + 1 : value)), 650);
      return () => clearTimeout(id);
    }
    if (step === 'camera' && cameraGranted === true && busy === false) {
      const id = setTimeout(() => setIndex((value) => (STEPS[value] === 'camera' ? value + 1 : value)), 650);
      return () => clearTimeout(id);
    }
  }, [busy, cameraGranted, notificationsOn, step]);

  let primaryLabel = t('welcome.next');
  let primaryAction: () => void = next;
  let primaryDisabled = false;
  if (step === 'notifications') {
    if (notificationsOn) {
      primaryLabel = t('welcome.setup.enabled');
      primaryDisabled = true;
    } else if (push.state === 'denied') {
      primaryLabel = t('welcome.setup.openSettings');
      primaryAction = () => void enableNotifications();
    } else {
      primaryLabel = t('welcome.setup.notifications.action');
      primaryAction = () => void enableNotifications();
    }
  } else if (step === 'camera') {
    if (cameraGranted) {
      primaryLabel = t('welcome.setup.enabled');
      primaryDisabled = true;
    } else {
      primaryLabel = t('welcome.setup.camera.action');
      primaryAction = () => void allowCamera();
    }
  } else if (step === 'memories') {
    primaryLabel = t('welcome.setup.finish');
  }
  const showLater = step === 'notifications' || step === 'camera';

  return (
    <View style={[StyleSheet.absoluteFill, { paddingTop: topInset + 14, paddingBottom: bottomInset + 16 }]}>
      <StepProgress count={STEPS.length} index={index} accent={colors.accent} label={t('welcome.setup.stepA11y', { current: index + 1, total: STEPS.length })} />

      <Animated.View
        key={step}
        entering={motionEnabled ? SlideInRight.duration(380).easing(Easing.bezier(0.23, 1, 0.32, 1)) : FadeIn}
        exiting={motionEnabled ? SlideOutLeft.duration(260) : FadeOut}
        style={styles.body}>
        <HeroSymbol step={step} accent={colors.accent} onAccent={colors.onAccent} motionEnabled={motionEnabled} />
        <Text accessibilityRole="header" style={[styles.title, { color: ink.label }]}>
          {t(`welcome.setup.${step}.title`)}
        </Text>
        <Text style={[styles.text, { color: ink.cinemaSecondaryLabel }]}>{t(`welcome.setup.${step}.body`)}</Text>

        {step === 'privacy' ? (
          <View style={styles.options}>
            <OptionCard
              icon="friends"
              title={t('welcome.setup.privacy.public')}
              body={t('welcome.setup.privacy.publicBody')}
              selected={!isPrivate}
              accent={colors.accent}
              onPress={() => choosePrivacy(false)}
            />
            <OptionCard
              icon="lock"
              title={t('welcome.setup.privacy.private')}
              body={t('welcome.setup.privacy.privateBody')}
              selected={isPrivate}
              accent={colors.accent}
              onPress={() => choosePrivacy(true)}
            />
          </View>
        ) : null}
        {step === 'memories' ? (
          <View style={styles.options}>
            <OptionCard
              icon="memories"
              title={t('welcome.setup.memories.on')}
              body={t('welcome.setup.memories.onBody')}
              selected={memoriesOn}
              accent={colors.accent}
              onPress={() => chooseMemories(true)}
            />
            <OptionCard
              icon="close"
              title={t('welcome.setup.memories.off')}
              body={t('welcome.setup.memories.offBody')}
              selected={album.preference === 'off'}
              accent={colors.accent}
              onPress={() => chooseMemories(false)}
            />
          </View>
        ) : null}
      </Animated.View>

      <View style={styles.actions}>
        <Host matchContents={{ vertical: true }} colorScheme="dark" style={styles.buttonHost}>
          <VStack spacing={6}>
            <Button
              onPress={primaryAction}
              modifiers={[
                buttonStyle(canUseLiquidGlass() ? 'glassProminent' : 'borderedProminent'),
                controlSize('large'),
                tint(colors.accent),
                swiftDisabled(primaryDisabled || busy),
              ]}>
              <SwiftText
                modifiers={[
                  font({ design: 'rounded', textStyle: 'headline', weight: 'semibold' }),
                  foregroundStyle(colors.onAccent),
                  frame({ maxWidth: Infinity, minHeight: 30 }),
                ]}>
                {primaryLabel}
              </SwiftText>
            </Button>
            <Button
              onPress={next}
              modifiers={[buttonStyle('borderless'), tint(ink.cinemaSecondaryLabel), frame({ minHeight: 44 })]}>
              <SwiftText modifiers={[font({ design: 'rounded', textStyle: 'body' }), foregroundStyle(ink.cinemaSecondaryLabel)]}>
                {showLater ? t('welcome.setup.later') : ' '}
              </SwiftText>
            </Button>
          </VStack>
        </Host>
      </View>
    </View>
  );
}

/** Segmented progress at the top; the current segment fills in as the step arrives. */
function StepProgress({ count, index, accent, label }: { count: number; index: number; accent: string; label: string }) {
  return (
    <View style={styles.progress} accessible accessibilityLabel={label}>
      {Array.from({ length: count }, (_, position) => (
        <ProgressSegment key={position} filled={position <= index} accent={accent} />
      ))}
    </View>
  );
}

function ProgressSegment({ filled, accent }: { filled: boolean; accent: string }) {
  const fill = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    fill.set(withTiming(filled ? 1 : 0, { duration: 420, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
  }, [fill, filled]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.get() }] }));
  return (
    <View style={[styles.segment, { backgroundColor: ink.cinemaTrack }]}>
      <Animated.View style={[styles.segmentFill, { backgroundColor: accent }, style]} />
    </View>
  );
}

const HERO_ICON: Record<WelcomeSetupStep, AppIconName> = {
  notifications: 'notification',
  camera: 'camera',
  privacy: 'privacySecurity',
  memories: 'memories',
};

/** A glowing accent tile with the step's symbol, alive with a small idle motion. */
function HeroSymbol({
  step,
  accent,
  onAccent,
  motionEnabled,
}: {
  step: WelcomeSetupStep;
  accent: string;
  onAccent: string;
  motionEnabled: boolean;
}) {
  const { t } = useTranslation();
  const loop = useSharedValue(0);
  useEffect(() => {
    if (!motionEnabled) return;
    loop.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(loop);
  }, [loop, motionEnabled]);

  const tileStyle = useAnimatedStyle(() => {
    const p = loop.get();
    if (step === 'notifications') {
      // A bell ring: a quick wobble, then rest.
      const ring = p < 0.3 ? Math.sin(p * Math.PI * 12) * (1 - p / 0.3) * 14 : 0;
      return { transform: [{ rotate: `${ring}deg` }] };
    }
    if (step === 'camera') {
      // A shutter blink.
      const blink = p > 0.55 && p < 0.65 ? 1 - Math.sin(((p - 0.55) / 0.1) * Math.PI) * 0.12 : 1;
      return { transform: [{ scale: blink }] };
    }
    // A slow breath.
    return { transform: [{ scale: 1 + Math.sin(p * Math.PI * 2) * 0.035 }] };
  });

  return (
    <View style={styles.heroWrap}>
      {step === 'notifications' ? <NotificationBanner loop={loop} text={t('welcome.setup.notifications.preview')} /> : null}
      <Animated.View style={[styles.heroTile, { backgroundColor: accent, shadowColor: accent }, tileStyle]}>
        <SymbolView name={resolveAppIconName(HERO_ICON[step])} size={46} tintColor={onAccent} weight="semibold" />
      </Animated.View>
    </View>
  );
}

/** A mock notification that drops in over the bell, so the step shows what it turns on. */
function NotificationBanner({ loop, text }: { loop: SharedValue<number>; text: string }) {
  const { colors } = useAppTheme();
  const style = useAnimatedStyle(() => {
    const p = loop.get();
    const inP = Math.min(1, Math.max(0, (p - 0.32) / 0.12));
    const outP = Math.min(1, Math.max(0, (p - 0.86) / 0.1));
    const eased = 1 - Math.pow(1 - inP, 3);
    return { opacity: eased * (1 - outP), transform: [{ translateY: -14 + 14 * eased - 10 * outP }] };
  });
  return (
    <Animated.View style={[styles.banner, { borderColor: ink.cinemaTrack }, style]}>
      <BlurView intensity={50} tint="systemThinMaterialDark" style={StyleSheet.absoluteFill} />
      <View style={[styles.bannerIcon, { backgroundColor: colors.accent }]}>
        <SymbolView name={resolveAppIconName('camera')} size={14} tintColor={colors.onAccent} weight="bold" />
      </View>
      <Text style={[styles.bannerText, { color: ink.label }]} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

function OptionCard({
  icon,
  title,
  body,
  selected,
  accent,
  onPress,
}: {
  icon: AppIconName;
  title: string;
  body: string;
  selected: boolean;
  accent: string;
  onPress: () => void;
}) {
  const ring = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    ring.set(withTiming(selected ? 1 : 0, { duration: 220 }));
  }, [ring, selected]);
  const checkStyle = useAnimatedStyle(() => ({ opacity: ring.get(), transform: [{ scale: 0.6 + 0.4 * ring.get() }] }));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${body}`}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: ink.secondarySystemBackground,
          borderColor: selected ? accent : ink.cinemaTrack,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}>
      <SymbolView name={resolveAppIconName(icon)} size={APP_ICON_SIZE.lg} tintColor={accent} weight="semibold" />
      <View style={styles.optionTexts}>
        <Text style={[styles.optionTitle, { color: ink.label }]}>{title}</Text>
        <Text style={[styles.optionBody, { color: ink.cinemaSecondaryLabel }]}>{body}</Text>
      </View>
      <View style={[styles.radio, { borderColor: selected ? accent : ink.cinemaTrack }]}>
        <Animated.View style={[styles.radioDot, { backgroundColor: accent }, checkStyle]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 24,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  segmentFill: {
    ...StyleSheet.absoluteFill,
    transformOrigin: 'left center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  heroWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 170,
    marginBottom: 12,
  },
  heroTile: {
    width: 104,
    height: 104,
    borderRadius: 26,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },
  banner: {
    position: 'absolute',
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxWidth: 300,
  },
  bannerIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    ...typography.footnote,
    fontWeight: '600',
  },
  title: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
    textAlign: 'center',
  },
  text: {
    ...typography.body,
    fontSize: 17,
    lineHeight: 23,
    textAlign: 'center',
  },
  options: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1.5,
  },
  optionTexts: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    ...typography.headline,
  },
  optionBody: {
    ...typography.footnote,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  actions: {
    paddingHorizontal: 24,
  },
  buttonHost: {
    alignSelf: 'stretch',
  },
});
