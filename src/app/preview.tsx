import { useEffect, useReducer, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  useWindowDimensions,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { VideoThumbnail } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  cancelAnimation,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { NativeChromeIconButton } from '../components/ui/native-chrome-icon-button';
import { NativePreviewSendButton } from '../components/ui/native-preview-send-button';
import PreviewDurationMenu from '../components/ui/preview-duration-menu';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { MEDIA_CHROME_HORIZONTAL } from '../theme/safeArea';
import { useVideoDraft, type VideoSegmentDraft } from '../context/videoDraft';
import { usePhotoDraft } from '../context/photoDraft';
import { configureForPlayback } from '../lib/audioSession';
import { trackEvent } from '../lib/telemetry';
import { tap } from '../lib/haptics';
import { generateVideoThumbnailAtTime } from '../lib/videoThumbnails';
import { disableViewerCaptureProtection } from '../lib/viewerCaptureProtection';
import { saveLocalMediaToGallery } from '../lib/saveMediaToGalleryAction';
import { runWithFinally } from '../lib/runWithFinally';
import {
  DEFAULT_NIX_VIEW_DURATION_SEC,
  loadPreferredNixViewDuration,
  type NixViewDurationSec,
} from '../lib/nixViewDuration';
import { PreviewMarkupTools } from '../components/preview/PreviewMarkupTools';
import { PreviewMarkupHeaderTransition } from '../components/preview/PreviewMarkupHeaderTransition';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';
import { normalizeMediaTextOverlay } from '../types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import { normalizeMediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import {
  mediaContentFit,
  mediaEditingViewport,
  videoContentFit,
  type MediaViewport,
} from '../lib/mediaPresentation';

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

function mediaStageStyle(viewport: MediaViewport): ImageStyle {
  return {
    position: 'absolute',
    left: viewport.left,
    top: viewport.top,
    right: undefined,
    bottom: undefined,
    width: viewport.width,
    height: viewport.height,
    transform: viewport.rotationDegrees
      ? [{ rotate: `${viewport.rotationDegrees}deg` }]
      : undefined,
  };
}

function previewTimerHudContentHeight() {
  return VIDEO_PREVIEW_TIMER_HUD_PADDING_V * 2 + TIMER_TRACK_HEIGHT;
}

