import {
  paramFirst,
  decodeParamUri,
  routeVideoSegment,
  resolvePreviewVideoSegments,
} from '../lib/previewRoute';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  ActionSheetIOS,
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
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { VideoThumbnail } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  LayoutAnimationConfig,
  ReduceMotion,
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
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { NativeChromeIconButton } from '../components/ui/native-chrome-icon-button';
import { NativeMediaActions } from '../components/ui/native-media-actions';
import { NativePreviewSendButton } from '../components/ui/native-preview-send-button';
import PreviewDurationMenu from '../components/ui/preview-duration-menu';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { MEDIA_CHROME_HORIZONTAL } from '../theme/safeArea';
import { useVideoDraft, type VideoSegmentDraft } from '../context/videoDraft';
import { usePhotoDraft } from '../context/photoDraft';
import { configureForPlayback } from '../lib/audioSession';
import { trackEvent } from '../lib/telemetry';
import { generateVideoThumbnailAtTime } from '../lib/videoThumbnails';
import { disableViewerCaptureProtection } from '../lib/viewerCaptureProtection';
import { saveLocalMediaToGallery } from '../lib/saveMediaToGalleryAction';
import i18n from '../lib/i18n';
import { hasPreviewEdits } from '../lib/previewEdits';
import { setPreviewPlayerMuted } from '../lib/previewPlayback';
import {
  DEFAULT_NIX_VIEW_DURATION_SEC,
  loadPreferredNixViewDuration,
  normalizeNixViewDurationSec,
  type NixViewDurationSec,
} from '../lib/nixViewDuration';
import { PreviewMarkupTools } from '../components/preview/PreviewMarkupTools';
import { PreviewMarkupHeaderTransition } from '../components/preview/PreviewMarkupHeaderTransition';
import { PreviewSaveButton } from '../components/preview/PreviewSaveButton';
import { usePreviewDirectSend } from '../components/preview/usePreviewDirectSend';
import type { FriendProfile } from '../services/friendService';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';
import { normalizeMediaTextOverlay } from '../types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import { normalizeMediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import { flushDraftClearOnPreviewClose } from '../lib/previewDraftLifecycle';
import { nativeFilterMatrix } from '../lib/mediaFilters';
import {
  applyVideoPlayerFilterAsync,
  supportsMediaFiltersAndStickers,
} from '../../modules/nix-media-overlay';
import NixFilteredImage from '../../modules/nix-media-overlay/NixFilteredImage.ios';
import {
  mediaContentFit,
  mediaEditingViewport,
  videoContentFit,
  type MediaViewport,
} from '../lib/mediaPresentation';
import { recipientDisplayName } from '../lib/sendRecipients';

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


function discardPreview(clearDraft: () => void) {
  clearDraft();
  router.back();
}

/** Closing with added text or a drawing asks first (native action sheet); otherwise closes. */
function confirmDiscardPreview(hasEdits: boolean, clearDraft: () => void) {
  if (!hasEdits) {
    discardPreview(clearDraft);
    return;
  }
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: i18n.t('preview.discardTitle'),
      message: i18n.t('preview.discardMessage'),
      options: [i18n.t('preview.discardConfirm'), i18n.t('preview.keepEditing')],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
    },
    (buttonIndex) => {
      if (buttonIndex === 0) discardPreview(clearDraft);
    },
  );
}

function openSendToVideo(recipientId?: string) {
  router.push({
    pathname: '/send-to',
    params: { mode: 'video', ...(recipientId ? { recipientId } : {}) },
  });
}

function openSendToPhoto(viewDurationSec: number, recipientId?: string) {
  router.push({
    pathname: '/send-to',
    params: {
      mode: 'image',
      viewDurationSec: String(viewDurationSec),
      ...(recipientId ? { recipientId } : {}),
    },
  });
}

/**
 * The edge swipe back would silently throw edits away (and fights PencilKit strokes near the left
 * edge), so it is off while drawing/typing, while sending, and whenever there are edits; the X
 * button asks first instead.
 */
function PreviewBackGestureGate({ enabled }: { enabled: boolean }) {
  return <Stack.Screen options={{ gestureEnabled: enabled }} />;
}

