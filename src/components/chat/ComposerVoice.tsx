import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SymbolView } from 'expo-symbols';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useComposerVoice, type ComposerVoiceState } from '../../hooks/useComposerVoice';
import { useStableHandler } from '../../hooks/useStableHandler';
import type { VoiceRecordingResult } from '../../hooks/useVoiceRecorder';
import { selection } from '../../lib/haptics';
import { formatVoiceDuration } from '../../lib/chatMessageExtras';
import {
  VOICE_CANCEL_DISTANCE,
  voiceCancelProgress,
} from '../../lib/voiceMessage';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { useMotionEnabled } from '../../theme/motion';
import { typography } from '../../theme/typography';
import type { ChatScreenViewModel } from '../../hooks/useChatScreen';

type Translate = ChatScreenViewModel['t'];


/** The mic in place of Send while the draft is empty. */
export function VoiceMicButton({
  t,
  voice,
  size,
  renderShell,
}: {
  t: Translate;
  voice: ComposerVoiceState;
  size: number;
  /** Wraps the glyph in the composer's glass / fallback circle. */
  renderShell: (glyph: ReactNode) => ReactNode;
}) {
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const { dragX, recording } = voice;
  const onBegin = useStableHandler(() => void voice.begin());
  const onRelease = useStableHandler((cancelled: boolean) => void voice.release(cancelled));

  const gesture = useMemo(() => {
    return Gesture.Pan()
      .minDistance(0)
      .shouldCancelWhenOutside(false)
      .onBegin(() => {
        dragX.set(0);
        scheduleOnRN(onBegin);
      })
      .onUpdate((event) => {
        dragX.set(Math.min(0, event.translationX));
      })
      .onFinalize((event) => {
        const cancelled = event.translationX <= -VOICE_CANCEL_DISTANCE;
        // Reduce Motion: snap back without the spring.
        dragX.set(motionEnabled ? withSpring(0, { duration: 300, dampingRatio: 0.8 }) : 0);
        scheduleOnRN(onRelease, cancelled);
      });
  }, [dragX, motionEnabled, onBegin, onRelease]);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.get() }],
  }));
  // Grows while recording so the finger does not hide the whole control (none with Reduce Motion).
  const grown = recording && motionEnabled ? styles.micGrown : null;

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === 'activate') {
      if (recording) void voice.release(false);
      else void voice.begin();
    } else if (name === 'cancelRecording' || name === 'escape') {
      if (recording) void voice.release(true);
    }
  };

  const glyph = (
    <SymbolView
      name={resolveAppIconName(recording ? 'micFill' : 'mic')}
      size={APP_ICON_SIZE.md}
      tintColor={recording ? colors.destructive : colors.accent}
      weight="semibold"
    />
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        style={[{ width: size, height: size }, buttonStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={recording ? t('chat.voiceStopAndSend') : t('chat.voiceRecord')}
        accessibilityHint={recording ? undefined : t('chat.voiceRecordHint')}
        accessibilityState={{ busy: recording }}
        accessibilityActions={[
          { name: 'activate' },
          { name: 'escape' },
          ...(recording ? [{ name: 'cancelRecording', label: t('chat.voiceCancelRecording') }] : []),
        ]}
        onAccessibilityAction={onAccessibilityAction}>
        <View style={grown}>{renderShell(glyph)}</View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Replaces the text field while recording: red dot, timer and the slide-to-cancel hint. */
export function VoiceRecordingStrip({
  t,
  elapsedMs,
  level,
  dragX,
}: {
  t: Translate;
  elapsedMs: number;
  level: SharedValue<number>;
  dragX: SharedValue<number>;
}) {
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const [armed, setArmed] = useState(false);
  const pulse = useSharedValue(1);

  useEffect(() => {
    // Reduce Motion: a steady dot.
    pulse.set(motionEnabled ? withRepeat(withTiming(0.35, { duration: 700 }), -1, true) : 1);
  }, [motionEnabled, pulse]);

  // One selection haptic when the slide reaches the cancel point (and when it comes back).
  useAnimatedReaction(
    () => voiceCancelProgress(dragX.get()) >= 1,
    (isArmed, wasArmed) => {
      if (wasArmed === null || isArmed === wasArmed) return;
      scheduleOnRN(setArmed, isArmed);
      scheduleOnRN(selection);
    },
  );

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.get(),
    transform: [{ scale: motionEnabled ? 1 + level.get() * 0.6 : 1 }],
  }));
  const hintStyle = useAnimatedStyle(() => ({
    opacity: 1 - voiceCancelProgress(dragX.get()) * 0.5,
    transform: [{ translateX: motionEnabled ? dragX.get() * 0.35 : 0 }],
  }));

  const time = formatVoiceDuration(elapsedMs);
  return (
    <View
      style={styles.strip}
      accessible
      accessibilityLabel={t('chat.voiceRecordingA11y', { time })}>
      <Animated.View style={[styles.dot, { backgroundColor: colors.destructive }, dotStyle]} />
      <Text style={[styles.timer, { color: colors.label }]}>{time}</Text>
      <Animated.View style={[styles.hint, hintStyle]}>
        <SymbolView
          name={resolveAppIconName('chevronLeft')}
          size={APP_ICON_SIZE.xs}
          tintColor={armed ? colors.destructive : colors.secondaryLabel}
          weight="semibold"
        />
        <Text
          numberOfLines={1}
          style={[styles.hintText, { color: armed ? colors.destructive : colors.secondaryLabel }]}>
          {armed ? t('chat.voiceReleaseToCancel') : t('chat.voiceSlideToCancel')}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  micGrown: {
    transform: [{ scale: 1.15 }],
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
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
  hint: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  hintText: {
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
