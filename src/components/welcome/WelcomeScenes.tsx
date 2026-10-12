import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useAppTheme } from '../../hooks/useAppTheme';
import { darkColors } from '../../theme/colors';
import { useStageInk } from '../brand/stageInk';
import { resolveAppIconName, type AppIconName } from '../../theme/app-icons';
import { APP_FONT_FAMILY, typography } from '../../theme/typography';
import { appear, backOut, cycleFade, easeInOut, easeOut, seg, useSceneBeats, useSceneTimeline, type SceneBeat } from './welcomeMotion';

const WELCOME_PHOTOS = {
  welcome: require('../../../assets/onboarding/welcome.jpg') as ImageSource,
  capture: require('../../../assets/onboarding/capture.jpg') as ImageSource,
  ephemeral: require('../../../assets/onboarding/ephemeral.jpg') as ImageSource,
  chat: require('../../../assets/onboarding/chat.jpg') as ImageSource,
  memories: require('../../../assets/onboarding/memories.jpg') as ImageSource,
};

/** Small tiles of the Memories grid (copies exported by `npm run brand:onboarding`). */
const MEMORY_TILES = {
  coffee: require('../../../assets/onboarding/memory-coffee.jpg') as ImageSource,
  dog: require('../../../assets/onboarding/memory-dog.jpg') as ImageSource,
  skate: require('../../../assets/onboarding/memory-skate.jpg') as ImageSource,
  cake: require('../../../assets/onboarding/memory-cake.jpg') as ImageSource,
  city: require('../../../assets/onboarding/memory-city.jpg') as ImageSource,
  hike: require('../../../assets/onboarding/memory-hike.jpg') as ImageSource,
};

/** Ola's face cropped square (a centre crop of the portrait would cut her head off). */
const OLA_FACE = require('../../../assets/onboarding/chat-face.jpg') as ImageSource;

/** The friends a shot is sent to in the capture scene. */
const FRIEND_AVATARS = [
  require('../../../assets/onboarding/avatar-o.jpg') as ImageSource,
  require('../../../assets/onboarding/avatar-k.jpg') as ImageSource,
  require('../../../assets/onboarding/avatar-m.jpg') as ImageSource,
];

const APP_ICON = require('../../../assets/brand/app/ios-light.png') as ImageSource;

/** The phone mock-up and what sits on a photo stay dark, like a real camera, in both appearances. */
const cam = darkColors;

export type SceneProps = {
  active: boolean;
  width: number;
  height: number;
  motionEnabled: boolean;
};

/** The welcome scenes are a dark "cinema" surface in both themes. */

// #region Shared pieces

/** A phone outline the scenes play inside, like Apple's feature tours. */
function PhoneFrame({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <View
      style={[
        styles.phone,
        { width, height, borderRadius: width * 0.16, borderColor: cam.cinemaTrack, backgroundColor: cam.cinemaBackground },
      ]}>
      <View style={[styles.phoneScreen, { borderRadius: width * 0.13 }]}>{children}</View>
      <View style={[styles.island, { width: width * 0.3, top: width * 0.04, backgroundColor: cam.cinemaBackground }]} />
    </View>
  );
}

function Icon({ name, size, color }: { name: AppIconName; size: number; color: string }) {
  return <SymbolView name={resolveAppIconName(name)} size={size} tintColor={color} weight="semibold" />;
}

/** A glass-ish pill (blur + hairline), used for toasts and chips inside the scenes. */
function Pill({ icon, label, tint }: { icon: AppIconName; label: string; tint: string }) {
  const ink = useStageInk();
  return (
    <View style={[styles.pill, { borderColor: ink.cinemaTrack }]}>
      <BlurView intensity={40} tint="systemThinMaterial" style={StyleSheet.absoluteFill} />
      <Icon name={icon} size={14} color={tint} />
      <Text style={[styles.pillText, { color: ink.label }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Avatar({ photo, size }: { photo: ImageSource; size: number }) {
  const ink = useStageInk();
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, borderColor: ink.systemBackground },
      ]}>
      <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" />
    </View>
  );
}

// #endregion

// #region 1. Welcome: moments fan out of the app icon