function PreviewSendControls({
  recipient,
  isSending,
  onSendToRecipient,
  onOpenSendTo,
  sendToA11y,
  colors,
}: {
  recipient: FriendProfile | null;
  isSending: boolean;
  onSendToRecipient: () => void;
  onOpenSendTo: () => void;
  sendToA11y: string;
  colors: ThemeColors;
}) {
  const { t } = useTranslation();
  if (!recipient) {
    return (
      <NativePreviewSendButton
        label={t('sendTo.title')}
        accessibilityLabel={sendToA11y}
        onPress={onOpenSendTo}
        backgroundColor={colors.cameraControlBackground}
        tintColor={colors.cameraControlTint}
        chromeVariant="glass"
      />
    );
  }
  const label = isSending
    ? t('sendTo.securing')
    : t('preview.sendToRecipient', { name: recipientDisplayName(recipient, t('common.unknown')) });
  return (
    <View style={sendControlStyles.row}>
      <NativeChromeIconButton
        name="friends"
        accessibilityLabel={t('preview.moreRecipientsA11y')}
        onPress={onOpenSendTo}
        disabled={isSending}
        backgroundColor={colors.cameraControlBackground}
        tintColor={colors.cameraControlTint}
        chromeVariant="glass"
      />
      <View style={sendControlStyles.sendSlot}>
        <NativePreviewSendButton
          label={label}
          accessibilityLabel={label}
          onPress={onSendToRecipient}
          disabled={isSending}
          backgroundColor={colors.cameraControlBackground}
          tintColor={colors.cameraControlTint}
          chromeVariant="glass"
        />
      </View>
    </View>
  );
}

const sendControlStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  sendSlot: {
    flexShrink: 1,
  },
});