function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function decodeParamUri(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function discardVideoPreview(clearDraft: () => void) {
  clearDraft();
  router.back();
}

function openSendToVideo() {
  tap('light');
  router.push({ pathname: '/send-to', params: { mode: 'video' } });
}

function discardPhotoPreview(clearDraft: () => void) {
  clearDraft();
  router.back();
}

function openSendToPhoto(viewDurationSec: number, recipientId?: string) {
  tap('light');
  router.push({
    pathname: '/send-to',
    params: {
      mode: 'image',
      viewDurationSec: String(viewDurationSec),
      ...(recipientId ? { recipientId } : {}),
    },
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
  onDimensions,
  contentFit,
  style,
}: {
  uri: string;
  segmentIndex: number;
  segmentProgress: SharedValue<number>;
  onReady: () => void;
  onFirstFrameRender: () => void;
  onPlaybackError: () => void;
  onDimensions: (width: number, height: number) => void;
  contentFit: 'contain' | 'cover';
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

  useEventListener(player, 'sourceLoad', ({ availableVideoTracks }) => {
    const size = availableVideoTracks[0]?.size;
    if (size?.width && size?.height) onDimensions(size.width, size.height);
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
      contentFit={contentFit}
      nativeControls={false}
      onFirstFrameRender={() => {
        onFirstFrameRender();
        markReadyRef.current('first-frame-render');
        requestAutoplayRef.current('first-frame-render');
      }}
    />
  );
}

function PreviewVideoTimerHud({
  styles,
  top,
  isDark,
  segmentCount,
  clipIndex,
  activeSegmentMaskStyle,
}: {
  styles: ReturnType<typeof createStyles>;
  top: number;
  isDark: boolean;
  segmentCount: number;
  clipIndex: number;
  activeSegmentMaskStyle: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
}) {
  return (
    <View style={[styles.timerHudShell, { top }]}>
      <BlurView intensity={isDark ? 72 : 58} tint={isDark ? 'dark' : 'light'} style={styles.timerBlur} />
      <View style={styles.timerHudInner}>
        <View style={styles.segmentsRow}>
          {Array.from({ length: segmentCount }, (_, segIndex) => (
            <View key={`seg-${segIndex}`} style={styles.segmentCell}>
              <View style={styles.timerTrack}>
                {segIndex < clipIndex ? <View style={styles.segmentFillDone} /> : null}
                {segIndex === clipIndex ? (
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
          ))}
        </View>
      </View>
    </View>
  );
}

function PreviewMediaError({
  message,
  onBack,
  styles,
}: {
  message: string;
  onBack: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Wróć</Text>
      </Pressable>
    </View>
  );
}

function PreviewVideoContent({
  segments,
  clearDraft,
  textOverlay,
  onChangeTextOverlay,
  drawingOverlay,
  onChangeDrawingOverlay,
  onSegmentDimensions,
}: {
  segments: VideoSegmentDraft[];
  clearDraft: () => void;
  textOverlay: MediaTextOverlay | null;
  onChangeTextOverlay: (next: MediaTextOverlay | null) => void;
  drawingOverlay: MediaDrawingOverlay | null;
  onChangeDrawingOverlay: (next: MediaDrawingOverlay | null) => void;
  onSegmentDimensions: (index: number, width: number, height: number) => void;
}) {
  const { t } = useTranslation();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { colors, statusBarStyle, isDark } = useAppTheme();
  const insets = useScreenInsets('mediaChrome');
  const styles = createStyles(colors);
  const [videoState, dispatchVideoState] = useReducer(previewVideoReducer, initialPreviewVideoState);
  const [isSaving, setIsSaving] = useState(false);
  const segmentProgress = useSharedValue(1);
  const chromeClampTop =
    insets.topContentInset
    + VIDEO_PREVIEW_TIMER_HUD_TOP
    + previewTimerHudContentHeight()
    + VIDEO_PREVIEW_CLOSE_BELOW_TIMER_GAP
    + 56;
  const chromeClampBottom = insets.bottomContentInset + 56;

  const current = segments[videoState.clipIndex];
  const mediaViewport = mediaEditingViewport({
    media: current,
    viewportWidth,
    viewportHeight,
    captureOrientation: current.captureOrientation,
  });
  const rotatedStage = Boolean(mediaViewport.rotationDegrees);
  const textClampTop = rotatedStage
    ? 48
    : Math.max(chromeClampTop, mediaViewport.top);
  const textClampBottom = rotatedStage
    ? 48
    : Math.max(
        chromeClampBottom,
        viewportHeight - mediaViewport.top - mediaViewport.height
      );
  const stageStyle = mediaStageStyle(mediaViewport);
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
    // Lazy poster: opóźnij generowanie miniatury o 500 ms — VideoView
    // zazwyczaj renderuje pierwszą klatkę szybciej, eliminując potrzebę
    // osobnego postera i oszczędzając alokację natywnego VideoPlayer.
    const timer = setTimeout(() => {
      if (cancelled || videoState.firstFrameClipKey === clipKey) return;
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
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [current.uri, clipKey, videoState.clipIndex, videoState.firstFrameClipKey]);

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} hidden={false} />

      <PreviewVideoTimerHud
        styles={styles}
        top={insets.top + VIDEO_PREVIEW_TIMER_HUD_TOP}
        isDark={isDark}
        segmentCount={segments.length}
        clipIndex={videoState.clipIndex}
        activeSegmentMaskStyle={activeSegmentMaskStyle}
      />

      {videoState.audioReady ? (
        <PreviewSegmentVideo
          key={clipKey}
          uri={current.uri}
          segmentIndex={videoState.clipIndex}
          segmentProgress={segmentProgress}
          onReady={handleVideoReady}
          onFirstFrameRender={handleFirstFrameRender}
          onPlaybackError={handleVideoPlaybackError}
          onDimensions={(width, height) =>
            onSegmentDimensions(videoState.clipIndex, width, height)
          }
          contentFit={videoContentFit(current)}
          style={[styles.image, rotatedStage ? stageStyle : undefined]}
        />
      ) : null}

      {!firstFrameRendered && poster ? (
        <Image
          source={poster}
          style={[styles.videoPoster, rotatedStage ? stageStyle : undefined]}
          contentFit={videoContentFit(current)}
        />
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

      <PreviewMarkupTools
        textOverlay={textOverlay}
        onChangeTextOverlay={onChangeTextOverlay}
        drawingOverlay={drawingOverlay}
        onChangeDrawingOverlay={onChangeDrawingOverlay}
        clampTopPx={textClampTop}
        clampBottomPx={textClampBottom}
        drawingViewportStyle={stageStyle}
        editingViewportHeight={rotatedStage ? mediaViewport.height : undefined}
        colors={colors}
        chromeVariant="glass"
        renderChrome={({ normalTools, drawingHeader, isTextEditing, isDrawing }) => (
          <View
            style={[
              styles.overlay,
              styles.overlayVideoChrome,
              {
                paddingTop:
                  insets.topContentInset +
                  VIDEO_PREVIEW_TIMER_HUD_TOP +
                  previewTimerHudContentHeight() +
                  VIDEO_PREVIEW_CLOSE_BELOW_TIMER_GAP,
                paddingBottom: insets.bottomContentInset,
                paddingLeft: MEDIA_CHROME_HORIZONTAL + insets.left,
                paddingRight: MEDIA_CHROME_HORIZONTAL + insets.right,
              },
            ]}
            pointerEvents="box-none">
            <PreviewMarkupHeaderTransition
              isDrawing={isDrawing}
              isTextEditing={isTextEditing}
              drawingHeader={drawingHeader}
              normalHeader={
                <>
                  <NativeChromeIconButton
                    name="close"
                    accessibilityLabel="Porzuć nagranie"
                    onPress={() => discardVideoPreview(clearDraft)}
                    backgroundColor={colors.cameraControlBackground}
                    tintColor={colors.cameraControlTint}
                    chromeVariant="glass"
                  />
                  {normalTools}
                </>
              }
            />

            {!isDrawing ? (
              <View
                style={styles.bottomControls}
                pointerEvents={isTextEditing ? 'none' : 'auto'}>
                <NativeChromeIconButton
                  name="saveToPhotos"
                  accessibilityLabel={t('media.saveToGalleryA11y')}
                  onPress={() => {
                    if (isSaving) return;
                    setIsSaving(true);
                    void runWithFinally(
                      () =>
                        saveLocalMediaToGallery({
                          source: 'preview',
                          uris: segments.map((segment) => segment.uri),
                          mediaType: 'video',
                          segmentCount: segments.length,
                          textOverlay: normalizeMediaTextOverlay(textOverlay),
                          drawingOverlay: normalizeMediaDrawingOverlay(drawingOverlay),
                          viewportWidth: mediaViewport.width,
                          viewportHeight: mediaViewport.height,
                        }),
                      () => setIsSaving(false)
                    );
                  }}
                  disabled={isSaving}
                  backgroundColor={colors.cameraControlBackground}
                  tintColor={colors.cameraControlTint}
                  chromeVariant="glass"
                />
                <View style={styles.sendButtonSlot}>
                  <NativePreviewSendButton
                    label="Wyślij do"
                    accessibilityLabel="Wyślij nagranie"
                    onPress={openSendToVideo}
                    backgroundColor={colors.cameraControlBackground}
                    tintColor={colors.cameraControlTint}
                    chromeVariant="glass"
                  />
                </View>
              </View>
            ) : (
              <View />
            )}
          </View>
        )}
      />
    </View>
  );
}

export default function PreviewScreen() {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { t } = useTranslation();
  const { colors, statusBarStyle } = useAppTheme();
  const insets = useScreenInsets('mediaChrome');
  const styles = createStyles(colors);
  const raw = useLocalSearchParams<{ uri?: string; viewDurationSec?: string; mode?: string; durationMs?: string; recipientId?: string }>();
  const mode = paramFirst(raw.mode);
  const paramUri = decodeParamUri(paramFirst(raw.uri));
  const rawDurationMs = paramFirst(raw.durationMs);
  const recipientId = paramFirst(raw.recipientId);

  const [viewDurationSec, setViewDurationSec] = useState<NixViewDurationSec>(DEFAULT_NIX_VIEW_DURATION_SEC);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  const {
    segments,
    setSegments,
    updateSegmentDimensions,
    clearSegments,
    textOverlay: videoTextOverlay,
    setTextOverlay,
    drawingOverlay: videoDrawingOverlay,
    setDrawingOverlay,
  } = useVideoDraft();
  const { draft: draftPhoto, setDraft: setPhotoDraft, clearDraft: clearPhotoDraft } = usePhotoDraft();
  const photoUri = draftPhoto?.uri ?? paramUri;
  const photoTextOverlay = draftPhoto?.textOverlay ?? null;
  const photoDrawingOverlay = draftPhoto?.drawingOverlay ?? null;
  const routeVideoSegment =
    mode === 'video' && paramUri
      ? { uri: paramUri, durationMs: Math.round(Math.max(0, Number(rawDurationMs) || 0)) }
      : null;
  const routeVideoSegments = routeVideoSegment ? [routeVideoSegment] : null;
  const previewVideoSegments = segments?.length ? segments : routeVideoSegments;

  useEffect(() => {
    if (mode !== 'video' || segments?.length || !paramUri) return;
    setSegments([{ uri: paramUri, durationMs: Math.round(Math.max(0, Number(rawDurationMs) || 0)) }]);
  }, [mode, paramUri, rawDurationMs, segments?.length, setSegments]);

  useEffect(() => {
    let cancelled = false;
    void loadPreferredNixViewDuration().then((sec) => {
      if (!cancelled) setViewDurationSec(sec);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void disableViewerCaptureProtection().catch((error) => {
      console.warn('Could not clear screen capture protection before preview', error);
    });
  }, []);

  const [prevPhotoUri, setPrevPhotoUri] = useState(photoUri);
  if (photoUri !== prevPhotoUri) {
    setPrevPhotoUri(photoUri);
    setImageLoadError(false);
    setImageLoading(Boolean(photoUri));
  }

  if (mode === 'video') {
    if (!previewVideoSegments?.length) {
      return (
        <PreviewMediaError
          message="Brak nagrań do podglądu"
          styles={styles}
          onBack={() => {
            clearSegments();
            router.back();
          }}
        />
      );
    }
    return (
      <PreviewVideoContent
        segments={previewVideoSegments}
        clearDraft={clearSegments}
        textOverlay={videoTextOverlay}
        onChangeTextOverlay={setTextOverlay}
        drawingOverlay={videoDrawingOverlay}
        onChangeDrawingOverlay={setDrawingOverlay}
        onSegmentDimensions={updateSegmentDimensions}
      />
    );
  }

  if (!photoUri) {
    return (
      <PreviewMediaError
        message="Nie przechwycono zdjęcia"
        styles={styles}
        onBack={() => router.back()}
      />
    );
  }

  if (imageLoadError) {
    return (
      <PreviewMediaError
        message="Nie udało się wczytać zdjęcia"
        styles={styles}
        onBack={() => {
          clearPhotoDraft();
          router.back();
        }}
      />
    );
  }

  const photoViewport = mediaEditingViewport({
    media: draftPhoto ?? {},
    viewportWidth,
    viewportHeight,
    captureOrientation: draftPhoto?.captureOrientation,
  });
  const photoRotatedStage = Boolean(photoViewport.rotationDegrees);
  const photoClampTop = photoRotatedStage
    ? 48
    : Math.max(insets.topContentInset + 56, photoViewport.top);
  const photoClampBottom = photoRotatedStage
    ? 48
    : Math.max(
        insets.bottomContentInset + 56,
        viewportHeight - photoViewport.top - photoViewport.height
      );
  const photoStageStyle = mediaStageStyle(photoViewport);

  const setPhotoTextOverlay = (next: MediaTextOverlay | null) => {
    if (!draftPhoto && !photoUri) return;
    setPhotoDraft({
      uri: photoUri!,
      width: draftPhoto?.width,
      height: draftPhoto?.height,
      captureOrientation: draftPhoto?.captureOrientation,
      textOverlay: next,
      drawingOverlay: draftPhoto?.drawingOverlay ?? null,
      ownedTemporaryUris: draftPhoto?.ownedTemporaryUris,
    });
  };

  const setPhotoDrawingOverlay = (next: MediaDrawingOverlay | null) => {
    if (!draftPhoto && !photoUri) return;
    setPhotoDraft({
      uri: photoUri!,
      width: draftPhoto?.width,
      height: draftPhoto?.height,
      captureOrientation: draftPhoto?.captureOrientation,
      textOverlay: draftPhoto?.textOverlay ?? null,
      drawingOverlay: next,
      ownedTemporaryUris: draftPhoto?.ownedTemporaryUris,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} hidden={false} />

      <Image
        source={{ uri: photoUri }}
        style={[styles.image, photoRotatedStage ? photoStageStyle : undefined]}
        contentFit={mediaContentFit(draftPhoto ?? {})}
        cachePolicy="none"
        onLoad={({ source }) => {
          setImageLoading(false);
          if (
            source.width > 0
            && source.height > 0
            && (draftPhoto?.width !== source.width || draftPhoto?.height !== source.height)
          ) {
            setPhotoDraft({
              uri: photoUri,
              width: source.width,
              height: source.height,
              captureOrientation: draftPhoto?.captureOrientation,
              textOverlay: draftPhoto?.textOverlay ?? null,
              drawingOverlay: draftPhoto?.drawingOverlay ?? null,
              ownedTemporaryUris: draftPhoto?.ownedTemporaryUris,
            });
          }
        }}
        onError={() => {
          console.warn('[PreviewPhoto] expo-image failed to load', { uri: photoUri });
          setImageLoading(false);
          setImageLoadError(true);
        }}
      />

      {imageLoading ? (
        <View style={styles.imageLoadingOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.cameraControlTint} size="large" />
        </View>
      ) : null}

      <PreviewMarkupTools
        textOverlay={photoTextOverlay}
        onChangeTextOverlay={setPhotoTextOverlay}
        drawingOverlay={photoDrawingOverlay}
        onChangeDrawingOverlay={setPhotoDrawingOverlay}
        clampTopPx={photoClampTop}
        clampBottomPx={photoClampBottom}
        drawingViewportStyle={photoStageStyle}
        editingViewportHeight={photoRotatedStage ? photoViewport.height : undefined}
        colors={colors}
        chromeVariant="glass"
        renderChrome={({ normalTools, drawingHeader, isTextEditing, isDrawing }) => (
          <View
            style={[
              styles.overlay,
              {
                paddingTop: insets.topContentInset,
                paddingBottom: insets.bottomContentInset,
                paddingLeft: MEDIA_CHROME_HORIZONTAL + insets.left,
                paddingRight: MEDIA_CHROME_HORIZONTAL + insets.right,
              },
            ]}
            pointerEvents="box-none">
            <PreviewMarkupHeaderTransition
              isDrawing={isDrawing}
              isTextEditing={isTextEditing}
              drawingHeader={drawingHeader}
              normalHeader={
                <>
                  <View style={styles.topLeftCluster}>
                    <NativeChromeIconButton
                      name="close"
                      accessibilityLabel="Odrzuć zdjęcie"
                      onPress={() => discardPhotoPreview(clearPhotoDraft)}
                      backgroundColor={colors.cameraControlBackground}
                      tintColor={colors.cameraControlTint}
                      chromeVariant="glass"
                    />
                    <PreviewDurationMenu
                      selectedDurationSec={viewDurationSec}
                      onSelect={setViewDurationSec}
                      colors={colors}
                      chromeVariant="glass"
                    />
                  </View>
                  {normalTools}
                </>
              }
            />

            {!isDrawing ? (
              <View
                style={styles.bottomControls}
                pointerEvents={isTextEditing ? 'none' : 'auto'}>
                <NativeChromeIconButton
                  name="saveToPhotos"
                  accessibilityLabel={t('media.saveToGalleryA11y')}
                  onPress={() => {
                    if (isSavingPhoto || !photoUri) return;
                    setIsSavingPhoto(true);
                    void runWithFinally(
                      () =>
                        saveLocalMediaToGallery({
                          source: 'preview',
                          uris: [photoUri],
                          mediaType: 'image',
                          textOverlay: normalizeMediaTextOverlay(photoTextOverlay),
                          drawingOverlay: normalizeMediaDrawingOverlay(photoDrawingOverlay),
                          viewportWidth: photoViewport.width,
                          viewportHeight: photoViewport.height,
                        }),
                      () => setIsSavingPhoto(false)
                    );
                  }}
                  disabled={isSavingPhoto}
                  backgroundColor={colors.cameraControlBackground}
                  tintColor={colors.cameraControlTint}
                  chromeVariant="glass"
                />
                <View style={styles.sendButtonSlot}>
                  <NativePreviewSendButton
                    label="Wyślij do"
                    accessibilityLabel="Wybierz odbiorców zdjęcia"
                    onPress={() => openSendToPhoto(viewDurationSec, recipientId)}
                    backgroundColor={colors.cameraControlBackground}
                    tintColor={colors.cameraControlTint}
                    chromeVariant="glass"
                  />
                </View>
              </View>
            ) : (
              <View />
            )}
          </View>
        )}
      />
    </View>
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
    imageLoadingOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
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
    topLeftCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    bottomControls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      width: '100%',
    },
    sendButtonSlot: {
      flexShrink: 1,
      maxWidth: '58%',
      alignItems: 'flex-end',
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
