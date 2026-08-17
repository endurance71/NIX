import { useEffect, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { trackEvent } from '../../lib/telemetry';

const VIEWER_VIDEO_WATCHDOG_MS = 2500;

export function ViewerNixVideo({
  uri,
  nixId,
  onReady,
  onError,
  onPlayToEnd,
  onProgress,
  paused = false,
  loop = false,
  style,
}: {
  uri: string;
  nixId: string;
  onReady: () => void;
  onError: () => void;
  onPlayToEnd: () => void;
  onProgress?: (nextProgress: number) => void;
  paused?: boolean;
  loop?: boolean;
  style: StyleProp<ViewStyle>;
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = loop;
    p.timeUpdateEventInterval = 1 / 30;
    p.muted = false;
    p.volume = 1;
    p.audioMixingMode = 'auto';
  });

  const readyEmittedRef = useRef(false);
  const errorEmittedRef = useRef(false);
  const hasActuallyPlayedRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onPlayToEndRef = useRef(onPlayToEnd);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onPlayToEndRef.current = onPlayToEnd;
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (isPlaying) {
      hasActuallyPlayedRef.current = true;
    }
  });

  useEventListener(player, 'playToEnd', () => {
    if (loop) return;
    const dur = player.duration;
    const cur = player.currentTime;
    const hasPlayed = hasActuallyPlayedRef.current || (dur > 0 && cur >= Math.min(0.3, dur * 0.8));
    if (!hasPlayed) {
      return;
    }
    onPlayToEndRef.current();
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime > 0.05) {
      hasActuallyPlayedRef.current = true;
    }
    const dur = player.duration;
    if (dur > 0) {
      const progress = Math.max(0, Math.min(1, 1 - currentTime / dur));
      onProgress?.(progress);
    }
  });

  useEventListener(player, 'statusChange', ({ status: nextStatus }) => {
    if (nextStatus === 'readyToPlay') {
      if (!readyEmittedRef.current) {
        readyEmittedRef.current = true;
        onReadyRef.current();
      }
      try {
        if (!paused) player.play();
      } catch {
        // ignorujemy — kolejny statusChange/error obsłuży sytuację
      }
      return;
    }
    if (nextStatus === 'error' && !errorEmittedRef.current) {
      errorEmittedRef.current = true;
      onErrorRef.current();
    }
  });

  useEffect(() => {
    readyEmittedRef.current = false;
    errorEmittedRef.current = false;
    hasActuallyPlayedRef.current = false;
  }, [uri]);

  useEffect(() => {
    if (paused) player.pause();
    else if (readyEmittedRef.current) player.play();
  }, [paused, player]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (readyEmittedRef.current || errorEmittedRef.current) return;
      trackEvent('viewer_video_stuck_watchdog', {
        current_status: player.status,
        nix_id: nixId,
      });
      try {
        player.play();
      } catch {
        // ignorujemy
      }
      readyEmittedRef.current = true;
      onReadyRef.current();
    }, VIEWER_VIDEO_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [uri, nixId, player]);

  return <VideoView style={style} player={player} contentFit="cover" nativeControls={false} />;
}
