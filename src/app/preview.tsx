import { useEffect, useReducer, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { VideoThumbnail } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  cancelAnimation,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { NativeChromeIconButton } from '../components/ui/native-chrome-icon-button';
import { NativePreviewSendButton } from '../components/ui/native-preview-send-button';
import PreviewDurationMenu from '../components/ui/preview-duration-menu';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { useVideoDraft, type VideoSegmentDraft } from '../context/VideoDraftContext';
import { configureForPlayback } from '../lib/audioSession';
import { trackEvent } from '../lib/telemetry';
import { tap } from '../lib/haptics';
import { generateVideoThumbnailAtTime } from '../lib/videoThumbnails';
import {
  DEFAULT_NIX_VIEW_DURATION_SEC,
  loadPreferredNixViewDuration,
  type NixViewDurationSec,
} from '../lib/nixViewDuration';

const TIMER_TRACK_HEIGHT = 8;
/** Maks. czas oczekiwania na `readyToPlay` zanim wymusimy `play()` + `onReady()`. */
const PREVIEW_VIDEO_WATCHDOG_MS = 2500;
const PREVIEW_VIDEO_AUTOPLAY_RETRY_MS = 180;
const PREVIEW_VIDEO_AUTOPLAY_RETRY_COUNT = 14;
/** Odstęp od safe area do pill z paskiem segmentów (zgodny z `timerHudShell`). */
const VIDEO_PREVIEW_TIMER_HUD_TOP = 10;
/** `paddingVertical` wewnątrz pill (`timerHudInner`) — musi być zsynchronizowany ze stylami. */
const VIDEO_PREVIEW_TIMER_HUD_PADDING_V = 8;
/** Odstęp między dolną krawędzią pill a przyciskiem zamknięcia. */
const VIDEO_PREVIEW_CLOSE_BELOW_TIMER_GAP = 12;
const MEDIA_PREVIEW_BACKGROUND = '#000000';

function previewTimerHudContentHeight() {
  return VIDEO_PREVIEW_TIMER_HUD_PADDING_V * 2 + TIMER_TRACK_HEIGHT;
}

function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function discardVideoPreview(clearDraft: () => void) {
  clearDraft();
  router.back();
}

function openSendToVideo() {
  tap('light');
  router.push({ pathname: '/send-to', params: { mode: 'video' } });
}

function discardPhotoPreview() {
  router.back();
}

function openSendToPhoto(uri: string, viewDurationSec: number) {
  tap('light');
  router.push({
    pathname: '/send-to',
    params: { uri, mode: 'image', viewDurationSec: String(viewDurationSec) },
  });
}

type PreviewVideoState = {
  clipIndex: number;
  readyClipKey: string | null;
  errorClipKey: string | null;
  errorMessage: string | null;
  posterClipKey: string | null;
  poster: VideoThumbnail | null;
  firstFrameClipKey: string | null;
  audioReady: boolean;
};

type PreviewVideoAction =
  | { type: 'audioReady' }
  | { type: 'advance'; segmentCount: number }
  | { type: 'ready'; clipKey: string }
  | { type: 'firstFrame'; clipKey: string }
  | { type: 'error'; clipKey: string; message: string }
  | { type: 'posterLoaded'; clipKey: string; poster: VideoThumbnail };

const initialPreviewVideoState: PreviewVideoState = {
  clipIndex: 0,
  readyClipKey: null,
  errorClipKey: null,
  errorMessage: null,
  posterClipKey: null,
  poster: null,
  firstFrameClipKey: null,
  audioReady: false,
};

function previewVideoReducer(state: PreviewVideoState, action: PreviewVideoAction): PreviewVideoState {
  switch (action.type) {
    case 'audioReady':
      return { ...state, audioReady: true };
    case 'advance':
      return {
        ...state,
        clipIndex: (state.clipIndex + 1) % action.segmentCount,
        readyClipKey: null,
        errorClipKey: null,
        errorMessage: null,
        posterClipKey: null,
        poster: null,
        firstFrameClipKey: null,
      };
    case 'ready':
      return { ...state, readyClipKey: action.clipKey, errorClipKey: null, errorMessage: null };
    case 'firstFrame':
      return {
        ...state,
        firstFrameClipKey: action.clipKey,
        readyClipKey: action.clipKey,
        errorClipKey: null,
        errorMessage: null,
      };
    case 'error':
      return { ...state, errorClipKey: action.clipKey, errorMessage: action.message };
    case 'posterLoaded':
      return { ...state, posterClipKey: action.clipKey, poster: action.poster };
    default:
      return state;
  }
}

function PreviewSegmentVideo({
  uri,
  segmentIndex,
  segmentProgress,
  onReady,
  onFirstFrameRender,
  onPlaybackError,
  style,
}: {
  uri: string;
  segmentIndex: number;
  segmentProgress: SharedValue<number>;
  onReady: () => void;
  onFirstFrameRender: () => void;
  onPlaybackError: () => void;
  style: StyleProp<ViewStyle>;
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 1 / 60;
    p.muted = false;
    p.volume = 1;
    p.audioMixingMode = 'auto';
  });

  const readyEmittedRef = useRef(false);
  const errorEmittedRef = useRef(false);
  const watchdogFiredRef = useRef(false);
  const playingRef = useRef(false);
  const autoplayAttemptRef = useRef(0);
  const onReadyRef = useRef(onReady);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  const segmentIndexRef = useRef(segmentIndex);
  const requestAutoplayRef = useRef<(reason: string) => void>(() => {});
  const markReadyRef = useRef<(status: string) => void>(() => {});

  useEffect(() => {
    onReadyRef.current = onReady;
    onPlaybackErrorRef.current = onPlaybackError;
    segmentIndexRef.current = segmentIndex;
    requestAutoplayRef.current = (reason: string) => {
      if (errorEmittedRef.current || playingRef.current) return;
      autoplayAttemptRef.current += 1;
      try {
        player.play();
        trackEvent('preview_video_autoplay_attempt', {
          reason,
          attempt: autoplayAttemptRef.current,
          status: player.status,
          segment_index: segmentIndexRef.current,
        });
      } catch (error) {
        trackEvent('preview_video_autoplay_error', {
          reason,
          attempt: autoplayAttemptRef.current,
          status: player.status,
          segment_index: segmentIndexRef.current,
          error_message: error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
      }
    };
    markReadyRef.current = (status: string) => {
      if (readyEmittedRef.current) return;
      readyEmittedRef.current = true;
      trackEvent('preview_video_status_change', {
        status,
        segment_index: segmentIndexRef.current,
      });
      onReadyRef.current();
    };
  }, [onReady, onPlaybackError, player, segmentIndex]);

  useEventListener(player, 'statusChange', ({ status: nextStatus }) => {
    if (nextStatus === 'readyToPlay') {
      markReadyRef.current(nextStatus);
      requestAutoplayRef.current('status-readyToPlay');
      return;
    }
    if (nextStatus === 'error' && !errorEmittedRef.current) {
      errorEmittedRef.current = true;
      trackEvent('preview_video_status_change', {
        status: nextStatus,
        segment_index: segmentIndexRef.current,
      });
      onPlaybackErrorRef.current();
    }
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    playingRef.current = isPlaying;
    trackEvent('preview_video_playing_change', {
      is_playing: isPlaying,
      status: player.status,
      segment_index: segmentIndexRef.current,
    });
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime > 0 && !playingRef.current) {
      playingRef.current = true;
    }
    const dur = player.duration;
    if (dur > 0) {
      const nextProgress = Math.max(0, Math.min(1, 1 - currentTime / dur));
      segmentProgress.set(
        withTiming(nextProgress, {
          duration: 90,
          easing: Easing.linear,
        })
      );
    }
  });

  useEffect(() => {
    readyEmittedRef.current = false;
    errorEmittedRef.current = false;
    watchdogFiredRef.current = false;
    playingRef.current = false;
    autoplayAttemptRef.current = 0;
  }, [uri]);

  useEffect(() => {
    requestAutoplayRef.current('mount');
    let attempts = 0;
    const retry = setInterval(() => {
      attempts += 1;
      if (playingRef.current || errorEmittedRef.current || attempts > PREVIEW_VIDEO_AUTOPLAY_RETRY_COUNT) {
        clearInterval(retry);
        return;
      }
      if (player.status === 'readyToPlay') {
        requestAutoplayRef.current('retry-readyToPlay');
      }
    }, PREVIEW_VIDEO_AUTOPLAY_RETRY_MS);
    return () => clearInterval(retry);
  }, [uri, player]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (readyEmittedRef.current || errorEmittedRef.current) return;
      watchdogFiredRef.current = true;
      trackEvent('preview_video_stuck_watchdog', {
        current_status: player.status,
        segment_index: segmentIndex,
      });
      requestAutoplayRef.current('watchdog');
      markReadyRef.current('watchdog-forced-ready');
    }, PREVIEW_VIDEO_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [uri, segmentIndex, player]);

  return (
    <VideoView
      style={style}
      player={player}
      contentFit="cover"
      nativeControls={false}
      onFirstFrameRender={() => {
        onFirstFrameRender();
        markReadyRef.current('first-frame-render');
        requestAutoplayRef.current('first-frame-render');
      }}
    />
  );
}

