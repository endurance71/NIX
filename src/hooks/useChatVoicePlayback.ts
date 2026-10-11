import { createContext, use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { configureForPlayback } from '../lib/audioSession';
import {
  createVoicePlaybackStore,
  type VoicePlaybackPhase,
  type VoicePlaybackStore,
} from '../lib/voicePlaybackStore';
import { voicePlaybackProgress } from '../lib/voiceMessage';
import { getVoicePlaybackUrl } from '../services/voiceMessageService';

const STATUS_INTERVAL_MS = 100;
/** A message that never starts playing (network, revoked access) gives up after this. */
const LOAD_TIMEOUT_MS = 10_000;

export type VoicePlaybackSource = {
  /** Storage object of a delivered message. */
  path: string | null;
  /** Local recording of a message that is still being sent. */
  localUri: string | null;
  durationMs: number;
};

/**
 * One player for the whole chat: starting a message stops the previous one. Playback goes through
 * the speaker (`playback` session) and pauses when the chat loses focus.
 */
export function useChatVoicePlayback({ onError }: { onError: () => void }) {
  const [store] = useState(createVoicePlaybackStore);
  const playerRef = useRef<AudioPlayer | null>(null);
  const statusSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const activeRef = useRef<{ messageId: string; durationMs: number } | null>(null);
  const requestRef = useRef(0);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const clearLoadTimer = useCallback(() => {
    if (loadTimerRef.current !== null) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearLoadTimer();
    activeRef.current = null;
    store.set({ messageId: null, phase: 'idle', progress: 0 });
  }, [clearLoadTimer, store]);

  const onStatus = useCallback(
    (status: AudioStatus) => {
      const active = activeRef.current;
      const player = playerRef.current;
      if (!active || !player) return;
      if (status.didJustFinish) {
        reset();
        player.pause();
        void player.seekTo(0).catch(() => undefined);
        return;
      }
      const current = store.getSnapshot();
      if (status.playing) clearLoadTimer();
      const durationMs = status.duration > 0 ? status.duration * 1000 : active.durationMs;
      store.set({
        messageId: active.messageId,
        phase: status.playing ? 'playing' : current.phase === 'loading' ? 'loading' : 'paused',
        progress: voicePlaybackProgress(status.currentTime, durationMs),
      });
    },
    [clearLoadTimer, reset, store],
  );

  const ensurePlayer = useCallback(() => {
    if (playerRef.current) return playerRef.current;
    const player = createAudioPlayer(null, { updateInterval: STATUS_INTERVAL_MS });
    statusSubscriptionRef.current = player.addListener('playbackStatusUpdate', onStatus);
    playerRef.current = player;
    return player;
  }, [onStatus]);

  useEffect(
    () => () => {
      requestRef.current += 1;
      clearLoadTimer();
      statusSubscriptionRef.current?.remove();
      statusSubscriptionRef.current = null;
      playerRef.current?.remove();
      playerRef.current = null;
      activeRef.current = null;
    },
    [clearLoadTimer],
  );

  const pause = useCallback(() => {
    const snapshot = store.getSnapshot();
    playerRef.current?.pause();
    if (snapshot.phase === 'loading') {
      requestRef.current += 1;
      reset();
      return;
    }
    if (snapshot.phase === 'playing') store.set({ ...snapshot, phase: 'paused' });
  }, [reset, store]);

  // Leaving the chat (viewer, camera, back) never keeps a voice message talking.
  useFocusEffect(useCallback(() => pause, [pause]));

  const toggle = useCallback(
    async (messageId: string, source: VoicePlaybackSource) => {
      const snapshot = store.getSnapshot();
      if (snapshot.messageId === messageId) {
        if (snapshot.phase === 'playing') {
          pause();
          return;
        }
        if (snapshot.phase === 'paused' && playerRef.current) {
          await configureForPlayback().catch(() => undefined);
          playerRef.current.play();
          store.set({ ...snapshot, phase: 'playing' });
          return;
        }
        if (snapshot.phase === 'loading') return;
      }

      const request = ++requestRef.current;
      playerRef.current?.pause();
      clearLoadTimer();
      activeRef.current = { messageId, durationMs: source.durationMs };
      store.set({ messageId, phase: 'loading', progress: 0 });
      const fail = () => {
        if (request !== requestRef.current) return;
        playerRef.current?.pause();
        reset();
        onErrorRef.current();
      };
      try {
        const uri = source.path ? await getVoicePlaybackUrl(source.path) : source.localUri;
        if (request !== requestRef.current) return;
        if (!uri) {
          fail();
          return;
        }
        await configureForPlayback().catch(() => undefined);
        if (request !== requestRef.current) return;
        const player = ensurePlayer();
        player.replace({ uri });
        player.play();
        loadTimerRef.current = setTimeout(fail, LOAD_TIMEOUT_MS);
      } catch {
        fail();
      }
    },
    [clearLoadTimer, ensurePlayer, pause, reset, store],
  );

  return { store, toggle, pause };
}

export type ChatVoicePlayback = {
  store: VoicePlaybackStore;
  toggle: (messageId: string, source: VoicePlaybackSource) => void;
};

/** The chat's single voice player, shared by every bubble without touching `renderItem`. */
export const ChatVoicePlaybackContext = createContext<ChatVoicePlayback | null>(null);

const noopSubscribe = () => () => undefined;

/** Only the phase (play / pause / loading): changes a few times per playback, not per tick. */
export function useVoicePhase(messageId: string, enabled = true): VoicePlaybackPhase {
  const context = use(ChatVoicePlaybackContext);
  // Text bubbles do not listen to the player at all.
  const playback = enabled ? context : null;
  return useSyncExternalStore(
    playback ? playback.store.subscribe : noopSubscribe,
    () => (playback ? playback.store.getBubble(messageId).phase : 'idle'),
  );
}

export function useVoiceProgress(messageId: string): number {
  const playback = use(ChatVoicePlaybackContext);
  return useSyncExternalStore(
    playback ? playback.store.subscribe : noopSubscribe,
    () => (playback ? playback.store.getBubble(messageId).progress : 0),
  );
}

