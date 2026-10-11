import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Linking } from 'react-native';
import { useVoiceRecorder, type VoiceRecordingResult } from './useVoiceRecorder';
import type { ChatScreenViewModel } from './useChatScreen';
import { notifyError, notifyInfo } from '../lib/appNotify';
import { selection, tap } from '../lib/haptics';
import { formatVoiceDuration } from '../lib/chatMessageExtras';
import { voiceRecordingOutcome } from '../lib/voiceMessage';
import { deleteLocalRecording } from '../services/voiceMessageService';

type Translate = ChatScreenViewModel['t'];

/**
 * Tap-to-record with an explicit send: tap the mic to start, Stop (or the 60 s limit) ends the
 * take and shows it for review, and only Send sends it. Nothing is ever sent by releasing a finger,
 * so a stray touch cannot send a recording.
 */
export function useComposerVoice({
  t,
  onSend,
  onRecordingStart,
}: {
  t: Translate;
  onSend: (recording: VoiceRecordingResult) => void;
  onRecordingStart: () => void;
}) {
  const [pending, setPending] = useState<VoiceRecordingResult | null>(null);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);
  const voice = useVoiceRecorder({ onMaxDuration: () => void stopRef.current() });

  /** Ends the take and keeps it for review (too short: discarded with a hint). */
  const stop = async () => {
    const result = await voice.finish();
    if (!result) return;
    if (voiceRecordingOutcome({ durationMs: result.durationMs, cancelled: false }) !== 'send') {
      deleteLocalRecording(result.uri);
      notifyInfo(t('chat.voiceTooShort'));
      return;
    }
    tap('light');
    setPending(result);
    AccessibilityInfo.announceForAccessibility(
      t('chat.voiceReviewA11y', { time: formatVoiceDuration(result.durationMs) }),
    );
  };
  useEffect(() => {
    stopRef.current = stop;
  });

  const start = async () => {
    if (pending || voice.recording) return;
    onRecordingStart();
    const result = await voice.start();
    switch (result) {
      case 'started':
        tap('medium');
        AccessibilityInfo.announceForAccessibility(t('chat.voiceRecordingA11y', { time: '0:00' }));
        return;
      case 'permissionPrompted':
        notifyInfo(t('chat.voiceMicGranted'));
        return;
      case 'blocked':
        Alert.alert(t('chat.voiceMicBlockedTitle'), t('chat.voiceMicBlockedMessage'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('camera.openSettings'), onPress: () => void Linking.openSettings() },
        ]);
        return;
      case 'failed':
        notifyError(t('chat.voiceSendFailure'));
        return;
      default:
        return;
    }
  };

  /** Throws away the running take. */
  const cancelRecording = async () => {
    await voice.cancel();
    selection();
    AccessibilityInfo.announceForAccessibility(t('chat.voiceCancelled'));
  };

  /** Throws away the reviewed take. */
  const discard = () => {
    if (!pending) return;
    deleteLocalRecording(pending.uri);
    setPending(null);
    selection();
    AccessibilityInfo.announceForAccessibility(t('chat.voiceCancelled'));
  };

  const send = () => {
    if (!pending) return;
    tap('light');
    onSend(pending);
    setPending(null);
  };

  // A reviewed take that is never sent must not stay on disk.
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => () => deleteLocalRecording(pendingRef.current?.uri), []);

  return {
    recording: voice.recording,
    pending,
    elapsedMs: voice.elapsedMs,
    level: voice.level,
    start,
    stop,
    cancelRecording,
    discard,
    send,
  };
}

export type ComposerVoiceState = ReturnType<typeof useComposerVoice>;
