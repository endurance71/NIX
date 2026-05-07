import { setAudioModeAsync, type AudioMode } from 'expo-audio';
import { trackEvent } from './telemetry';

export type AudioSessionMode = 'playback' | 'recording';

const PLAYBACK_MODE: Partial<AudioMode> = {
  playsInSilentMode: true,
  allowsRecording: false,
  interruptionMode: 'doNotMix',
  shouldPlayInBackground: false,
};

const RECORDING_MODE: Partial<AudioMode> = {
  playsInSilentMode: true,
  allowsRecording: true,
  interruptionMode: 'doNotMix',
  shouldPlayInBackground: false,
};

let lastConfiguredMode: AudioSessionMode | null = null;
let pendingPromise: Promise<void> | null = null;
const IOS_AUDIO_INSUFFICIENT_PRIORITY_CODE = '561017449';
const IOS_AUDIO_INSUFFICIENT_PRIORITY_FOURCC = '!pri';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [180, 420];

export function getCurrentAudioSessionMode(): AudioSessionMode | null {
  return lastConfiguredMode;
}

/**
 * Tylko dla testów — pozwala wyzerować pamięć trybu między przypadkami.
 */
export function __resetAudioSessionForTests() {
  lastConfiguredMode = null;
  pendingPromise = null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

function isInsufficientPriorityError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes(IOS_AUDIO_INSUFFICIENT_PRIORITY_CODE) ||
    msg.includes(IOS_AUDIO_INSUFFICIENT_PRIORITY_FOURCC) ||
    msg.includes('insufficientpriority')
  );
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyMode(mode: AudioSessionMode, modeConfig: Partial<AudioMode>) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await setAudioModeAsync(modeConfig);
      lastConfiguredMode = mode;
      trackEvent('audio_session_set', { mode, status: 'success', attempts: attempt });
      return;
    } catch (error) {
      lastError = error;
      const retriable = isInsufficientPriorityError(error) && attempt < MAX_RETRY_ATTEMPTS;

      trackEvent('audio_session_set_retry', {
        mode,
        attempt,
        retriable,
        error_message: getErrorMessage(error),
      });

      if (!retriable) {
        trackEvent('audio_session_set', {
          mode,
          status: 'failure',
          attempts: attempt,
          error_message: getErrorMessage(error),
        });
        throw error;
      }

      await waitMs(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    }
  }

  trackEvent('audio_session_set', {
    mode,
    status: 'failure',
    attempts: MAX_RETRY_ATTEMPTS,
    error_message: getErrorMessage(lastError),
  });
  throw lastError;
}

/**
 * Ustawia sesję audio iOS w tryb odtwarzania (`playback`) — kompatybilny z silent switchem
 * i czyszczący ślady kategorii `playAndRecord` po `expo-camera`.
 *
 * Idempotentny: kolejne wywołania w tym samym trybie nie wołają natywnego API.
 */
export async function configureForPlayback(): Promise<void> {
  if (lastConfiguredMode === 'playback') return;
  if (pendingPromise) return pendingPromise;
  pendingPromise = applyMode('playback', PLAYBACK_MODE).finally(() => {
    pendingPromise = null;
  });
  return pendingPromise;
}

/**
 * Ustawia sesję audio iOS w tryb nagrywania. `expo-camera` zwykle robi to automatycznie,
 * ale jawne ustawienie zabezpiecza przed wyścigami przy starcie nagrania tuż po `playback`.
 */
export async function configureForRecording(): Promise<void> {
  if (lastConfiguredMode === 'recording') return;
  if (pendingPromise) return pendingPromise;
  pendingPromise = applyMode('recording', RECORDING_MODE).finally(() => {
    pendingPromise = null;
  });
  return pendingPromise;
}