const PREVIEW_TIME_UPDATE_INTERVAL_SEC = 0.25;

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
  paused,
  muted,
  filterMatrix,
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
  paused: boolean;
  muted: boolean;
  /** Colour filter for the live preview (empty = original); same matrix as the bake. */
  filterMatrix: number[];
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    // Four samples a second; the HUD interpolates linearly between them on the UI thread instead
    // of waking JS every frame while the user edits text or draws.
    p.timeUpdateEventInterval = PREVIEW_TIME_UPDATE_INTERVAL_SEC;
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
  const pausedRef = useRef(paused);

  useEffect(() => {
    onReadyRef.current = onReady;
    onPlaybackErrorRef.current = onPlaybackError;
    segmentIndexRef.current = segmentIndex;
    requestAutoplayRef.current = (reason: string) => {
      if (errorEmittedRef.current || playingRef.current || pausedRef.current) return;
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

  // User pause/resume: autoplay retries and the watchdog must not restart a paused clip.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      player.pause();
      playingRef.current = false;
      // Stop the bar where the clip stopped instead of letting the 250 ms tick run on.
      cancelAnimation(segmentProgress);
      const duration = player.duration;
      if (duration > 0) {
        segmentProgress.set(Math.max(0, Math.min(1, 1 - player.currentTime / duration)));
      }
      return;
    }
    // An explicit user resume: play directly. The autoplay path bails out while `playingRef` is
    // set, and a paused clip that already advanced used to look "playing" to it.
    if (errorEmittedRef.current) return;
    try {
      player.play();
    } catch {
      requestAutoplayRef.current('resume');
    }
  }, [paused, player, segmentProgress]);

  useEffect(() => {
    setPreviewPlayerMuted(player, muted);
  }, [muted, player]);

  // The player item is created asynchronously; `sourceLoad` re-applies once it exists.
  const filterKey = filterMatrix.join(',');
  const filterMatrixRef = useRef(filterMatrix);
  useEffect(() => {
    filterMatrixRef.current = filterMatrix;
  }, [filterMatrix]);
  // Starts as "original": nothing to remove until a filter has been applied.
  const appliedFilterKeyRef = useRef('');
  useEffect(() => {
    if (appliedFilterKeyRef.current === filterKey) return;
    appliedFilterKeyRef.current = filterKey;
    void applyVideoPlayerFilterAsync(player, filterMatrixRef.current).catch((error) =>
      console.warn('[PreviewVideo] Could not apply filter', error)
    );
  }, [filterKey, player]);

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
    if (filterMatrixRef.current.length > 0) {
      void applyVideoPlayerFilterAsync(player, filterMatrixRef.current).catch((error) =>
        console.warn('[PreviewVideo] Could not apply filter', error)
      );
    }
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime > 0 && !playingRef.current && !pausedRef.current) {
      playingRef.current = true;
    }
    const dur = player.duration;
    if (dur > 0 && !pausedRef.current) {
      const nextProgress = Math.max(0, Math.min(1, 1 - currentTime / dur));
      // The clip loops: jump back to full instead of sweeping the bar backwards.
      if (nextProgress > segmentProgress.get()) {
        segmentProgress.set(nextProgress);
        return;
      }
      segmentProgress.set(
        withTiming(nextProgress, {
          duration: PREVIEW_TIME_UPDATE_INTERVAL_SEC * 1000,
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
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden={false} />
      <Text style={styles.errorText}>{message}</Text>
      <View style={styles.backButton}>
        <NativeMediaActions
          actions={[{ key: 'back', label: t('common.back'), accessibilityLabel: t('common.back'), onPress: onBack }]}
          tintColor={colors.cameraControlTint}
        />
      </View>
    </View>
  );
}

function PreviewVideoMedia({
  videoState,
  current,
  clipKey,
  segmentProgress,
  handleVideoReady,
  handleFirstFrameRender,
  handleVideoPlaybackError,
  onSegmentDimensions,
  rotatedStage,
  stageStyle,
  firstFrameRendered,
  poster,
  videoReady,
  videoError,
  advanceClip,
  canAdvanceClip,
  clearDraft,
  paused,
  muted,
  filterMatrix,
  tapHandledByEditor,
  styles,
}: {
  videoState: typeof initialPreviewVideoState;
  current: VideoSegmentDraft;
  clipKey: string;
  segmentProgress: ReturnType<typeof useSharedValue<number>>;
  handleVideoReady: () => void;
  handleFirstFrameRender: () => void;
  handleVideoPlaybackError: () => void;
  onSegmentDimensions: (index: number, width: number, height: number) => void;
  rotatedStage: boolean;
  stageStyle: ReturnType<typeof mediaStageStyle>;
  firstFrameRendered: boolean;
  poster: typeof initialPreviewVideoState.poster;
  videoReady: boolean;
  videoError: string | null;
  advanceClip: () => void;
  canAdvanceClip: boolean;
  clearDraft: () => void;
  paused: boolean;
  muted: boolean;
  filterMatrix: number[];
  /** The editor's filter swipe layer handles taps (next segment) itself. */
  tapHandledByEditor: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <>
      {videoState.audioReady ? (
        <PreviewSegmentVideo
          key={clipKey}
          uri={current.uri}
          segmentIndex={videoState.clipIndex}
          segmentProgress={segmentProgress}
          onReady={handleVideoReady}
          onFirstFrameRender={handleFirstFrameRender}
          onPlaybackError={handleVideoPlaybackError}
          onDimensions={(width, height) => onSegmentDimensions(videoState.clipIndex, width, height)}
          contentFit={videoContentFit(current)}
          style={[styles.image, rotatedStage ? stageStyle : undefined]}
          paused={paused}
          muted={muted}
          filterMatrix={filterMatrix}
        />
      ) : null}

      {!firstFrameRendered && poster ? (
        <Image
          source={poster}
          style={[styles.videoPoster, rotatedStage ? stageStyle : undefined]}
          contentFit={videoContentFit(current)}
        />
      ) : null}

      {/* With a single clip, "next" would reset the ready state of the very same player, which
          never fires onReady again: the picture froze under the loading overlay. */}
      {canAdvanceClip && videoReady && !videoError && !tapHandledByEditor ? (
        <Pressable
          style={styles.dismissArea}
          onPress={advanceClip}
          accessibilityLabel={t('preview.nextSegmentA11y')}
          accessibilityRole="button"
        />
      ) : null}

      {(!videoState.audioReady || !videoReady) && !videoError && !poster ? (
        <View style={styles.loadingOverlaySolid}>
          <Text style={styles.loadingHint}>{t('preview.loadingPreview')}</Text>
        </View>
      ) : null}

      {videoError ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{videoError}</Text>
          <View style={styles.backButton}>
            <NativeMediaActions
              actions={[
                {
                  key: 'back',
                  label: t('common.back'),
                  accessibilityLabel: t('common.back'),
                  onPress: () => discardPreview(clearDraft),
                },
              ]}
              tintColor={colors.cameraControlTint}
            />
          </View>
        </View>
      ) : null}
    </>
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
  recipientId,
}: {
  segments: VideoSegmentDraft[];
  clearDraft: () => void;
  textOverlay: MediaTextOverlay | null;
  onChangeTextOverlay: (next: MediaTextOverlay | null) => void;
  drawingOverlay: MediaDrawingOverlay | null;
  onChangeDrawingOverlay: (next: MediaDrawingOverlay | null) => void;
  onSegmentDimensions: (index: number, width: number, height: number) => void;
  recipientId?: string;
}) {
  const { t } = useTranslation();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { colors, isDark } = useAppTheme();
  const insets = useScreenInsets('mediaChrome');
  const styles = createStyles(colors);
  const [videoState, dispatchVideoState] = useReducer(
    previewVideoReducer,
    initialPreviewVideoState,
  );
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const directSend = usePreviewDirectSend({ isVideo: true, recipientId });
  const hasEdits = hasPreviewEdits(textOverlay, drawingOverlay);
  const layersEnabled = supportsMediaFiltersAndStickers();
  const filterMatrix = nativeFilterMatrix(drawingOverlay?.filter);
  const segmentProgress = useSharedValue(1);
  const chromeClampTop =
    insets.topContentInset +
    VIDEO_PREVIEW_TIMER_HUD_TOP +
    previewTimerHudContentHeight() +
    VIDEO_PREVIEW_CLOSE_BELOW_TIMER_GAP +
    56;
  const chromeClampBottom = insets.bottomContentInset + 56;

  const current = segments[videoState.clipIndex];
  const mediaViewport = mediaEditingViewport({
    media: current,
    viewportWidth,
    viewportHeight,
    captureOrientation: current.captureOrientation,
  });
  const rotatedStage = Boolean(mediaViewport.rotationDegrees);
  const textClampTop = rotatedStage ? 48 : Math.max(chromeClampTop, mediaViewport.top);
  const textClampBottom = rotatedStage
    ? 48
    : Math.max(chromeClampBottom, viewportHeight - mediaViewport.top - mediaViewport.height);
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
            error_message:
              error instanceof Error ? error.message : 'Unknown preview audio session error',
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
    dispatchVideoState({ type: 'error', clipKey, message: t('preview.playRecordingFailed') });
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
      <StatusBar style="light" hidden={false} />

      <PreviewVideoTimerHud
        styles={styles}
        top={insets.top + VIDEO_PREVIEW_TIMER_HUD_TOP}
        isDark={isDark}
        segmentCount={segments.length}
        clipIndex={videoState.clipIndex}
        activeSegmentMaskStyle={activeSegmentMaskStyle}
      />

      <PreviewVideoMedia
        videoState={videoState}
        current={current}
        clipKey={clipKey}
        segmentProgress={segmentProgress}
        handleVideoReady={handleVideoReady}
        handleFirstFrameRender={handleFirstFrameRender}
        handleVideoPlaybackError={handleVideoPlaybackError}
        onSegmentDimensions={onSegmentDimensions}
        rotatedStage={rotatedStage}
        stageStyle={stageStyle}
        firstFrameRendered={firstFrameRendered}
        poster={poster}
        videoReady={videoReady}
        videoError={videoError}
        advanceClip={advanceClip}
        canAdvanceClip={segments.length > 1}
        clearDraft={clearDraft}
        paused={paused}
        muted={muted}
        filterMatrix={filterMatrix}
        tapHandledByEditor={layersEnabled}
        styles={styles}
      />

      <PreviewMarkupTools
        textOverlay={textOverlay}
        onChangeTextOverlay={onChangeTextOverlay}
        drawingOverlay={drawingOverlay}
        onChangeDrawingOverlay={onChangeDrawingOverlay}
        clampTopPx={textClampTop}
        clampBottomPx={textClampBottom}
        drawingViewportStyle={stageStyle}
        editingViewportHeight={rotatedStage ? mediaViewport.height : undefined}
        textMediaFrame={rotatedStage ? undefined : { top: mediaViewport.top, height: mediaViewport.height }}
        colors={colors}
        chromeVariant="glass"
        bottomInset={insets.bottomContentInset}
        onTapMedia={
          segments.length > 1 && videoReady && !videoError ? advanceClip : undefined
        }
        tapMediaA11yLabel={t('preview.nextSegmentA11y')}
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
                  <View style={styles.topLeftCluster}>
                    <NativeChromeIconButton
                      name="close"
                      accessibilityLabel={t('preview.discardRecordingA11y')}
                      onPress={() => confirmDiscardPreview(hasEdits, clearDraft)}
                      disabled={directSend.isSending}
                      backgroundColor={colors.cameraControlBackground}
                      tintColor={colors.cameraControlTint}
                      chromeVariant="glass"
                    />
                    <NativeChromeIconButton
                      name={paused ? 'playFill' : 'pauseFill'}
                      accessibilityLabel={paused ? t('preview.playA11y') : t('preview.pauseA11y')}
                      onPress={() => setPaused((value) => !value)}
                      disabled={Boolean(videoError)}
                      backgroundColor={colors.cameraControlBackground}
                      tintColor={colors.cameraControlTint}
                      chromeVariant="glass"
                    />
                    <NativeChromeIconButton
                      name={muted ? 'speakerOff' : 'speakerOn'}
                      accessibilityLabel={muted ? t('preview.unmuteA11y') : t('preview.muteA11y')}
                      onPress={() => setMuted((value) => !value)}
                      disabled={Boolean(videoError)}
                      backgroundColor={colors.cameraControlBackground}
                      tintColor={colors.cameraControlTint}
                      chromeVariant="glass"
                    />
                  </View>
                  {normalTools}
                </>
              }
            />
            <PreviewBackGestureGate
              enabled={!hasEdits && !isDrawing && !isTextEditing && !directSend.isSending}
            />

            <LayoutAnimationConfig skipEntering>
              {!isDrawing ? (
                <Animated.View
                  entering={bottomControlsSlideIn}
                  exiting={bottomControlsSlideOut}
                  style={styles.bottomControls}
                  pointerEvents={isTextEditing ? 'none' : 'auto'}>
                  <PreviewSaveButton
                    colors={colors}
                    disabled={directSend.isSending}
                    onSave={() =>
                      saveLocalMediaToGallery({
                        source: 'preview',
                        uris: segments.map((segment) => segment.uri),
                        mediaType: 'video',
                        segmentCount: segments.length,
                        textOverlay: normalizeMediaTextOverlay(textOverlay),
                        drawingOverlay: normalizeMediaDrawingOverlay(drawingOverlay),
                        viewportWidth: mediaViewport.width,
                        viewportHeight: mediaViewport.height,
                      })
                    }
                  />
                  <View style={styles.sendButtonSlot}>
                    <PreviewSendControls
                      recipient={directSend.recipient}
                      isSending={directSend.isSending}
                      // Same duration as the send-to sheet uses for video (no picker on clips).
                      onSendToRecipient={() =>
                        directSend.sendToRecipient(normalizeNixViewDurationSec(undefined))
                      }
                      onOpenSendTo={() => openSendToVideo(recipientId)}
                      sendToA11y={t('preview.sendRecordingA11y')}
                      colors={colors}
                    />
                  </View>
                </Animated.View>
              ) : (
                <View />
              )}
            </LayoutAnimationConfig>
          </View>
        )}
      />
    </View>
  );
}

