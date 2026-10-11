import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useComposerVoice, type ComposerVoiceState } from '../../hooks/useComposerVoice';
import type { VoiceRecordingResult } from '../../hooks/useVoiceRecorder';
import { configureForPlayback } from '../../lib/audioSession';
import { formatVoiceDuration } from '../../lib/chatMessageExtras';
import { VOICE_METERING_INTERVAL_MS } from '../../lib/voiceMessage';
import { APP_ICON_SIZE } from '../../theme/app-icons';
import { useMotionEnabled } from '../../theme/motion';
import { typography } from '../../theme/typography';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import type { ChatScreenViewModel } from '../../hooks/useChatScreen';

type Translate = ChatScreenViewModel['t'];

const STRIP_BUTTON_SIZE = 32;
const SPECTRUM_BARS = 48;
const SPECTRUM_HEIGHT = 22;
const SPECTRUM_BAR_WIDTH = 3;
const SPECTRUM_GAP = 3;
/** One bar per metering sample; the row glides by this much between samples. */
const SPECTRUM_STEP = SPECTRUM_BAR_WIDTH + SPECTRUM_GAP;
const SPECTRUM_FLOOR = 0.08;
const SPECTRUM_KEYS = Array.from({ length: SPECTRUM_BARS }, (_, index) => `spectrum-${index}`);
const EMPTY_SPECTRUM: number[] = Array.from({ length: SPECTRUM_BARS }, () => 0);

function SpectrumBar({
  index,
  samples,
  color,
}: {
  index: number;
  samples: SharedValue<number[]>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const value = samples.get()[index] ?? 0;
    return {
      height: Math.max(
        SPECTRUM_BAR_WIDTH,
        (SPECTRUM_FLOOR + value * (1 - SPECTRUM_FLOOR)) * SPECTRUM_HEIGHT,
      ),
    };
  });
  return <Animated.View style={[styles.spectrumBar, { backgroundColor: color }, style]} />;
}

/**
 * Live loudness bars while recording, newest entering on the right and the row gliding left at
 * display rate (like Voice Memos). Everything runs on the UI thread: a frame callback takes a
 * sample of the recorder's level every metering interval and moves the row in between, so the
 * motion stays smooth although the meter itself updates ~10× per second. A still line with
 * Reduce Motion.
 */
function LiveSpectrum({ level, color }: { level: SharedValue<number>; color: string }) {
  const motionEnabled = useMotionEnabled();
  const samples = useSharedValue<number[]>(EMPTY_SPECTRUM);
  const offset = useSharedValue(0);
  const lastSampleAt = useSharedValue(-1);

  useFrameCallback((frame) => {
    'worklet';
    const now = frame.timeSinceFirstFrame;
    if (lastSampleAt.get() < 0 || now - lastSampleAt.get() >= VOICE_METERING_INTERVAL_MS) {
      lastSampleAt.set(now);
      const next = samples.get().slice(1);
      next.push(Math.max(0, Math.min(1, level.get())));
      samples.set(next);
    }
    const progress = Math.min(1, (now - lastSampleAt.get()) / VOICE_METERING_INTERVAL_MS);
    offset.set(SPECTRUM_STEP * (1 - progress));
  }, motionEnabled);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  return (
    <View
      style={styles.spectrum}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.spectrumRow, rowStyle]}>
        {SPECTRUM_KEYS.map((key, index) => (
          <SpectrumBar key={key} index={index} samples={samples} color={color} />
        ))}
      </Animated.View>
    </View>
  );
}

