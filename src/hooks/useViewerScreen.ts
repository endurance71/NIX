import { useState, useEffect, useRef, useEffectEvent, useMemo, useReducer } from 'react';
import type { ViewStyle } from 'react-native';
import { ActionSheetIOS, Alert, unstable_batchedUpdates } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
import type { AnimatedStyle } from 'react-native-reanimated';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useScreenInsets } from './useScreenInsets';
import type { EdgeInsets } from '../theme/safeArea';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSignedNixUrl,
  flushCleanupQueue,
  fetchUnreadInboxQueueFromSender,
  fetchInboxNixById,
} from '../services/nixService';
import { markViewerSlideViewed, markViewerSlideUnplayable } from '../lib/viewerSlideActions';
import { normalizeNixViewDurationSec } from '../lib/nixViewDuration';
import { useAppTheme } from './useAppTheme';
import { clearMediaMemoryCache } from '../lib/mediaCache';
import { nowMs, trackDuration, trackEvent } from '../lib/telemetry';
import { queryKeys } from '../lib/queryKeys';
import { generateVideoThumbnailAtTime } from '../lib/videoThumbnails';
import { selection } from '../lib/haptics';
import { configureForPlayback } from '../lib/audioSession';
import { getCapturePolicyForSender } from '../services/capturePolicyService';
import { shouldBlockCapture } from '../lib/capturePolicy';
import { useAppStateSnapshot } from './useAppStateSnapshot';
import { useViewerCaptureGuard } from './useViewerCaptureGuard';
import { toViewerQueueItem } from '../lib/viewerQueue';
import { createViewerStyles } from '../components/viewer/viewerScreen.styles';
import { markInboxNixUnplayableInCache, markInboxNixViewedInCache } from '../lib/inboxQuery';
import { useTranslation } from 'react-i18next';
import { blockUser, reportNix, type ReportReason } from '../services/safetyService';
import { notifyDomainError, notifySuccess } from '../lib/appNotify';
import { runWithFinally } from '../lib/runWithFinally';
import { saveRemoteMediaToGallery } from '../lib/saveMediaToGalleryAction';
import { supabase } from '../lib/supabase';
import { classifyViewerFailure, type ViewerFailureKind } from '../lib/viewerRoute';
import {
  initialViewerMachineState,
  viewerMachineReducer,
  type ViewerMachineError,
  type ViewerMachineState,
} from '../lib/viewerMachine';

type NixQueueItem = {
  id: string;
  media_path: string;
  view_duration_sec: number;
  media_type: string;
  playback_duration_ms: number | null;
  thumbnail_b64: string | null;
};

type ViewerError = ViewerMachineError & {
  kind: Exclude<ViewerFailureKind, 'unauthorized'>;
};

function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export type ViewerScreenViewModel = {
  viewerPhase: ViewerMachineState['status'];
  isBootLoading: boolean;
  styles: ReturnType<typeof createViewerStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  statusBarStyle: ReturnType<typeof useAppTheme>['statusBarStyle'];
  isDark: boolean;
  insets: EdgeInsets;
  queue: NixQueueItem[];
  slideIndex: number;
  closing: boolean;
  currentNix: NixQueueItem | null;
  displayedNix: NixQueueItem | null;
  imageUrl: string | null;
  loading: boolean;
  imageReady: boolean;
  imageLoadError: string | null;
  viewerError: ViewerError | null;
  useNativeFallback: boolean;
  videoPosterUri: string | null;
  videoThumbnailOverlay: VideoThumbnail | null;
  canDismissByTap: boolean;
  finishCurrentSlide: () => void;
  segmentProgress: ReturnType<typeof useSharedValue<number>>;
  onSegmentProgress: (nextProgress: number) => void;
  activeSegmentMaskStyle: AnimatedStyle<ViewStyle>;
  shouldBlurOverlay: boolean;
  onVideoReady: () => void;
  onVideoError: () => void;
  onPrimaryImageLoad: () => void;
  onPrimaryImageError: (event: unknown) => void;
  onFallbackImageLoad: () => void;
  onFallbackImageError: () => void;
  safetyAvailable: boolean;
  safetyBusy: boolean;
  safetyPaused: boolean;
  openSafetyMenu: () => void;
  canSaveToGallery: boolean;
  isSavingToGallery: boolean;
  saveToGalleryA11y: string;
  saveToGallery: () => void;
  retryViewer: () => void;
  leaveViewer: () => void;
  skipUnavailable: () => void;
};

