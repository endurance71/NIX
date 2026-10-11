import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Alert, Linking } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useVoiceRecorder, type VoiceRecordingResult } from './useVoiceRecorder';
import type { ChatScreenViewModel } from './useChatScreen';
import { notifyError, notifyInfo } from '../lib/appNotify';
import { selection, tap } from '../lib/haptics';
import { voiceRecordingOutcome } from '../lib/voiceMessage';
import { deleteLocalRecording } from '../services/voiceMessageService';

type Translate = ChatScreenViewModel['t'];

/**
 * Hold-to-record state for the composer: start on touch down, slide left to cancel, release to
 * send, auto-send at 60 s. VoiceOver users get a tap-to-start / tap-to-send toggle instead.
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
  const startPendingRef = useRef(false);
  const pressedRef = useRef(false);
  const releaseRef = useRef<(cancelled: boolean) => Promise<void>>(async () => undefined);
  const voice = useVoiceRecorder({ onMaxDuration: () => void releaseRef.current(false) });
  /** Finger offset (≤ 0) while holding; shared with the strip and the button. */
  const dragX = useSharedValue(0);

  const release = async (cancelled: boolean) => {
    pressedRef.current = false;
    const wasPending = startPendingRef.current;
    const result = await voice.finish();
    if (!result) {
      // Released before the recorder was ready: a tap, not a hold.
      if (wasPending && !cancelled) notifyInfo(t('chat.voiceHoldToRecord'));
      return;
    }
    const outcome = voiceRecordingOutcome({ durationMs: result.durationMs, cancelled });
    if (outcome === 'send') {
      tap('light');
      onSend(result);
      return;
    }
    deleteLocalRecording(result.uri);
    if (outcome === 'cancel') {
      selection();
      AccessibilityInfo.announceForAccessibility(t('chat.voiceCancelled'));
    } else {
      notifyInfo(t('chat.voiceHoldToRecord'));
    }
  };
  useEffect(() => {
    releaseRef.current = release;
  });

  const begin = async () => {
    pressedRef.current = true;
    startPendingRef.current = true;
    onRecordingStart();
    const result = await voice.start();
    startPendingRef.current = false;
    switch (result) {
      case 'started':
        tap('medium');
        AccessibilityInfo.announceForAccessibility(t('chat.voiceRecordingA11y', { time: '0:00' }));
        // Released while the session was starting up: treat it as a too-short take.
        if (!pressedRef.current) void release(false);
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

  return {
    recording: voice.recording,
    elapsedMs: voice.elapsedMs,
    level: voice.level,
    dragX,
    begin,
    release,
  };
}

export type ComposerVoiceState = ReturnType<typeof useComposerVoice>;
