import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { typography } from '../../theme/typography';
import { formatVoiceDuration } from '../../lib/chatMessageExtras';
import { waveformBars } from '../../lib/voiceMessage';
import { useVoicePhase, useVoiceProgress } from '../../hooks/useChatVoicePlayback';

const BAR_COUNT = 28;
/** Stable keys for the fixed set of bars. */
const BAR_KEYS = Array.from({ length: BAR_COUNT }, (_, index) => `bar-${index}`);
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const WAVEFORM_HEIGHT = 26;
const PLAY_BUTTON_SIZE = 32;

/**
 * Play/pause, loudness bars (captured while recording) and the duration. The whole bubble is the
 * control (its Pressable toggles playback and carries the VoiceOver label/actions), so this view
 * is purely visual.
 */
export const VoiceMessageBody = memo(function VoiceMessageBody({
  messageId,
  durationMs,
  waveform,
  color,
  buttonFill,
  buttonGlyph,
}: {
  messageId: string;
  durationMs: number;
  waveform: readonly number[];
  /** Bars and duration (the bubble's label colour). */
  color: string;
  buttonFill: string;
  buttonGlyph: string;
}) {
  const phase = useVoicePhase(messageId);
  const progress = useVoiceProgress(messageId);
  const bars = waveformBars(waveform, BAR_COUNT);
  const playedBars = Math.round(progress * BAR_COUNT);
  const active = phase !== 'idle';
  // While playing, the label counts down what is left (iMessage); otherwise the full length.
  const shownMs = active ? Math.max(0, durationMs * (1 - progress)) : durationMs;

  return (
    <View
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.playButton, { backgroundColor: buttonFill }]}>
        {phase === 'loading' ? (
          <ActivityIndicator size="small" color={buttonGlyph} />
        ) : (
          <SymbolView
            name={resolveAppIconName(phase === 'playing' ? 'pauseFill' : 'playFill')}
            size={APP_ICON_SIZE.sm}
            tintColor={buttonGlyph}
            weight="bold"
          />
        )}
      </View>
      <View style={styles.waveform}>
        {BAR_KEYS.map((key, index) => (
          <View
            key={key}
            style={[
              styles.bar,
              {
                height: Math.max(BAR_WIDTH, Math.round((bars[index] ?? 0) * WAVEFORM_HEIGHT)),
                backgroundColor: color,
                opacity: active && index < playedBars ? 1 : 0.45,
              },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.duration, { color }]}>{formatVoiceDuration(shownMs)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: PLAY_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    height: WAVEFORM_HEIGHT,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
  duration: {
    ...typography.footnote,
    fontVariant: ['tabular-nums'],
    minWidth: 34,
    textAlign: 'right',
  },
});