export function useViewerScreen(): ViewerScreenViewModel {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { colors, statusBarStyle, isDark } = useAppTheme();
  const insets = useScreenInsets('mediaChrome');
  const styles = createViewerStyles(colors);
  const raw = useLocalSearchParams<{
    id?: string;
    path?: string;
    senderId?: string;
    viewDurationSec?: string;
    mediaType?: string;
    playbackDurationMs?: string;
    thumbnailB64?: string;
    isReplay?: string;
  }>();
  const paramId = paramFirst(raw.id);
  const paramPath = paramFirst(raw.path);
  const paramSenderId = paramFirst(raw.senderId);
  const paramViewDurationSec = normalizeNixViewDurationSec(paramFirst(raw.viewDurationSec));
  const paramMediaType = paramFirst(raw.mediaType) === 'video' ? 'video' : 'image';
  const rawPlaybackDurationMs = Number(paramFirst(raw.playbackDurationMs));
  const paramPlaybackDurationMs = Number.isFinite(rawPlaybackDurationMs) && rawPlaybackDurationMs > 0
    ? rawPlaybackDurationMs
    : null;
  const paramThumbnailB64 = paramFirst(raw.thumbnailB64) || null;
  const paramIsReplay = paramFirst(raw.isReplay) === '1';
  const seedItem = useMemo<NixQueueItem | null>(() => paramId && paramPath ? ({
    id: paramId,
    media_path: paramPath,
    view_duration_sec: paramViewDurationSec,
    media_type: paramMediaType,
    playback_duration_ms: paramPlaybackDurationMs,
    thumbnail_b64: paramThumbnailB64,
  }) : null, [paramId, paramPath, paramViewDurationSec, paramMediaType, paramPlaybackDurationMs, paramThumbnailB64]);

  const [queueState, setQueueState] = useState<{
    queueLoading: boolean;
    queue: NixQueueItem[];
    slideIndex: number;
    closing: boolean;
  }>({
    queueLoading: true,
    queue: seedItem ? [seedItem] : [],
    slideIndex: 0,
    closing: false,
  });
  const { queueLoading, queue, slideIndex, closing } = queueState;
  const [mediaState, setMediaState] = useState<{
    renderNix: NixQueueItem | null;
    imageUrl: string | null;
    loading: boolean;
    imageReady: boolean;
    imageLoadError: string | null;
    useNativeFallback: boolean;
    videoPosterUri: string | null;
    videoThumbnailOverlay: VideoThumbnail | null;
  }>({
    renderNix: null,
    imageUrl: null,
    loading: true,
    imageReady: false,
    imageLoadError: null,
    useNativeFallback: false,
    videoPosterUri: null,
    videoThumbnailOverlay: null,
  });
  const {
    renderNix,
    imageUrl,
    loading,
    imageReady,
    imageLoadError,
    useNativeFallback,
    videoPosterUri,
    videoThumbnailOverlay,
  } = mediaState;
  const appState = useAppStateSnapshot();
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [safetyPaused, setSafetyPaused] = useState(false);
  const [canDismissByTap, setCanDismissByTap] = useState(false);
  const [viewerMachine, dispatchViewer] = useReducer(viewerMachineReducer, initialViewerMachineState);
  const viewerError: ViewerError | null = viewerMachine.error;
  const setViewerError = (error: ViewerError | null) => {
    dispatchViewer(error ? { type: 'fail', error } : { type: 'load' });
  };
  const [queueRetryKey, setQueueRetryKey] = useState(0);
  const [mediaRetryKey, setMediaRetryKey] = useState(0);
  const segmentProgress = useSharedValue(1);
  const lastFinishedSlideIdRef = useRef<string | null>(null);

  const queueRef = useRef<NixQueueItem[]>(queue);
  const slideIndexRef = useRef(slideIndex);
  const closingRef = useRef(closing);

  useEffect(() => {
    if (!imageReady || imageLoadError || loading) return;
    const timer = setTimeout(() => {
      setCanDismissByTap(true);
    }, 350);
    return () => {
      clearTimeout(timer);
      setCanDismissByTap(false);
    };
  }, [imageReady, imageLoadError, loading, slideIndex]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    slideIndexRef.current = slideIndex;
  }, [slideIndex]);
  useEffect(() => {
    closingRef.current = closing;
  }, [closing]);

  useEffect(() => {
    void configureForPlayback().catch((error) => {
      console.warn('Viewer audio session setup failed', error);
    });
  }, []);

  const { data: capturePolicy = 'deny', isPending: capturePolicyPending } = useQuery({
    queryKey: queryKeys.capturePolicyForSender(paramSenderId ?? null),
    queryFn: async () => {
      if (!paramSenderId) return 'deny';
      return getCapturePolicyForSender(paramSenderId);
    },
    staleTime: 60_000,
  });

  const currentNix = queue[slideIndex] ?? null;
  const displayedNix = renderNix ?? currentNix;

  const captureDenied = shouldBlockCapture(capturePolicy);
  const canSaveToGallery = !captureDenied;
  const shouldBlurOverlay = captureDenied && appState !== 'active';

  useViewerCaptureGuard(capturePolicyPending ? null : captureDenied, paramSenderId, displayedNix?.id);
  const [isSavingToGallery, setIsSavingToGallery] = useState(false);

  const signedUrlTtlSec = (() => {
    const totalViewSec = queue.reduce((acc, s) => {
      if (s.media_type === 'video' && typeof s.playback_duration_ms === 'number') {
        return acc + s.playback_duration_ms / 1000;
      }
      return acc + (s.view_duration_sec ?? 5);
    }, 0);
    return Math.min(600, 90 + totalViewSec);
  })();

  useEffect(() => {
    let cancelled = false;

    async function initQueue() {
      trackEvent('viewer_load_stage', { stage: 'queue', status: 'started' });
      setViewerError(null);
      if (paramIsReplay && paramId) {
        try {
          const nix = await fetchInboxNixById(paramId);
          if (cancelled) return;
          const mappedQueue = [toViewerQueueItem(nix)];
          unstable_batchedUpdates(() => {
            setQueueState((current) => ({ ...current, queue: mappedQueue, queueLoading: false }));
          });
          trackEvent('viewer_load_stage', { stage: 'queue', status: 'success', mode: 'replay' });
        } catch (err) {
          console.error('Nie udało się pobrać nixa do replay', err);
          if (!cancelled) {
            setQueueState((current) => ({ ...current, queueLoading: false }));
            if (!seedItem) setViewerError({ kind: 'transient', message: 'Nie udało się pobrać medium.', reason: 'queue_replay_failed' });
          }
          trackEvent('viewer_load_stage', { stage: 'queue', status: 'failure', error_class: 'transient' });
        }
        return;
      }

      if (paramSenderId) {
        try {
          const nixes = await fetchUnreadInboxQueueFromSender(paramSenderId);
          if (cancelled) return;
          if (nixes.length === 0) {
            setQueueState((current) => ({ ...current, queueLoading: false }));
            if (!seedItem) setViewerError({ kind: 'permanentMissing', message: 'Medium jest niedostępne.', reason: 'empty_queue' });
            return;
          }
          const mappedQueue = nixes.map(toViewerQueueItem);

          unstable_batchedUpdates(() => {
            setQueueState((current) => ({ ...current, queue: mappedQueue, queueLoading: false }));
          });
          trackEvent('viewer_load_stage', { stage: 'queue', status: 'success', mode: 'inbox' });
        } catch (err) {
          console.error('Nie udało się pobrać kolejki nixów', err);
          if (!cancelled) {
            setQueueState((current) => ({ ...current, queueLoading: false }));
            if (!seedItem) setViewerError({ kind: 'transient', message: 'Nie udało się pobrać wiadomości.', reason: 'queue_fetch_failed' });
          }
          trackEvent('viewer_load_stage', { stage: 'queue', status: 'failure', error_class: 'transient' });
        }
        return;
      }

      if (seedItem) {
        unstable_batchedUpdates(() => {
          setQueueState((current) => ({
            ...current,
            queue: [
              seedItem,
            ],
            queueLoading: false,
          }));
        });
        trackEvent('viewer_load_stage', { stage: 'queue', status: 'success', mode: 'seed' });
        return;
      }

      setQueueState((current) => ({ ...current, queueLoading: false }));
      setViewerError({ kind: 'permanentMissing', message: 'Nieprawidłowy link do medium.', reason: 'missing_params' });
      trackEvent('viewer_load_stage', { stage: 'queue', status: 'failure', error_class: 'permanentMissing' });
    }

    void initQueue();
    return () => {
      cancelled = true;
    };
  }, [paramSenderId, paramId, paramIsReplay, queueRetryKey, seedItem]);

  useEffect(() => {
    flushCleanupQueue().catch((err) => {
      console.warn('Nie udało się zsynchronizować kolejki cleanup', err);
    });

    return () => {
      void clearMediaMemoryCache();
    };
  }, [queryClient]);



  const finishCurrentSlide = () => {
    if (closingRef.current) return;
    const item = queueRef.current[slideIndexRef.current];
    if (!item) return;
    if (lastFinishedSlideIdRef.current === item.id) return;
    lastFinishedSlideIdRef.current = item.id;

    cancelAnimation(segmentProgress);
    segmentProgress.set(1);

    markInboxNixViewedInCache(queryClient, item.id);
    void markViewerSlideViewed(item, paramIsReplay ? 'replayed' : 'viewed', () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
    });

    advanceAfterCurrentSlide();
  };

  /** Load/media failure — do not treat as a successful open (no replay window). */
  const skipUnplayableSlide = (reason: string) => {
    if (closingRef.current) return;
    const item = queueRef.current[slideIndexRef.current];
    if (!item) return;
    if (lastFinishedSlideIdRef.current === item.id) return;
    lastFinishedSlideIdRef.current = item.id;

    cancelAnimation(segmentProgress);
    segmentProgress.set(1);

    markInboxNixUnplayableInCache(queryClient, item.id);
    void markViewerSlideUnplayable(item, reason, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
    });

    advanceAfterCurrentSlide();
  };

  const advanceAfterCurrentSlide = () => {
    if (slideIndexRef.current < queueRef.current.length - 1) {
      if (queueRef.current.length > 1) {
        selection();
      }
      unstable_batchedUpdates(() => {
        setQueueState((current) => ({ ...current, slideIndex: current.slideIndex + 1 }));
        setMediaState((current) => ({
          ...current,
          renderNix: null,
          imageUrl: null,
          loading: true,
          imageReady: false,
          imageLoadError: null,
          useNativeFallback: false,
          videoPosterUri: null,
          videoThumbnailOverlay: null,
        }));
        setCanDismissByTap(false);
      });
    } else {
      trackEvent('viewer_close_reason', { reason: 'completed_last_item' });
      dispatchViewer({ type: 'close' });
      setQueueState((current) => ({ ...current, closing: true }));
      router.back();
    }
  };

  const finishCurrentSlideEvent = useEffectEvent(() => {
    finishCurrentSlide();
  });

  useEffect(() => {
    const path = currentNix?.media_path;
    const skipImagePrefetch = currentNix?.media_type === 'video';
    if (!path || queueLoading || closing) return;

    let cancelled = false;
    const embeddedPosterUri =
      currentNix?.media_type === 'video' && currentNix.thumbnail_b64
        ? currentNix.thumbnail_b64.startsWith('data:')
          ? currentNix.thumbnail_b64
          : `data:image/jpeg;base64,${currentNix.thumbnail_b64}`
        : null;
    unstable_batchedUpdates(() => {
      setViewerError(null);
      setMediaState((current) => ({
        ...current,
        loading: true,
        imageReady: false,
        imageLoadError: null,
        useNativeFallback: false,
        videoPosterUri: embeddedPosterUri,
        videoThumbnailOverlay: null,
      }));
    });
    if (currentNix?.media_type === 'video' && currentNix?.thumbnail_b64) {
      trackEvent('viewer_thumbnail_source', { source: 'embedded' });
    } else if (currentNix?.media_type === 'video') {
      trackEvent('viewer_thumbnail_source', { source: 'missing' });
    }

    (async () => {
      try {
        const signedUrlStartedAt = nowMs();
        trackEvent('viewer_load_stage', { stage: 'signed_url', status: 'started' });
        let signedUrl: string;
        let refreshedSession = false;
        let transientRetries = 0;
        while (true) {
          try {
            signedUrl = await createSignedNixUrl(path, signedUrlTtlSec);
            break;
          } catch (loadError) {
            const failureKind = classifyViewerFailure(loadError);
            if (failureKind === 'unauthorized' && !refreshedSession) {
              refreshedSession = true;
              const { error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) throw refreshError;
              continue;
            }
            if (failureKind === 'transient' && transientRetries < 1) {
              transientRetries += 1;
              continue;
            }
            throw loadError;
          }
        }
        trackEvent('viewer_load_stage', { stage: 'signed_url', status: 'success' });
        trackDuration('viewer_signed_url_ms', signedUrlStartedAt, {
          media_type: currentNix?.media_type ?? 'image',
          status: 'success',
        });
        if (cancelled) return;
        let generatedVideoThumbnailOverlay: VideoThumbnail | null = null;
        if (currentNix?.media_type === 'video' && !currentNix.thumbnail_b64) {
          try {
            generatedVideoThumbnailOverlay = await generateVideoThumbnailAtTime(signedUrl, 0, {
              maxWidth: 720,
            });
          } catch {
            // Miniatura opcjonalna — odtwarzanie i tak ruszy po readyToPlay.
          }
        }
        if (cancelled) return;
        if (!skipImagePrefetch) {
          const prefetchStartedAt = nowMs();
          await ExpoImage.prefetch(signedUrl, 'memory-disk');
          trackDuration('viewer_prefetch_ms', prefetchStartedAt, {
            media_type: 'image',
            status: 'success',
          });
          if (cancelled) return;
        }
        unstable_batchedUpdates(() => {
          setMediaState((current) => ({
            ...current,
            imageUrl: signedUrl,
            renderNix: currentNix ?? null,
            loading: false,
            ...(generatedVideoThumbnailOverlay !== null
              ? { videoThumbnailOverlay: generatedVideoThumbnailOverlay }
              : {}),
          }));
        });
      } catch (err) {
        console.error('Nie udało się załadować wiadomości', err);
        trackEvent('viewer_signed_url_ms', {
          media_type: currentNix?.media_type ?? 'image',
          status: 'failure',
          error_message: err instanceof Error ? err.message : 'Unknown viewer load error',
        });
        if (!cancelled) {
          const kind = classifyViewerFailure(err);
          trackEvent('viewer_load_stage', {
            stage: 'signed_url',
            status: 'failure',
            error_class: kind,
          });
          setMediaState((current) => ({ ...current, loading: false, imageReady: false }));
          setViewerError({
            kind: kind === 'permanentMissing' ? 'permanentMissing' : 'transient',
            message: kind === 'permanentMissing' ? 'Medium jest niedostępne.' : 'Nie udało się załadować medium.',
            reason: 'signed_url_failed',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentNix,
    currentNix?.media_path,
    currentNix?.media_type,
    queueLoading,
    closing,
    signedUrlTtlSec,
    mediaRetryKey,
  ]);

  const nextNix = queue[slideIndex + 1] ?? null;
  useEffect(() => {
    const path = nextNix?.media_path;
    if (!path || queueLoading || closing) return;

    let cancelled = false;
    void (async () => {
      try {
        const signedUrl = await createSignedNixUrl(path, signedUrlTtlSec);
        if (!cancelled && nextNix.media_type !== 'video') await ExpoImage.prefetch(signedUrl, 'memory-disk');
      } catch {
        // Prefetch opcjonalny — ignorujemy błędy sieci.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nextNix?.media_path, nextNix?.media_type, signedUrlTtlSec, queueLoading, closing]);

  useEffect(() => {
    if (queueLoading || closing || !queue.length || safetyPaused) return;
    const nix = displayedNix;
    if (!nix?.media_path) return;
    if (!loading && imageUrl && imageReady && !imageLoadError) {
      const isVideo = nix.media_type === 'video';
      const isUnlimited = nix.view_duration_sec === 0;

      cancelAnimation(segmentProgress);
      segmentProgress.set(1);

      if (isVideo || isUnlimited) {
        return () => {
          cancelAnimation(segmentProgress);
        };
      }

      const slideMs = Math.max(1000, (nix.view_duration_sec ?? 5) * 1000);

      // Smooth visual progress bar animation
      segmentProgress.set(
        withTiming(0, {
          duration: slideMs,
          easing: Easing.linear,
        })
      );

      // Dedicated JS timer to reliably advance slide, avoiding Reanimated callback races
      const timer = setTimeout(() => {
        finishCurrentSlideEvent();
      }, slideMs);

      return () => {
        clearTimeout(timer);
        cancelAnimation(segmentProgress);
      };
    }
    return () => {
      cancelAnimation(segmentProgress);
    };
  }, [
    queueLoading,
    closing,
    queue.length,
    displayedNix,
    loading,
    imageUrl,
    imageReady,
    imageLoadError,
    segmentProgress,
    safetyPaused,
  ]);

  const activeSegmentMaskStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ scaleX: Math.max(0, 1 - segmentProgress.get()) }],
  }));

  const onSegmentProgress = (nextProgress: number) => {
    segmentProgress.set(nextProgress);
  };

  const onVideoReady = () => {
    trackEvent('viewer_load_stage', { stage: 'decode', status: 'success', media_type: 'video' });
    trackEvent('viewer_media_ready_ms', {
      media_type: 'video',
      status: 'success',
    });
    dispatchViewer({ type: 'ready' });
    setMediaState((current) => ({ ...current, imageReady: true, imageLoadError: null }));
  };

  const onVideoError = () => {
    trackEvent('viewer_load_stage', { stage: 'decode', status: 'failure', media_type: 'video', error_class: 'transient' });
    setMediaState((current) => ({
      ...current,
      imageReady: false,
      imageLoadError: 'Nie udało się wczytać wideo.',
    }));
    setViewerError({ kind: 'transient', message: 'Nie udało się odtworzyć wideo.', reason: 'video_load_failed' });
  };

  const onPrimaryImageLoad = () => {
    trackEvent('viewer_load_stage', { stage: 'decode', status: 'success', media_type: 'image' });
    trackEvent('viewer_media_ready_ms', {
      media_type: 'image',
      status: 'success',
    });
    dispatchViewer({ type: 'ready' });
    setMediaState((current) => ({ ...current, imageReady: true, imageLoadError: null }));
  };

  const onPrimaryImageError = (event: unknown) => {
    console.warn('expo-image load error, fallback to native image', event);
    setMediaState((current) => ({ ...current, imageReady: false, useNativeFallback: true }));
  };

  const onFallbackImageLoad = () => {
    dispatchViewer({ type: 'ready' });
    setMediaState((current) => ({ ...current, imageReady: true, imageLoadError: null }));
  };

  const onFallbackImageError = () => {
    trackEvent('viewer_load_stage', { stage: 'decode', status: 'failure', media_type: 'image', error_class: 'transient' });
    setMediaState((current) => ({
      ...current,
      imageReady: false,
      imageLoadError: 'Nie udało się wczytać zdjęcia.',
    }));
    setViewerError({ kind: 'transient', message: 'Nie udało się wczytać zdjęcia.', reason: 'image_load_failed' });
  };

  const handleReport = async (reason: ReportReason) => {
    const item = queueRef.current[slideIndexRef.current];
    if (!item) {
      setSafetyPaused(false);
      return;
    }
    setSafetyBusy(true);
    await runWithFinally(
      async () => {
        await reportNix(item.id, reason);
        await queryClient.invalidateQueries({ queryKey: queryKeys.contentReports });
        notifySuccess(t('viewer.reportSuccess'));
        setSafetyPaused(false);
        finishCurrentSlide();
      },
      () => setSafetyBusy(false)
    ).catch((error: unknown) => {
      notifyDomainError(error, t('viewer.reportFailure'));
      setSafetyPaused(false);
    });
  };

  const showReportReasons = () => {
    const reasons: ReportReason[] = [
      'harassment', 'hate', 'sexual_content', 'violence', 'self_harm',
      'impersonation', 'spam', 'privacy', 'illegal_content', 'other',
    ];
    const options = reasons.map((reason) => t(`profile.reportReason.${reason}`));
    options.push(t('common.cancel'));
    ActionSheetIOS.showActionSheetWithOptions(
      { title: t('viewer.reportReasonTitle'), options, cancelButtonIndex: reasons.length },
      (index) => {
        const reason = reasons[index];
        if (!reason) {
          setSafetyPaused(false);
          return;
        }
        void handleReport(reason);
      }
    );
  };

  const confirmBlock = () => {
    if (!paramSenderId) {
      setSafetyPaused(false);
      return;
    }
    Alert.alert(t('viewer.blockConfirmTitle'), t('viewer.blockConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => setSafetyPaused(false) },
      {
        text: t('viewer.blockAction'),
        style: 'destructive',
        onPress: () => {
          setSafetyBusy(true);
          void blockUser(paramSenderId)
            .then(async () => {
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers }),
                queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
                queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
              ]);
              notifySuccess(t('viewer.blockSuccess'));
              trackEvent('viewer_close_reason', { reason: 'explicit_block_sender' });
              dispatchViewer({ type: 'close' });
              router.back();
            })
            .catch((error: unknown) => {
              notifyDomainError(error, t('viewer.blockFailure'));
              setSafetyPaused(false);
            })
            .finally(() => setSafetyBusy(false));
        },
      },
    ]);
  };

  const openSafetyMenu = () => {
    if (!paramSenderId || safetyBusy) return;
    setSafetyPaused(true);
    cancelAnimation(segmentProgress);
    Alert.alert(t('viewer.safetyTitle'), undefined, [
      { text: t('viewer.reportAction'), onPress: showReportReasons },
      { text: t('viewer.blockAction'), style: 'destructive', onPress: confirmBlock },
      { text: t('common.cancel'), style: 'cancel', onPress: () => setSafetyPaused(false) },
    ]);
  };

  const saveToGallery = () => {
    if (!canSaveToGallery || isSavingToGallery || !imageUrl || closing) return;
    const mediaType = displayedNix?.media_type === 'video' ? 'video' : 'image';
    const extHint = mediaType === 'video' ? 'mp4' : 'jpg';
    setIsSavingToGallery(true);
    void runWithFinally(
      () =>
        saveRemoteMediaToGallery({
          source: 'viewer',
          remoteUri: imageUrl,
          mediaType,
          extHint,
        }),
      () => setIsSavingToGallery(false)
    );
  };

  const retryViewer = () => {
    setViewerError(null);
    setMediaState((current) => ({ ...current, imageLoadError: null, loading: true, useNativeFallback: false }));
    if (queue.length === 0) setQueueRetryKey((value) => value + 1);
    else setMediaRetryKey((value) => value + 1);
  };

  const leaveViewer = () => {
    trackEvent('viewer_close_reason', { reason: 'explicit_back' });
    dispatchViewer({ type: 'close' });
    router.back();
  };

  const skipUnavailable = () => {
    if (viewerError?.kind !== 'permanentMissing' || !currentNix) return;
    trackEvent('viewer_close_reason', { reason: 'explicit_skip_missing' });
    skipUnplayableSlide(viewerError.reason);
  };

  const isBootLoading = capturePolicyPending
    || viewerMachine.status === 'booting'
    || (queueLoading && !viewerError)
    || (!queue.length && !closing && !viewerError);

  return {
    viewerPhase: viewerMachine.status,
    isBootLoading,
    styles,
    colors,
    statusBarStyle,
    isDark,
    insets,
    queue,
    slideIndex,
    closing,
    currentNix,
    displayedNix,
    imageUrl,
    loading,
    imageReady,
    imageLoadError,
    viewerError,
    useNativeFallback,
    videoPosterUri,
    videoThumbnailOverlay,
    canDismissByTap,
    finishCurrentSlide,
    segmentProgress,
    onSegmentProgress,
    activeSegmentMaskStyle,
    shouldBlurOverlay,
    onVideoReady,
    onVideoError,
    onPrimaryImageLoad,
    onPrimaryImageError,
    onFallbackImageLoad,
    onFallbackImageError,
    safetyAvailable: Boolean(paramSenderId),
    safetyBusy,
    safetyPaused,
    openSafetyMenu,
    canSaveToGallery,
    isSavingToGallery,
    saveToGalleryA11y: t('media.saveToGalleryA11y'),
    saveToGallery,
    retryViewer,
    leaveViewer,
    skipUnavailable,
  };
}
