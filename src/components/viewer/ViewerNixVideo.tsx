import { useEffect, useEffectEvent, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { useEvent, useEventListener } from 'expo';
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
  style,
}: {
  uri: string;
  nixId: string;
  onReady: () => void;
  onError: () => void;
  onPlayToEnd: () => void;
  onProgress?: (nextProgress: number) => void;
  style: StyleProp<ViewStyle>;
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1 / 30;
    p.muted = false;
    p.volume = 1;
    p.audioMixingMode = 'auto';
  });

  const readyEmittedRef = useRef(false);
  const errorEmittedRef = useRef(false);

  const onReadyEffect = useEffectEvent(onReady);
  const onErrorEffect = useEffectEvent(onError);

  useEventListener(player, 'playToEnd', onPlayToEnd);
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const dur = player.duration;
    if (dur > 0) {
      const progress = Math.max(0, Math.min(1, 1 - currentTime / dur));
      onProgress?.(progress);
    }
  });

  const statusEvent = useEvent(player, 'statusChange', { status: player.status });
  const status = statusEvent?.status ?? player.status;

  useEffect(() => {
    if (status === 'readyToPlay') {
      if (!readyEmittedRef.current) {
        readyEmittedRef.current = true;
        onReadyEffect();
      }
      try {
        player.play();
      } catch {
        // ignorujemy — kolejny statusChange/error obsłuży sytuację
      }
      return;
    }
    if (status === 'error' && !errorEmittedRef.current) {
      errorEmittedRef.current = true;
      onErrorEffect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- useEffectEvent onReady/onError
  }, [status, player]);

  useEffect(() => {
    readyEmittedRef.current = false;
    errorEmittedRef.current = false;
  }, [uri]);

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
      onReadyEffect();
    }, VIEWER_VIDEO_WATCHDOG_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- useEffectEvent onReady
  }, [uri, nixId, player]);

  return <VideoView style={style} player={player} contentFit="cover" nativeControls={false} />;
}