const WELCOME_BEATS: readonly SceneBeat[] = [
  { at: 0.1, feel: 'soft' },
  { at: 0.14, feel: 'soft' },
  { at: 0.26, feel: 'medium' },
  { at: 0.4, feel: 'light' },
  { at: 0.54, feel: 'light' },
  { at: 0.68, feel: 'light' },
];

export function WelcomeScene({ active, width, height, motionEnabled }: SceneProps) {
  const t = useSceneTimeline(active, 7000, motionEnabled, 0.5);
  useSceneBeats(active, 7000, motionEnabled, WELCOME_BEATS);
  const cardW = Math.min(width * 0.42, height * 0.36);
  const cardH = cardW * 1.36;
  const cards = [
    { photo: WELCOME_PHOTOS.memories, x: -width * 0.25, rotate: -11, delay: 0.1, z: 1 },
    { photo: WELCOME_PHOTOS.capture, x: width * 0.25, rotate: 11, delay: 0.14, z: 1 },
    { photo: WELCOME_PHOTOS.welcome, x: 0, rotate: 0, delay: 0.06, z: 2 },
  ];
  return (
    <View style={[styles.stage, { width, height }]}>
      {cards.map((card, index) => (
        <FanCard key={index} t={t} cardW={cardW} cardH={cardH} {...card} phase={index} />
      ))}
      <FloatingEmoji t={t} glyph="❤️" x={-width * 0.22} start={0.38} y={-cardH * 0.2} />
      <FloatingEmoji t={t} glyph="🔥" x={width * 0.24} start={0.52} y={-cardH * 0.1} />
      <FloatingEmoji t={t} glyph="😂" x={width * 0.02} start={0.66} y={-cardH * 0.45} />
      <AppIconBadge t={t} size={cardW * 0.42} offsetY={cardH * 0.5} />
    </View>
  );
}

