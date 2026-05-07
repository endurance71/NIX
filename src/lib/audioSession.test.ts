import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setAudioModeAsync } from 'expo-audio';
import {
  configureForPlayback,
  configureForRecording,
  getCurrentAudioSessionMode,
  __resetAudioSessionForTests,
} from './audioSession';
import { trackEvent, setTelemetrySink } from './telemetry';

const mockSetAudioModeAsync = vi.mocked(setAudioModeAsync);

describe('audioSession', () => {
  beforeEach(() => {
    __resetAudioSessionForTests();
    mockSetAudioModeAsync.mockReset();
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    setTelemetrySink(null);
  });

  it('configureForPlayback ustawia tryb playback z poprawnymi flagami i emituje telemetri\u0119', async () => {
    const events: { event: string; payload: Record<string, unknown> }[] = [];
    setTelemetrySink((event, payload) => events.push({ event, payload }));

    await configureForPlayback();

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
      allowsRecording: false,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: false,
    });
    expect(getCurrentAudioSessionMode()).toBe('playback');
    expect(events).toEqual([
      { event: 'audio_session_set', payload: { mode: 'playback', status: 'success', attempts: 1 } },
    ]);
  });

  it('configureForRecording ustawia tryb recording z poprawnymi flagami', async () => {
    await configureForRecording();

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
      allowsRecording: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: false,
    });
    expect(getCurrentAudioSessionMode()).toBe('recording');
  });

  it('jest idempotentny dla tego samego trybu (kolejne wywo\u0142anie nie woła setAudioModeAsync)', async () => {
    await configureForPlayback();
    await configureForPlayback();
    await configureForPlayback();

    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
  });

  it('przełącza si\u0119 z playback na recording i z powrotem przy zmianie trybu', async () => {
    await configureForPlayback();
    await configureForRecording();
    await configureForPlayback();

    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(3);
    expect(getCurrentAudioSessionMode()).toBe('playback');
  });

  it('w przypadku b\u0142\u0119du z setAudioModeAsync emituje telemetri\u0119 failure i propaguje wyj\u0105tek', async () => {
    const events: { event: string; payload: Record<string, unknown> }[] = [];
    setTelemetrySink((event, payload) => events.push({ event, payload }));

    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('AVAudioSession busy'));

    await expect(configureForPlayback()).rejects.toThrow('AVAudioSession busy');

    expect(getCurrentAudioSessionMode()).toBeNull();
    expect(events).toEqual([
      {
        event: 'audio_session_set_retry',
        payload: {
          mode: 'playback',
          attempt: 1,
          retriable: false,
          error_message: 'AVAudioSession busy',
        },
      },
      {
        event: 'audio_session_set',
        payload: {
          mode: 'playback',
          status: 'failure',
          attempts: 1,
          error_message: 'AVAudioSession busy',
        },
      },
    ]);
  });

  it('dla iOS !pri wykonuje retry i finalnie ko\u0144czy si\u0119 sukcesem', async () => {
    mockSetAudioModeAsync
      .mockRejectedValueOnce(new Error('OSStatus error 561017449'))
      .mockResolvedValueOnce(undefined);

    await configureForPlayback();

    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(2);
    expect(getCurrentAudioSessionMode()).toBe('playback');
  });

  it('dla zwyk\u0142ego b\u0142\u0119du nie robi retry', async () => {
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(configureForPlayback()).rejects.toThrow('Permission denied');
    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
  });

  it('r\u00f3wnoleg\u0142e wywo\u0142ania configureForPlayback wsp\u00f3\u0142dziel\u0105 jedno wywo\u0142anie natywne', async () => {
    const deferred: { resolve: () => void } = { resolve: () => {} };
    mockSetAudioModeAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    const p1 = configureForPlayback();
    const p2 = configureForPlayback();

    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await Promise.all([p1, p2]);

    expect(getCurrentAudioSessionMode()).toBe('playback');

    void trackEvent;
  });
});