/** Replaces the text field while recording: discard, a pulsing red dot and the timer. */
export function VoiceRecordingStrip({
  t,
  elapsedMs,
  level,
  onCancel,
}: {
  t: Translate;
  elapsedMs: number;
  level: SharedValue<number>;
  onCancel: () => void;
}) {
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const pulse = useSharedValue(1);

  useEffect(() => {
    // Reduce Motion: a steady dot.
    pulse.set(motionEnabled ? withRepeat(withTiming(0.35, { duration: 700 }), -1, true) : 1);
  }, [motionEnabled, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.get(),
    transform: [{ scale: motionEnabled ? 1 + level.get() * 0.6 : 1 }],
  }));

  const time = formatVoiceDuration(elapsedMs);
  return (
    <View style={styles.strip}>
      <NativeChromeIconButton
        name="trash"
        size={STRIP_BUTTON_SIZE}
        iconSize={APP_ICON_SIZE.sm}
        backgroundColor="transparent"
        tintColor={colors.destructive}
        chromeVariant="solid"
        onPress={onCancel}
        accessibilityLabel={t('chat.voiceCancelRecording')}
      />
      <View
        style={styles.stripBody}
        accessible
        accessibilityLabel={t('chat.voiceRecordingA11y', { time })}>
        <Animated.View style={[styles.dot, { backgroundColor: colors.destructive }, dotStyle]} />
        <Text style={[styles.timer, { color: colors.label }]}>{time}</Text>
        <LiveSpectrum level={level} color={colors.destructive} />
      </View>
    </View>
  );
}

/** The finished take before sending: discard, listen (play / pause) and its length. */
export function VoiceReviewStrip({
  t,
  recording,
  onDiscard,
}: {
  t: Translate;
  recording: VoiceRecordingResult;
  onDiscard: () => void;
}) {
  const { colors } = useAppTheme();
  const player = useAudioPlayer({ uri: recording.uri });
  const status = useAudioPlayerStatus(player);

  // Back to the start once it has played through, ready to listen again.
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      void player.seekTo(0);
    }
  }, [player, status.didJustFinish]);

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    void configureForPlayback()
      .catch(() => undefined)
      .then(() => player.play());
  };

  const playedMs = Math.round((status.currentTime ?? 0) * 1000);
  const shownMs = status.playing || playedMs > 0 ? playedMs : recording.durationMs;
  const time = formatVoiceDuration(shownMs);
  return (
    <View style={styles.strip}>
      <NativeChromeIconButton
        name="trash"
        size={STRIP_BUTTON_SIZE}
        iconSize={APP_ICON_SIZE.sm}
        backgroundColor="transparent"
        tintColor={colors.destructive}
        chromeVariant="solid"
        onPress={onDiscard}
        accessibilityLabel={t('chat.voiceDiscard')}
      />
      <NativeChromeIconButton
        name={status.playing ? 'pauseFill' : 'playFill'}
        size={STRIP_BUTTON_SIZE}
        iconSize={APP_ICON_SIZE.sm}
        backgroundColor="transparent"
        tintColor={colors.accent}
        chromeVariant="solid"
        onPress={toggle}
        accessibilityLabel={status.playing ? t('chat.voicePause') : t('chat.voicePlay')}
      />
      <Text
        style={[styles.timer, { color: colors.label }]}
        accessibilityLabel={t('chat.voiceMessageA11y', { duration: formatVoiceDuration(recording.durationMs) })}>
        {time}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  stripBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timer: {
    ...typography.body,
    fontVariant: ['tabular-nums'],
    minWidth: 40,
  },
  spectrum: {
    flex: 1,
    height: SPECTRUM_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  spectrumRow: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPECTRUM_GAP,
  },
  spectrumBar: {
    width: SPECTRUM_BAR_WIDTH,
    borderRadius: SPECTRUM_BAR_WIDTH / 2,
  },
});

/** Mounts the recorder only where the backend supports voice messages. */
export function ComposerVoiceHost({
  t,
  onSend,
  onRecordingStart,
  children,
}: {
  t: Translate;
  onSend: (recording: VoiceRecordingResult) => void;
  onRecordingStart: () => void;
  children: (voice: ComposerVoiceState) => ReactNode;
}) {
  const voice = useComposerVoice({ t, onSend, onRecordingStart });
  return <>{children(voice)}</>;
}