function FanCard({
  t,
  photo,
  x,
  rotate,
  delay,
  z,
  phase,
  cardW,
  cardH,
}: {
  t: SharedValue<number>;
  photo: ImageSource;
  x: number;
  rotate: number;
  delay: number;
  z: number;
  phase: number;
  cardW: number;
  cardH: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = backOut(seg(t.get(), delay, delay + 0.2));
    const float = Math.sin((t.get() * 2 + phase * 0.33) * Math.PI * 2) * 5 * seg(t.get(), 0.3, 0.4);
    return {
      opacity: Math.min(1, p * 1.4) * cycleFade(t.get()),
      transform: [
        { translateX: x * p },
        { translateY: (1 - p) * 40 + float },
        { rotate: `${rotate * p}deg` },
        { scale: 0.7 + 0.3 * p },
      ],
    };
  });
  return (
    <Animated.View
      style={[styles.fanCard, { width: cardW, height: cardH, borderRadius: cardW * 0.12, zIndex: z }, style]}>
      <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

function FloatingEmoji({ t, glyph, x, y, start }: { t: SharedValue<number>; glyph: string; x: number; y: number; start: number }) {
  const style = useAnimatedStyle(() => {
    const p = seg(t.get(), start, start + 0.28);
    return {
      opacity: Math.sin(p * Math.PI),
      transform: [{ translateX: x }, { translateY: y - easeOut(p) * 70 }, { scale: 0.6 + backOut(seg(t.get(), start, start + 0.08)) * 0.5 }],
    };
  });
  return <Animated.Text style={[styles.floatingEmoji, style]}>{glyph}</Animated.Text>;
}

function AppIconBadge({ t, size, offsetY }: { t: SharedValue<number>; size: number; offsetY: number }) {
  const style = useAnimatedStyle(() => {
    const p = backOut(seg(t.get(), 0.22, 0.34));
    return {
      opacity: Math.min(1, p) * cycleFade(t.get()),
      transform: [{ translateY: offsetY }, { scale: 0.5 + 0.5 * p }],
    };
  });
  return (
    <Animated.View style={[styles.appIcon, { width: size, height: size, borderRadius: size * 0.225 }, style]}>
      <Image source={APP_ICON} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

// #endregion

// #region 2. Capture: sticker, shutter, flash, the shot flies to friends

// Sticker lands, shutter press, release with the flash, the shot reaches friends, sent.
const CAPTURE_BEATS: readonly SceneBeat[] = [
  { at: 0.15, feel: 'light' },
  { at: 0.35, feel: 'rigid' },
  { at: 0.39, feel: 'heavy' },
  { at: 0.7, feel: 'light' },
  { at: 0.82, feel: 'success' },
];

export function CaptureScene({ active, width, height, motionEnabled }: SceneProps) {
  const { t: translate } = useTranslation();
  const { colors } = useAppTheme();
  const t = useSceneTimeline(active, 6200, motionEnabled, 0.3);
  useSceneBeats(active, 6200, motionEnabled, CAPTURE_BEATS);
  const phoneH = height * 0.96;
  const phoneW = phoneH * 0.49;

  const viewfinder = useAnimatedStyle(() => ({
    transform: [{ scale: 1.02 + t.get() * 0.08 }],
    opacity: 1 - seg(t.get(), 0.5, 0.56) * 0.65,
  }));
  const sticker = useAnimatedStyle(() => {
    const p = appear(t.get(), 0.1, 0.2, true);
    return { opacity: Math.min(1, p * 1.5) * (1 - seg(t.get(), 0.5, 0.56)), transform: [{ scale: 0.4 + 0.6 * p }, { rotate: '-4deg' }] };
  });
  const shutterInner = useAnimatedStyle(() => {
    const down = seg(t.get(), 0.34, 0.38);
    const up = seg(t.get(), 0.38, 0.46);
    return { transform: [{ scale: 1 - 0.18 * easeOut(down) + 0.18 * easeOut(up) }] };
  });
  const flash = useAnimatedStyle(() => ({
    opacity: seg(t.get(), 0.38, 0.4) * 0.95 * (1 - easeOut(seg(t.get(), 0.4, 0.52))),
  }));
  // The shot: starts as the whole screen, shrinks into a card and flies off to the right.
  const shot = useAnimatedStyle(() => {
    const visible = seg(t.get(), 0.4, 0.41) * cycleFade(t.get());
    const p = easeInOut(seg(t.get(), 0.5, 0.66));
    return {
      opacity: visible,
      transform: [
        { translateX: p * phoneW * 0.78 },
        { translateY: -p * phoneH * 0.18 },
        { scale: 1 - 0.62 * p },
        { rotate: `${6 * p}deg` },
      ],
    };
  });
  const sendRow = useAnimatedStyle(() => {
    const p = appear(t.get(), 0.66, 0.76, true);
    return { opacity: Math.min(1, p * 1.4), transform: [{ translateY: (1 - p) * 16 }] };
  });
  const sent = useAnimatedStyle(() => {
    const p = appear(t.get(), 0.8, 0.86, true);
    return { opacity: Math.min(1, p * 1.4), transform: [{ scale: 0.6 + 0.4 * p }] };
  });

  const screen = (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, viewfinder]}>
        <Image source={WELCOME_PHOTOS.capture} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
      <Animated.View style={[styles.sticker, sticker]}>
        <Text style={[styles.stickerText, { color: cam.label }]}>{translate('welcome.demo.sticker')}</Text>
      </Animated.View>
    </>
  );

  return (
    <View style={[styles.stage, { width, height }]}>
      <View style={{ transform: [{ translateX: -width * 0.1 }] }}>
        <PhoneFrame width={phoneW} height={phoneH}>
          {screen}
          <View style={[styles.shutterRing, { borderColor: cam.label, bottom: phoneH * 0.06 }]}>
            <Animated.View style={[styles.shutterInner, { backgroundColor: cam.label }, shutterInner]} />
          </View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: cam.screenFlash }, flash]} />
        </PhoneFrame>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shot,
            { width: phoneW - 12, height: phoneH - 12, borderRadius: phoneW * 0.13, left: 6, top: 6 },
            shot,
          ]}>
          <Image source={WELCOME_PHOTOS.capture} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.sticker}>
            <Text style={[styles.stickerText, { color: cam.label }]}>{translate('welcome.demo.sticker')}</Text>
          </View>
        </Animated.View>
      </View>
      <Animated.View style={[styles.sendRow, { right: width * 0.04, top: height * 0.5 }, sendRow]}>
        {FRIEND_AVATARS.map((photo, index) => (
          <View key={index} style={index > 0 ? styles.avatarOverlap : undefined}>
            <Avatar photo={photo} size={34} />
          </View>
        ))}
      </Animated.View>
      <Animated.View style={[styles.sentPill, { right: width * 0.04, top: height * 0.5 + 46 }, sent]}>
        <Pill icon="checkCircleFill" label={translate('welcome.demo.sent')} tint={colors.accent} />
      </Animated.View>
    </View>
  );
}

