import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
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
import { APP_ICON_SIZE } from '../../theme/app-icons';
import { useMotionEnabled } from '../../theme/motion';
import { typography } from '../../theme/typography';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import type { ChatScreenViewModel } from '../../hooks/useChatScreen';

type Translate = ChatScreenViewModel['t'];

const STRIP_BUTTON_SIZE = 32;

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
        <Text numberOfLines={1} style={[styles.status, { color: colors.secondaryLabel }]}>
          {t('chat.voiceRecordingLabel')}
        </Text>
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
  status: {
    ...typography.footnote,
    flexShrink: 1,
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
