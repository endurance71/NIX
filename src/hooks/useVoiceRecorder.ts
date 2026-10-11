import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useSharedValue } from 'react-native-reanimated';
import { configureForPlayback, configureForRecording } from '../lib/audioSession';
import {
  downsampleWaveform,
  meteringToLevel,
  VOICE_MAX_DURATION_MS,
  VOICE_METERING_INTERVAL_MS,
} from '../lib/voiceMessage';
import { deleteLocalRecording } from '../services/voiceMessageService';

/** Mono AAC (.m4a): ~0.5 MB per minute, plenty for speech. */
const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

export type VoiceRecordingResult = { uri: string; durationMs: number; waveform: number[] };

/**
 * - `started`: recording now
 * - `permissionPrompted`: iOS just asked; the finger is long gone, hold again
 * - `blocked`: denied earlier, only Settings can change it
 * - `denied` / `failed` / `cancelled` (released while the session was being prepared)
 */
export type VoiceStartResult = 'started' | 'permissionPrompted' | 'blocked' | 'denied' | 'failed' | 'cancelled';

export function useVoiceRecorder({ onMaxDuration }: { onMaxDuration: () => void }) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  /** 0–1 live input level, read on the UI thread by the recording indicator. */
  const level = useSharedValue(0);
  const levelsRef = useRef<number[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef(0);
  const recordingRef = useRef(false);
  const maxNotifiedRef = useRef(false);
  const onMaxRef = useRef(onMaxDuration);
  useEffect(() => {
    onMaxRef.current = onMaxDuration;
  }, [onMaxDuration]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const start = useCallback(async (): Promise<VoiceStartResult> => {
    const token = ++tokenRef.current;
    levelsRef.current = [];
    maxNotifiedRef.current = false;
    setElapsedMs(0);
    try {
      const permission = await getRecordingPermissionsAsync();
      if (!permission.granted) {
        if (!permission.canAskAgain) return 'blocked';
        const requested = await requestRecordingPermissionsAsync();
        return requested.granted ? 'permissionPrompted' : 'denied';
      }
      await configureForRecording();
      // Options again on every take: a fresh file, so a take still uploading is never overwritten.
      await recorder.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
      if (token !== tokenRef.current) return 'cancelled';
      // The native recorder also stops itself at the limit, even if JS is busy.
      recorder.record({ forDuration: VOICE_MAX_DURATION_MS / 1000 });
      recordingRef.current = true;
      setRecording(true);
      pollRef.current = setInterval(() => {
        const status = recorder.getStatus();
        const current = meteringToLevel(status.metering);
        levelsRef.current.push(current);
        level.set(current / 100);
        setElapsedMs(status.durationMillis);
        if (!maxNotifiedRef.current && status.durationMillis >= VOICE_MAX_DURATION_MS - VOICE_METERING_INTERVAL_MS) {
          maxNotifiedRef.current = true;
          onMaxRef.current();
        }
      }, VOICE_METERING_INTERVAL_MS);
      return 'started';
    } catch (error) {
      console.warn('Voice recording could not start', error);
      void configureForPlayback().catch(() => undefined);
      return 'failed';
    }
  }, [level, recorder]);

  /** Stops and returns the file; `null` if nothing was recording. */
  const finish = useCallback(async (): Promise<VoiceRecordingResult | null> => {
    tokenRef.current += 1;
    stopPolling();
    level.set(0);
    if (!recordingRef.current) return null;
    recordingRef.current = false;
    setRecording(false);
    // Read before stopping: a stopped recorder reports 0.
    const durationMs = recorder.getStatus().durationMillis;
    try {
      await recorder.stop();
    } catch (error) {
      console.warn('Voice recording could not stop cleanly', error);
    }
    void configureForPlayback().catch(() => undefined);
    const uri = recorder.uri;
    if (!uri) return null;
    return { uri, durationMs, waveform: downsampleWaveform(levelsRef.current) };
  }, [level, recorder, stopPolling]);

  const cancel = useCallback(async () => {
    const result = await finish();
    deleteLocalRecording(result?.uri);
  }, [finish]);

  // A call, Siri or the app going to the background ends the take without sending it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && recordingRef.current) void cancel();
    });
    return () => subscription.remove();
  }, [cancel]);

  useEffect(
    () => () => {
      tokenRef.current += 1;
      if (pollRef.current !== null) clearInterval(pollRef.current);
      pollRef.current = null;
      if (recordingRef.current) {
        recordingRef.current = false;
        try {
          void recorder
            .stop()
            .catch(() => undefined)
            .then(() => {
              deleteLocalRecording(recorder.uri);
              void configureForPlayback().catch(() => undefined);
            });
        } catch {
          // Already released by expo-audio on unmount: nothing left to stop.
        }
      }
    },
    [recorder],
  );

  return { recording, elapsedMs, level, start, finish, cancel };
}