/** Save / Send slide below the edge while drawing and back after; glass inside, so no opacity. */
const BOTTOM_CONTROLS_SLIDE = {
  duration: 180,
  easing: Easing.bezier(0.23, 1, 0.32, 1),
  reduceMotion: ReduceMotion.System,
};
const BOTTOM_CONTROLS_OFFSET = 160;

function bottomControlsSlideIn() {
  'worklet';
  return {
    initialValues: { transform: [{ translateY: BOTTOM_CONTROLS_OFFSET }] },
    animations: { transform: [{ translateY: withTiming(0, BOTTOM_CONTROLS_SLIDE) }] },
  };
}

function bottomControlsSlideOut() {
  'worklet';
  return {
    initialValues: { transform: [{ translateY: 0 }] },
    animations: { transform: [{ translateY: withTiming(BOTTOM_CONTROLS_OFFSET, BOTTOM_CONTROLS_SLIDE) }] },
  };
}

export default function PreviewScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const raw = useLocalSearchParams<{
    uri?: string;
    viewDurationSec?: string;
    mode?: string;
    durationMs?: string;
    recipientId?: string;
  }>();
  const mode = paramFirst(raw.mode);
  const paramUri = decodeParamUri(paramFirst(raw.uri));
  const rawDurationMs = paramFirst(raw.durationMs);
  const recipientId = paramFirst(raw.recipientId);

  const [viewDurationSec, setViewDurationSec] = useState<NixViewDurationSec>(
    DEFAULT_NIX_VIEW_DURATION_SEC,
  );
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

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
  const {
    draft: draftPhoto,
    setDraft: setPhotoDraft,
    clearDraft: clearPhotoDraft,
  } = usePhotoDraft();
  const photoUri = draftPhoto?.uri ?? paramUri;
  const photoTextOverlay = draftPhoto?.textOverlay ?? null;
  const photoDrawingOverlay = draftPhoto?.drawingOverlay ?? null;
  const previewVideoSegments = resolvePreviewVideoSegments(segments, mode, paramUri, rawDurationMs);

  useEffect(() => {
    if (mode !== 'video' || segments?.length || !paramUri) return;
    const segment = routeVideoSegment(mode, paramUri, rawDurationMs);
    if (segment) setSegments([segment]);
  }, [mode, paramUri, rawDurationMs, segments?.length, setSegments]);

  useEffect(() => () => flushDraftClearOnPreviewClose(), []);

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
          message={t('preview.noRecordings')}
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
        recipientId={recipientId}
      />
    );
  }

  if (!photoUri) {
    return (
      <PreviewMediaError
        message={t('preview.photoNotCaptured')}
        styles={styles}
        onBack={() => router.back()}
      />
    );
  }

  if (imageLoadError) {
    return (
      <PreviewMediaError
        message={t('preview.loadPhotoFailed')}
        styles={styles}
        onBack={() => {
          clearPhotoDraft();
          router.back();
        }}
      />
    );
  }

  return (
    <PreviewPhotoContent
      draftPhoto={draftPhoto}
      photoUri={photoUri}
      photoTextOverlay={photoTextOverlay}
      photoDrawingOverlay={photoDrawingOverlay}
      setPhotoDraft={setPhotoDraft}
      clearPhotoDraft={clearPhotoDraft}
      imageLoading={imageLoading}
      setImageLoading={setImageLoading}
      setImageLoadError={setImageLoadError}
      viewDurationSec={viewDurationSec}
      setViewDurationSec={setViewDurationSec}
      recipientId={recipientId}
    />
  );
}