// #endregion

// #region 3. Ephemeral: the timer runs out and the picture dissolves

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 58;
const RING_STROKE = 5;
const RING_R = (RING - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_R;

// The screenshot toast, a tick as the ring runs out, the dissolve, and Opened.
const EPHEMERAL_BEATS: readonly SceneBeat[] = [
  { at: 0.28, feel: 'rigid' },
  { at: 0.62, feel: 'medium' },
  { at: 0.7, feel: 'soft' },
  { at: 0.8, feel: 'light' },
];

export function EphemeralScene({ active, width, height, motionEnabled }: SceneProps) {
  const { t: translate } = useTranslation();
  const { colors } = useAppTheme();
  const t = useSceneTimeline(active, 5600, motionEnabled, 0.42);
  useSceneBeats(active, 5600, motionEnabled, EPHEMERAL_BEATS);
  const cardW = Math.min(width * 0.6, height * 0.56);
  const cardH = cardW * 1.5;

  const card = useAnimatedStyle(() => {
    const inP = appear(t.get(), 0, 0.1);
    const out = easeInOut(seg(t.get(), 0.64, 0.78));
    return {
      opacity: inP * (1 - out),
      transform: [{ scale: (0.92 + 0.08 * easeOut(seg(t.get(), 0, 0.1))) * (1 - 0.06 * out) }],
    };
  });
  const blur = useAnimatedStyle(() => ({ opacity: easeOut(seg(t.get(), 0.6, 0.72)) }));
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_LENGTH * seg(t.get(), 0.12, 0.62),
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: appear(t.get(), 0.08, 0.14) * (1 - seg(t.get(), 0.62, 0.68)),
  }));
  const opened = useAnimatedStyle(() => {
    const p = appear(t.get(), 0.76, 0.84, true);
    return { opacity: Math.min(1, p * 1.4), transform: [{ scale: 0.7 + 0.3 * p }] };
  });
  const toast = useAnimatedStyle(() => {
    const inP = easeOut(seg(t.get(), 0.26, 0.33));
    const out = easeOut(seg(t.get(), 0.52, 0.58));
    return { opacity: inP * (1 - out), transform: [{ translateY: -24 + 24 * inP - 24 * out }] };
  });

  return (
    <View style={[styles.stage, { width, height }]}>
      <Animated.View style={[styles.ephemeralCard, { width: cardW, height: cardH, borderRadius: cardW * 0.1 }, card]}>
        <Image source={WELCOME_PHOTOS.ephemeral} style={StyleSheet.absoluteFill} contentFit="cover" />
        <Animated.View style={[StyleSheet.absoluteFill, blur]}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[styles.ring, ring]}>
          <Svg width={RING} height={RING}>
            <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={cam.cinemaTrack} strokeWidth={RING_STROKE} fill={cam.cinemaScrim} />
            <AnimatedCircle
              cx={RING / 2}
              cy={RING / 2}
              r={RING_R}
              stroke={colors.accent}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${RING_LENGTH} ${RING_LENGTH}`}
              animatedProps={ringProps}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={styles.ringIcon}>
              <Icon name="timer" size={20} color={cam.label} />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.openedChip, opened]}>
        <Pill icon="statusPhotoOpened" label={translate('welcome.demo.opened')} tint={colors.accent} />
      </Animated.View>
      <Animated.View style={[styles.toast, toast]}>
        <Pill icon="privacySecurity" label={translate('welcome.demo.screenshotBlocked')} tint={colors.accent} />
      </Animated.View>
    </View>
  );
}

// #endregion

// #region 4. Chat: bubbles, a voice message, a Tapback and a reply

const WAVE_BARS = [0.45, 0.8, 0.55, 1, 0.7, 0.4, 0.9, 0.6, 0.35, 0.75, 0.5, 0.85, 0.45, 0.6];

// Each bubble arriving, the Tapback, and the reply.
const CHAT_BEATS: readonly SceneBeat[] = [
  { at: 0.06, feel: 'light' },
  { at: 0.18, feel: 'light' },
  { at: 0.32, feel: 'light' },
  { at: 0.48, feel: 'medium' },
  { at: 0.62, feel: 'light' },
];

export function ChatScene({ active, width, height, motionEnabled }: SceneProps) {
  const ink = useStageInk();
  const { t: translate } = useTranslation();
  const { colors } = useAppTheme();
  const t = useSceneTimeline(active, 7200, motionEnabled, 0.7);
  useSceneBeats(active, 7200, motionEnabled, CHAT_BEATS);
  const phoneH = height * 0.96;
  const phoneW = phoneH * 0.49;
  const bubbleMax = phoneW * 0.74;

  // The thread scrolls up by one bubble when the reply lands.
  const thread = useAnimatedStyle(() => ({
    transform: [{ translateY: -easeInOut(seg(t.get(), 0.6, 0.68)) * 58 }],
    opacity: cycleFade(t.get()),
  }));

  return (
    <View style={[styles.stage, { width, height }]}>
      <PhoneFrame width={phoneW} height={phoneH}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ink.systemBackground }]} />
        <View style={[styles.chatHeader, { paddingTop: phoneW * 0.16 }]}>
          <Image source={OLA_FACE} style={styles.chatHeaderAvatar} contentFit="cover" />
          <Text style={[styles.chatHeaderName, { color: ink.label }]}>{translate('welcome.demo.chatName')}</Text>
        </View>
        <Animated.View style={[styles.thread, thread]}>
          <ChatBubble t={t} start={0.04} own={false} maxWidth={bubbleMax}>
            <Text style={[styles.bubbleText, { color: ink.label }]}>{translate('welcome.demo.message1')}</Text>
          </ChatBubble>
          <ChatBubble t={t} start={0.16} own maxWidth={bubbleMax} accent={colors.accent} tapbackAt={0.46}>
            <Text style={[styles.bubbleText, { color: colors.onAccent }]}>{translate('welcome.demo.message2')}</Text>
          </ChatBubble>
          <ChatBubble t={t} start={0.3} own={false} maxWidth={bubbleMax}>
            <VoiceWave t={t} color={ink.label} accent={colors.accent} />
          </ChatBubble>
          <ChatBubble t={t} start={0.6} own maxWidth={bubbleMax} accent={colors.accent}>
            <View style={[styles.quote, { borderLeftColor: colors.onAccent }]}>
              <Text style={[styles.quoteText, { color: colors.onAccent }]} numberOfLines={1}>
                {translate('welcome.demo.message1')}
              </Text>
            </View>
            <Text style={[styles.bubbleText, { color: colors.onAccent }]}>{translate('welcome.demo.reply')}</Text>
          </ChatBubble>
          <TypingDots t={t} />
        </Animated.View>
      </PhoneFrame>
    </View>
  );
}

function ChatBubble({
  t,
  start,
  own,
  maxWidth,
  accent,
  tapbackAt,
  children,
}: {
  t: SharedValue<number>;
  start: number;
  own: boolean;
  maxWidth: number;
  accent?: string;
  tapbackAt?: number;
  children: ReactNode;
}) {
  const ink = useStageInk();
  const style = useAnimatedStyle(() => {
    const p = appear(t.get(), start, start + 0.08, true);
    return {
      opacity: Math.min(1, p * 1.6),
      transform: [{ translateY: (1 - Math.min(1, p)) * 18 }, { scale: 0.9 + 0.1 * p }],
    };
  });
  const tapback = useAnimatedStyle(() => {
    if (tapbackAt == null) return { opacity: 0 };
    const p = appear(t.get(), tapbackAt, tapbackAt + 0.07, true);
    return { opacity: Math.min(1, p * 1.5), transform: [{ scale: 0.3 + 0.7 * p }] };
  });
  return (
    <Animated.View
      style={[
        styles.bubble,
        own ? styles.bubbleOwn : styles.bubbleIncoming,
        { maxWidth, backgroundColor: own ? accent : ink.chatBubbleIncoming },
        style,
      ]}>
      {children}
      {tapbackAt != null ? (
        <Animated.View style={[styles.tapback, { backgroundColor: ink.secondarySystemBackground, borderColor: ink.systemBackground }, tapback]}>
          <Text style={styles.tapbackGlyph}>❤️</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function VoiceWave({ t, color, accent }: { t: SharedValue<number>; color: string; accent: string }) {
  return (
    <View style={styles.voice}>
      <Icon name="playFill" size={13} color={color} />
      <View style={styles.wave}>
        {WAVE_BARS.map((level, index) => (
          <WaveBar key={index} t={t} level={level} index={index} color={color} accent={accent} />
        ))}
      </View>
    </View>
  );
}

function WaveBar({
  t,
  level,
  index,
  color,
  accent,
}: {
  t: SharedValue<number>;
  level: number;
  index: number;
  color: string;
  accent: string;
}) {
  // Playback sweeps across the bars; the bars still ahead of it breathe.
  const style = useAnimatedStyle(() => {
    const played = seg(t.get(), 0.38, 0.58) * WAVE_BARS.length > index;
    const pulse = 0.8 + 0.2 * Math.sin((t.get() * 9 + index * 0.4) * Math.PI * 2);
    return {
      backgroundColor: played ? accent : color,
      transform: [{ scaleY: level * (played ? 1 : pulse) }],
    };
  });
  return <Animated.View style={[styles.waveBar, style]} />;
}

function TypingDots({ t }: { t: SharedValue<number> }) {
  const ink = useStageInk();
  const container = useAnimatedStyle(() => ({ opacity: appear(t.get(), 0.74, 0.8) }));
  return (
    <Animated.View style={[styles.bubble, styles.bubbleIncoming, styles.typing, { backgroundColor: ink.chatBubbleIncoming }, container]}>
      {[0, 1, 2].map((index) => (
        <TypingDot key={index} t={t} index={index} />
      ))}
    </Animated.View>
  );
}

function TypingDot({ t, index }: { t: SharedValue<number>; index: number }) {
  const ink = useStageInk();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, Math.sin((t.get() * 14 - index * 0.18) * Math.PI * 2)) * 3 }],
  }));
  return <Animated.View style={[styles.typingDot, { backgroundColor: ink.secondaryLabel }, style]} />;
}

// #endregion

// #region 5. Memories: the album fills in, then one memory zooms open

const GRID = 3;
// Nine different moments; the centre one (ZOOM_CELL) opens full size, so it is a full scene photo.
const GRID_PHOTOS = [
  MEMORY_TILES.coffee,
  WELCOME_PHOTOS.welcome,
  MEMORY_TILES.dog,
  MEMORY_TILES.skate,
  WELCOME_PHOTOS.memories,
  MEMORY_TILES.hike,
  MEMORY_TILES.cake,
  MEMORY_TILES.city,
  OLA_FACE,
];
const ZOOM_CELL = 4;

// The album filling in, then the memory zooming open and closing.
const MEMORIES_BEATS: readonly SceneBeat[] = [
  { at: 0.06, feel: 'soft' },
  { at: 0.14, feel: 'soft' },
  { at: 0.22, feel: 'soft' },
  { at: 0.34, feel: 'light' },
  { at: 0.56, feel: 'medium' },
  { at: 0.86, feel: 'soft' },
];

export function MemoriesScene({ active, width, height, motionEnabled }: SceneProps) {
  const { t: translate } = useTranslation();
  const { colors } = useAppTheme();
  const t = useSceneTimeline(active, 6600, motionEnabled, 0.36);
  useSceneBeats(active, 6600, motionEnabled, MEMORIES_BEATS);
  const gap = 6;
  const gridSize = Math.min(width * 0.78, height * 0.82);
  const cell = (gridSize - gap * (GRID - 1)) / GRID;

  const badge = useAnimatedStyle(() => {
    const p = appear(t.get(), 0.3, 0.38, true);
    return { opacity: Math.min(1, p * 1.4), transform: [{ translateY: (1 - p) * 14 }] };
  });

  return (
    <View style={[styles.stage, { width, height }]}>
      <View style={{ width: gridSize, height: gridSize }}>
        {GRID_PHOTOS.map((photo, index) => (
          <GridCell
            key={index}
            t={t}
            index={index}
            photo={photo}
            cell={cell}
            gap={gap}
            gridSize={gridSize}
          />
        ))}
      </View>
      <Animated.View style={[styles.memoriesBadge, { top: height / 2 + gridSize / 2 + 14 }, badge]}>
        <Pill icon="lock" label={translate('welcome.demo.encrypted')} tint={colors.accent} />
      </Animated.View>
    </View>
  );
}

function GridCell({
  t,
  index,
  photo,
  cell,
  gap,
  gridSize,
}: {
  t: SharedValue<number>;
  index: number;
  photo: ImageSource;
  cell: number;
  gap: number;
  gridSize: number;
}) {
  const row = Math.floor(index / GRID);
  const column = index % GRID;
  const left = column * (cell + gap);
  const top = row * (cell + gap);
  const zooms = index === ZOOM_CELL;
  const style = useAnimatedStyle(() => {
    const inP = appear(t.get(), 0.02 + index * 0.025, 0.14 + index * 0.025, true);
    // Zoom the centre memory open (like the real grid → viewer transition) and back.
    const open = easeInOut(seg(t.get(), 0.48, 0.58)) * (1 - easeInOut(seg(t.get(), 0.78, 0.88)));
    const zoomScale = zooms ? 1 + open * (gridSize / cell - 1) : 1;
    const dim = zooms ? 1 : 1 - open * 0.75;
    return {
      opacity: Math.min(1, inP * 1.5) * dim,
      zIndex: zooms ? 2 : 1,
      transform: [{ scale: (0.7 + 0.3 * Math.min(1, inP)) * zoomScale }],
    };
  });
  return (
    <Animated.View style={[styles.gridCell, { width: cell, height: cell, left, top, borderRadius: 8 }, style]}>
      <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

// #endregion

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: {
    borderWidth: 5,
    overflow: 'hidden',
  },
  phoneScreen: {
    flex: 1,
    overflow: 'hidden',
    margin: 1,
  },
  island: {
    position: 'absolute',
    alignSelf: 'center',
    height: 18,
    borderRadius: 9,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pillText: {
    ...typography.footnote,
    fontWeight: '600',
  },
  avatar: {
    overflow: 'hidden',
    borderWidth: 2,
  },
  fanCard: {
    position: 'absolute',
    overflow: 'hidden',
  },
  floatingEmoji: {
    position: 'absolute',
    fontSize: 34,
  },
  appIcon: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 3,
  },
  sticker: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: darkColors.cinemaScrim,
  },
  stickerText: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 20,
    fontWeight: '800',
  },
  shutterRing: {
    position: 'absolute',
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  shot: {
    position: 'absolute',
    overflow: 'hidden',
  },
  sendRow: {
    position: 'absolute',
    flexDirection: 'row',
  },
  avatarOverlap: {
    marginLeft: -8,
  },
  sentPill: {
    position: 'absolute',
  },
  ephemeralCard: {
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: RING,
    height: RING,
  },
  ringIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openedChip: {
    position: 'absolute',
  },
  toast: {
    position: 'absolute',
    top: 0,
  },
  chatHeader: {
    alignItems: 'center',
    gap: 4,
  },
  chatHeaderAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  chatHeaderName: {
    ...typography.caption,
    fontWeight: '600',
  },
  thread: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 26,
    gap: 12,
  },
  bubble: {
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
  },
  bubbleIncoming: {
    alignSelf: 'flex-start',
  },
  bubbleText: {
    ...typography.footnote,
  },
  tapback: {
    position: 'absolute',
    top: -12,
    left: -10,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapbackGlyph: {
    fontSize: 13,
  },
  quote: {
    borderLeftWidth: 2,
    paddingLeft: 6,
    marginBottom: 3,
    opacity: 0.75,
  },
  quoteText: {
    ...typography.caption,
  },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 18,
  },
  waveBar: {
    width: 2.5,
    height: 18,
    borderRadius: 1.25,
  },
  typing: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 10,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gridCell: {
    position: 'absolute',
    overflow: 'hidden',
  },
  memoriesBadge: {
    position: 'absolute',
  },
});
