import { useEffect, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { trackEvent } from '../../lib/telemetry';
import { videoContentFit } from '../../lib/mediaPresentation';

const VIEWER_VIDEO_WATCHDOG_MS = 2500;

export function ViewerNixVideo({
  uri,
  onReady,
  onError,
  onPlayToEnd,
  onProgress,
  paused = false,
  loop = false,
  style,
}: {
  uri: string;
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
  const readyToPlayRef = useRef(false);
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
      if (readyToPlayRef.current && !readyEmittedRef.current) {
        readyEmittedRef.current = true;
        onReadyRef.current();
      }
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
      if (readyToPlayRef.current && !readyEmittedRef.current) {
        readyEmittedRef.current = true;
        onReadyRef.current();
      }
    }
    const dur = player.duration;
    if (dur > 0) {
      const progress = Math.max(0, Math.min(1, 1 - currentTime / dur));
      onProgress?.(progress);
    }
  });

  useEventListener(player, 'statusChange', ({ status: nextStatus }) => {
    if (nextStatus === 'readyToPlay') {
      readyToPlayRef.current = true;
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
    readyToPlayRef.current = false;
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
        media_type: 'video',
      });
      try {
        player.play();
      } catch {
        // ignorujemy
      }
    }, VIEWER_VIDEO_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [uri, player]);

  return (
    <VideoView
      style={style}
      player={player}
      contentFit={videoContentFit()}
      nativeControls={false}
    />
  );
}