function PreviewVideoContent({
  segments,
  clearDraft,
}: {
  segments: VideoSegmentDraft[];
  clearDraft: () => void;
}) {
  const { colors, statusBarStyle, isDark } = useAppTheme();
  const insets = useScreenInsets('mediaChrome');
  const styles = createStyles(colors);
  const [videoState, dispatchVideoState] = useReducer(previewVideoReducer, initialPreviewVideoState);
  const segmentProgress = useSharedValue(1);

  const current = segments[videoState.clipIndex];
  const clipKey = `${videoState.clipIndex}:${current.uri}`;
  const videoReady = videoState.readyClipKey === clipKey;
  const videoError = videoState.errorClipKey === clipKey ? videoState.errorMessage : null;
  const poster = videoState.posterClipKey === clipKey ? videoState.poster : null;
  const firstFrameRendered = videoState.firstFrameClipKey === clipKey;

  useEffect(() => {
    let cancelled = false;
    void configureForPlayback()
      .then(() => {
        if (!cancelled) {
          dispatchVideoState({ type: 'audioReady' });
          trackEvent('preview_audio_session_ready', { status: 'success' });
        }
      })
      .catch((error) => {
        console.warn('Preview audio session setup failed', error);
        if (!cancelled) {
          dispatchVideoState({ type: 'audioReady' });
          trackEvent('preview_audio_session_ready', {
            status: 'failure',
            error_message: error instanceof Error ? error.message : 'Unknown preview audio session error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSegmentMaskStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0, 1 - segmentProgress.get()) }],
  }));

  const advanceClip = () => {
    cancelAnimation(segmentProgress);
    segmentProgress.set(1);
    dispatchVideoState({ type: 'advance', segmentCount: segments.length });
  };

  const handleVideoReady = () => {
    dispatchVideoState({ type: 'ready', clipKey });
  };

  const handleFirstFrameRender = () => {
    dispatchVideoState({ type: 'firstFrame', clipKey });
  };

  const handleVideoPlaybackError = () => {
    dispatchVideoState({ type: 'error', clipKey, message: 'Nie udało się odtworzyć nagrania.' });
  };

  useEffect(() => {
    let cancelled = false;
    void generateVideoThumbnailAtTime(current.uri, 0, { maxWidth: 720 })
      .then((thumbnail) => {
        if (!thumbnail) {
          trackEvent('preview_video_thumbnail_failed', {
            segment_index: videoState.clipIndex,
            error_message: 'generateVideoThumbnailAtTime returned null',
          });
          return;
        }
        if (!cancelled) {
          dispatchVideoState({ type: 'posterLoaded', clipKey, poster: thumbnail });
        }
      })
      .catch((error) => {
        trackEvent('preview_video_thumbnail_failed', {
          segment_index: videoState.clipIndex,
          error_message: error instanceof Error ? error.message : 'Unknown thumbnail error',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [current.uri, clipKey, videoState.clipIndex]);

  return (
    <Animated.View style={styles.container} exiting={FadeOut.duration(120)}>
      <StatusBar style={statusBarStyle} hidden />

      <View style={[styles.timerHudShell, { top: insets.top + VIDEO_PREVIEW_TIMER_HUD_TOP }]}>
        <BlurView intensity={isDark ? 72 : 58} tint={isDark ? 'dark' : 'light'} style={styles.timerBlur} />
        <View style={styles.timerHudInner}>
          <View style={styles.segmentsRow}>
            {segments.map((_, segIndex) => {
              const isDone = segIndex < videoState.clipIndex;
              const isActive = segIndex === videoState.clipIndex;
              return (
                <View key={`seg-${segIndex}`} style={styles.segmentCell}>
                  <View style={styles.timerTrack}>
                    {isDone ? (
                      <View style={styles.segmentFillDone} />
                    ) : isActive ? (
                      <>
                        <View style={styles.segmentFill} />
                        <Animated.View
                          style={[styles.segmentProgressMask, activeSegmentMaskStyle]}
                          pointerEvents="none"
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {videoState.audioReady ? (
        <PreviewSegmentVideo
          key={clipKey}
          uri={current.uri}
          segmentIndex={videoState.clipIndex}
          segmentProgress={segmentProgress}
          onReady={handleVideoReady}
          onFirstFrameRender={handleFirstFrameRender}
          onPlaybackError={handleVideoPlaybackError}
          style={styles.image}
        />
      ) : null}

      {!firstFrameRendered && poster ? (
        <Image source={poster} style={styles.videoPoster} contentFit="cover" />
      ) : null}

      {videoReady && !videoError ? (
        <Pressable
          style={styles.dismissArea}
          onPress={advanceClip}
          accessibilityLabel="Następny fragment"
          accessibilityRole="button"
        />
      ) : null}

      {(!videoState.audioReady || !videoReady) && !videoError && !poster ? (
        <View style={styles.loadingOverlaySolid}>
          <Text style={styles.loadingHint}>Ładowanie podglądu…</Text>
        </View>
      ) : null}

      {videoError ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{videoError}</Text>
          <Pressable style={styles.backButton} onPress={() => discardVideoPreview(clearDraft)}>
            <Text style={styles.backButtonText}>Wróć</Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.overlay,
          styles.overlayVideoChrome,
          {
            paddingTop:
              insets.top +
              VIDEO_PREVIEW_TIMER_HUD_TOP +
              previewTimerHudContentHeight() +
              VIDEO_PREVIEW_CLOSE_BELOW_TIMER_GAP,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 24,
          },
        ]}>
        <View style={styles.topControls}>
          <NativeChromeIconButton
            name="close"
            accessibilityLabel="Porzuć nagranie"
            onPress={() => discardVideoPreview(clearDraft)}
            backgroundColor={colors.cameraControlBackground}
            tintColor={colors.cameraControlTint}
          />
        </View>

        <View style={styles.bottomControls}>
          <NativePreviewSendButton
            label="Wyślij do"
            accessibilityLabel="Wyślij nagranie"
            onPress={openSendToVideo}
            backgroundColor={colors.cameraControlBackground}
            tintColor={colors.cameraControlTint}
          />
        </View>
      </View>
    </Animated.View>
  );
}

export default function PreviewScreen() {
  const { colors, statusBarStyle } = useAppTheme();
  const insets = useScreenInsets('mediaChrome');
  const styles = createStyles(colors);
  const raw = useLocalSearchParams<{ uri?: string; viewDurationSec?: string; mode?: string; durationMs?: string }>();
  const mode = paramFirst(raw.mode);
  const uri = paramFirst(raw.uri);
  const rawDurationMs = paramFirst(raw.durationMs);

  const [viewDurationSec, setViewDurationSec] = useState<NixViewDurationSec>(DEFAULT_NIX_VIEW_DURATION_SEC);

  const { segments, setSegments, clearSegments } = useVideoDraft();
  const routeVideoSegment = mode === 'video' && uri ? { uri, durationMs: Math.max(0, Number(rawDurationMs) || 0) } : null;
  const routeVideoSegments = routeVideoSegment ? [routeVideoSegment] : null;
  const previewVideoSegments = segments?.length ? segments : routeVideoSegments;

  useEffect(() => {
    if (mode !== 'video' || segments?.length || !uri) return;
    setSegments([{ uri, durationMs: Math.max(0, Number(rawDurationMs) || 0) }]);
  }, [mode, uri, rawDurationMs, segments?.length, setSegments]);

  useEffect(() => {
    let cancelled = false;
    void loadPreferredNixViewDuration().then((sec) => {
      if (!cancelled) setViewDurationSec(sec);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === 'video') {
    if (!previewVideoSegments?.length) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorText}>Brak nagrań do podglądu</Text>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              clearSegments();
              router.back();
            }}>
            <Text style={styles.backButtonText}>Wróć</Text>
          </Pressable>
        </View>
      );
    }
    return <PreviewVideoContent segments={previewVideoSegments} clearDraft={clearSegments} />;
  }

  if (!uri) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Nie przechwycono zdjęcia</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Wróć</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
      <StatusBar style={statusBarStyle} hidden />

      <Image source={{ uri }} style={styles.image} contentFit="cover" cachePolicy="none" />

      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }]}>
        <View style={[styles.topControls, styles.photoPreviewTopControls]}>
          <NativeChromeIconButton
            name="close"
            accessibilityLabel="Odrzuć zdjęcie"
            onPress={discardPhotoPreview}
            backgroundColor={colors.cameraControlBackground}
            tintColor={colors.cameraControlTint}
          />
          <PreviewDurationMenu
            selectedDurationSec={viewDurationSec}
            onSelect={setViewDurationSec}
            colors={colors}
          />
        </View>

        <View style={styles.bottomControls}>
          <NativePreviewSendButton
            label="Wyślij do"
            accessibilityLabel="Wybierz odbiorców zdjęcia"
            onPress={() => openSendToPhoto(uri, viewDurationSec)}
            backgroundColor={colors.cameraControlBackground}
            tintColor={colors.cameraControlTint}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: ThemeColors) => {
  const progressBlue = colors.systemBlue;
  const trackSoftWhite = colors.viewerChromeFill;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: MEDIA_PREVIEW_BACKGROUND,
    },
    errorText: {
      ...typography.callout,
      color: colors.label,
      textAlign: 'center',
      marginTop: 100,
    },
    backButton: {
      marginTop: 20,
      alignSelf: 'center',
      padding: 12,
      backgroundColor: colors.secondarySystemBackground,
      borderRadius: 8,
    },
    backButtonText: {
      ...typography.footnote,
      color: colors.label,
      fontWeight: '600',
    },
    image: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    videoPoster: {
      ...StyleSheet.absoluteFill,
      zIndex: 4,
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'space-between',
    },
    overlayVideoChrome: {
      zIndex: 11,
    },
    topControls: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
    },
    photoPreviewTopControls: {
      justifyContent: 'flex-start',
      alignItems: 'center',
      alignSelf: 'stretch',
      gap: 12,
    },
    bottomControls: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    timerHudShell: {
      position: 'absolute',
      left: 16,
      right: 16,
      borderRadius: 12,
      overflow: 'hidden',
      zIndex: 12,
    },
    timerBlur: {
      ...StyleSheet.absoluteFill,
    },
    timerHudInner: {
      paddingHorizontal: 14,
      paddingVertical: VIDEO_PREVIEW_TIMER_HUD_PADDING_V,
    },
    segmentsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    segmentCell: {
      flex: 1,
      minWidth: 0,
    },
    timerTrack: {
      height: TIMER_TRACK_HEIGHT,
      borderRadius: TIMER_TRACK_HEIGHT / 2,
      overflow: 'hidden',
      backgroundColor: trackSoftWhite,
    },
    segmentFill: {
      ...StyleSheet.absoluteFill,
      backgroundColor: trackSoftWhite,
    },
    segmentFillDone: {
      ...StyleSheet.absoluteFill,
      backgroundColor: progressBlue,
    },
    segmentProgressMask: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '100%',
      borderRadius: TIMER_TRACK_HEIGHT / 2,
      backgroundColor: progressBlue,
      transformOrigin: 'left center',
    },
    dismissArea: {
      ...StyleSheet.absoluteFill,
      zIndex: 5,
    },
    loadingOverlaySolid: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: MEDIA_PREVIEW_BACKGROUND,
      zIndex: 6,
    },
    loadingHint: {
      ...typography.footnote,
      color: colors.secondaryLabel,
    },
    errorOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: MEDIA_PREVIEW_BACKGROUND,
      paddingHorizontal: 24,
      zIndex: 8,
    },
  });
};
