import { useEffect, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import {
  cancelAnimation,
  Easing,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { trackEvent } from '../../lib/telemetry';
import { videoContentFit } from '../../lib/mediaPresentation';
import {
  applyViewerPlayerOptions,
  configureViewerVideoPlayer,
  restartViewerPlayer,
} from '../../lib/viewerVideoPlayer';
import {
  remainingVideoProgress,
  remainingVideoProgressMs,
  shouldResyncVideoProgress,
  type LinearProgressAnimation,
} from '../../lib/viewerVideoProgress';

const VIEWER_VIDEO_WATCHDOG_MS = 2500;
/** Hide the poster even if `onFirstFrameRender` never fires for this player/view pairing. */
const VIEWER_VIDEO_FIRST_FRAME_FALLBACK_MS = 300;

type ViewerNixVideoProps = {
  uri: string;
  /** Preloaded player handed over by the viewer; otherwise the component owns one. */
  player?: VideoPlayer | null;
  onReady: () => void;
  onError: () => void;
  onPlayToEnd: () => void;
  onFirstFrame?: () => void;
  progress?: SharedValue<number>;
  paused?: boolean;
  loop?: boolean;
  /** Muted unless the user turned viewer sound on (session preference). */
  muted?: boolean;
  /** Changing it seeks back to the start (left tap zone restarts the slide). */
  restartKey?: number;
  style: StyleProp<ViewStyle>;
};

export function ViewerNixVideo({ player, ...props }: ViewerNixVideoProps) {
  return player ? (
    <ViewerVideoSurface {...props} player={player} />
  ) : (
    <OwnedViewerVideo {...props} />
  );
}

function OwnedViewerVideo(props: Omit<ViewerNixVideoProps, 'player'>) {
  const player = useVideoPlayer({ uri: props.uri }, (p) => {
    configureViewerVideoPlayer(p, props.loop ?? false);
  });
  return <ViewerVideoSurface {...props} player={player} />;
}

function ViewerVideoSurface({
  uri,
  player,
  onReady,
  onError,
  onPlayToEnd,
  onFirstFrame,
  progress,
  paused = false,
  loop = false,
  muted = true,
  restartKey = 0,
  style,
}: Omit<ViewerNixVideoProps, 'player'> & { player: VideoPlayer }) {
  const readyEmittedRef = useRef(false);
  const readyToPlayRef = useRef(false);
  const errorEmittedRef = useRef(false);
  const hasActuallyPlayedRef = useRef(false);
  const firstFrameEmittedRef = useRef(false);
  const firstFrameFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressAnimationRef = useRef<LinearProgressAnimation | null>(null);
  const pausedRef = useRef(paused);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onPlayToEndRef = useRef(onPlayToEnd);
  const onFirstFrameRef = useRef(onFirstFrame);

  useEffect(() => {
    pausedRef.current = paused;
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onPlayToEndRef.current = onPlayToEnd;
    onFirstFrameRef.current = onFirstFrame;
  });

  const emitFirstFrame = () => {
    if (firstFrameEmittedRef.current) return;
    firstFrameEmittedRef.current = true;
    onFirstFrameRef.current?.();
  };

  const emitReady = () => {
    if (!readyToPlayRef.current || readyEmittedRef.current) return;
    readyEmittedRef.current = true;
    onReadyRef.current();
    if (!firstFrameEmittedRef.current && firstFrameFallbackRef.current === null) {
      firstFrameFallbackRef.current = setTimeout(emitFirstFrame, VIEWER_VIDEO_FIRST_FRAME_FALLBACK_MS);
    }
  };

  const emitError = () => {
    if (errorEmittedRef.current) return;
    errorEmittedRef.current = true;
    onErrorRef.current();
  };

  /** Pin progress to the player and, while playing, let a linear UI-thread animation run it down. */
  const syncProgress = (playing: boolean, currentTime?: number) => {
    if (!progress) return;
    const duration = player.duration;
    const remaining = remainingVideoProgress(currentTime ?? player.currentTime, duration);
    if (remaining === null) return;
    cancelAnimation(progress);
    progress.set(remaining);
    if (!playing || remaining <= 0) {
      progressAnimationRef.current = null;
      return;
    }
    const durationMs = remainingVideoProgressMs(remaining, duration, player.playbackRate);
    progress.set(withTiming(0, { duration: durationMs, easing: Easing.linear }));
    progressAnimationRef.current = { fromProgress: remaining, startedAtMs: Date.now(), durationMs };
  };

  const startWhenReady = () => {
    readyToPlayRef.current = true;
    try {
      if (!pausedRef.current) player.play();
    } catch {
      // ignorujemy — kolejny statusChange/error obsłuży sytuację
    }
  };

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (isPlaying) {
      hasActuallyPlayedRef.current = true;
      emitReady();
    }
    syncProgress(isPlaying);
  });

  useEventListener(player, 'playToEnd', () => {
    if (loop) {
      syncProgress(true);
      return;
    }
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
      emitReady();
    }
    const actual = remainingVideoProgress(currentTime, player.duration);
    if (
      actual !== null &&
      player.playing &&
      shouldResyncVideoProgress(progressAnimationRef.current, actual, Date.now())
    ) {
      syncProgress(true);
    }
  });

  useEventListener(player, 'statusChange', ({ status: nextStatus }) => {
    if (nextStatus === 'readyToPlay') {
      startWhenReady();
      return;
    }
    if (nextStatus === 'error') emitError();
  });

  useEffect(() => {
    readyEmittedRef.current = false;
    readyToPlayRef.current = false;
    errorEmittedRef.current = false;
    hasActuallyPlayedRef.current = false;
    firstFrameEmittedRef.current = false;
    // A preloaded player may have reached its final status before this view subscribed.
    if (player.status === 'readyToPlay') startWhenReady();
    else if (player.status === 'error') emitError();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per source; handlers read refs
  }, [uri, player]);

  useEffect(() => {
    if (paused) player.pause();
    else if (readyEmittedRef.current) player.play();
  }, [paused, player]);

  useEffect(() => {
    applyViewerPlayerOptions(player, { muted, loop });
  }, [muted, loop, player]);

  const appliedRestartKeyRef = useRef(restartKey);
  useEffect(() => {
    if (appliedRestartKeyRef.current === restartKey) return;
    appliedRestartKeyRef.current = restartKey;
    if (!restartViewerPlayer(player)) return;
    // The seek is async; the progress restarts from zero now and timeUpdate corrects any drift.
    syncProgress(player.playing && !pausedRef.current, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per restart; handlers read refs
  }, [restartKey, player]);

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

  useEffect(
    () => () => {
      if (firstFrameFallbackRef.current !== null) clearTimeout(firstFrameFallbackRef.current);
      firstFrameFallbackRef.current = null;
      if (progress) cancelAnimation(progress);
    },
    [player, progress],
  );

  return (
    <VideoView
      style={style}
      player={player}
      contentFit={videoContentFit()}
      nativeControls={false}
      onFirstFrameRender={emitFirstFrame}
    />
  );
}