function PreviewPhotoContent({
  draftPhoto,
  photoUri,
  photoTextOverlay,
  photoDrawingOverlay,
  setPhotoDraft,
  clearPhotoDraft,
  imageLoading,
  setImageLoading,
  setImageLoadError,
  viewDurationSec,
  setViewDurationSec,
  recipientId,
}: {
  draftPhoto: ReturnType<typeof usePhotoDraft>['draft'];
  photoUri: string;
  photoTextOverlay: MediaTextOverlay | null;
  photoDrawingOverlay: MediaDrawingOverlay | null;
  setPhotoDraft: ReturnType<typeof usePhotoDraft>['setDraft'];
  clearPhotoDraft: () => void;
  imageLoading: boolean;
  setImageLoading: (value: boolean) => void;
  setImageLoadError: (value: boolean) => void;
  viewDurationSec: NixViewDurationSec;
  setViewDurationSec: (value: NixViewDurationSec) => void;
  recipientId?: string;
}) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useScreenInsets('mediaChrome');
  const styles = createStyles(colors);
  const directSend = usePreviewDirectSend({ isVideo: false, photoUri, recipientId });
  const hasEdits = hasPreviewEdits(photoTextOverlay, photoDrawingOverlay);
  const layersEnabled = supportsMediaFiltersAndStickers();
  const photoFilterMatrix = nativeFilterMatrix(photoDrawingOverlay?.filter);
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
        viewportHeight - photoViewport.top - photoViewport.height,
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
      <StatusBar style="light" hidden={false} />

      <Image
        source={{ uri: photoUri }}
        style={[styles.image, photoRotatedStage ? photoStageStyle : undefined]}
        contentFit={mediaContentFit(draftPhoto ?? {})}
        cachePolicy="none"
        onLoad={({ source }) => {
          setImageLoading(false);
          if (
            source.width > 0 &&
            source.height > 0 &&
            (draftPhoto?.width !== source.width || draftPhoto?.height !== source.height)
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

      {/* Same Core Image matrix as the bake; transparent for the original, so the image above
          shows through and only the filtered copy crossfades in and out. */}
      {layersEnabled && !imageLoading ? (
        <NixFilteredImage
          uri={photoUri}
          filterMatrix={photoFilterMatrix}
          contentFit={mediaContentFit(draftPhoto ?? {})}
          style={photoRotatedStage ? [photoStageStyle, styles.filteredLayer] : styles.filteredImage}
        />
      ) : null}

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
        textMediaFrame={photoRotatedStage ? undefined : { top: photoViewport.top, height: photoViewport.height }}
        colors={colors}
        chromeVariant="glass"
        bottomInset={insets.bottomContentInset}
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
                      accessibilityLabel={t('preview.discardPhotoA11y')}
                      onPress={() => confirmDiscardPreview(hasEdits, clearPhotoDraft)}
                      disabled={directSend.isSending}
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
            <PreviewBackGestureGate
              enabled={!hasEdits && !isDrawing && !isTextEditing && !directSend.isSending}
            />

            <LayoutAnimationConfig skipEntering>
              {!isDrawing ? (
                <Animated.View
                  entering={bottomControlsSlideIn}
                  exiting={bottomControlsSlideOut}
                  style={styles.bottomControls}
                  pointerEvents={isTextEditing ? 'none' : 'auto'}>
                  <PreviewSaveButton
                    colors={colors}
                    disabled={directSend.isSending}
                    onSave={() =>
                      saveLocalMediaToGallery({
                        source: 'preview',
                        uris: [photoUri],
                        mediaType: 'image',
                        textOverlay: normalizeMediaTextOverlay(photoTextOverlay),
                        drawingOverlay: normalizeMediaDrawingOverlay(photoDrawingOverlay),
                        viewportWidth: photoViewport.width,
                        viewportHeight: photoViewport.height,
                      })
                    }
                  />
                  <View style={styles.sendButtonSlot}>
                    <PreviewSendControls
                      recipient={directSend.recipient}
                      isSending={directSend.isSending}
                      onSendToRecipient={() => directSend.sendToRecipient(viewDurationSec)}
                      onOpenSendTo={() => openSendToPhoto(viewDurationSec, recipientId)}
                      sendToA11y={t('preview.choosePhotoRecipientsA11y')}
                      colors={colors}
                    />
                  </View>
                </Animated.View>
              ) : (
                <View />
              )}
            </LayoutAnimationConfig>
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
      backgroundColor: colors.cinemaBackground,
    },
    // Media chrome is always light-on-black, independent of the app's light/dark theme.
    errorText: {
      ...typography.callout,
      color: colors.cameraControlTint,
      textAlign: 'center',
      marginTop: 100,
      paddingHorizontal: 24,
    },
    backButton: {
      marginTop: spacing.xl,
      // The native button host sizes to its content; without this it hugs the leading edge.
      alignItems: 'center',
    },
    image: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    filteredImage: {
      ...StyleSheet.absoluteFill,
      zIndex: 1,
    },
    filteredLayer: {
      zIndex: 1,
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
      backgroundColor: colors.cinemaBackground,
      zIndex: 6,
    },
    loadingHint: {
      ...typography.footnote,
      color: colors.cinemaSecondaryLabel,
    },
    errorOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cinemaBackground,
      paddingHorizontal: 24,
      zIndex: 8,
    },
  });
};
