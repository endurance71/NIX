import { useState, useEffect, useRef, useEffectEvent } from 'react';
import type { ViewStyle } from 'react-native';
import { unstable_batchedUpdates } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
import type { AnimatedStyle } from 'react-native-reanimated';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSignedNixUrl,
  flushCleanupQueue,
  fetchUnreadInboxQueueFromSender,
} from '../services/nixService';
import { markViewerSlideViewed } from '../lib/viewerSlideActions';
import { normalizeNixViewDurationSec } from '../lib/nixViewDuration';
import { useAppTheme } from './useAppTheme';
import { refreshInboxBadgeCount } from '../lib/inboxBadgeStore';
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

type NixQueueItem = {
  id: string;
  media_path: string;
  view_duration_sec: number;
  media_type: string;
  playback_duration_ms: number | null;
  thumbnail_b64: string | null;
};

function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export type ViewerScreenViewModel = {
  isBootLoading: boolean;
  styles: ReturnType<typeof createViewerStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  statusBarStyle: ReturnType<typeof useAppTheme>['statusBarStyle'];
  isDark: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
  queue: NixQueueItem[];
  slideIndex: number;
  closing: boolean;
  currentNix: NixQueueItem | null;
  displayedNix: NixQueueItem | null;
  imageUrl: string | null;
  loading: boolean;
  imageReady: boolean;
  imageLoadError: string | null;
  useNativeFallback: boolean;
  videoPosterUri: string | null;
  videoThumbnailOverlay: VideoThumbnail | null;
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
};

export function useViewerScreen(): ViewerScreenViewModel {
  const queryClient = useQueryClient();
  const { colors, statusBarStyle, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = createViewerStyles(colors);
  const raw = useLocalSearchParams<{
    id?: string;
    path?: string;
    senderId?: string;
    viewDurationSec?: string;
  }>();
  const paramId = paramFirst(raw.id);
  const paramPath = paramFirst(raw.path);
  const paramSenderId = paramFirst(raw.senderId);
  const paramViewDurationSec = normalizeNixViewDurationSec(paramFirst(raw.viewDurationSec));

  const [queueState, setQueueState] = useState<{
    queueLoading: boolean;
    queue: NixQueueItem[];
    slideIndex: number;
    closing: boolean;
  }>({
    queueLoading: true,
    queue: [],
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
  const segmentProgress = useSharedValue(1);
  const lastFinishedSlideIdRef = useRef<string | null>(null);
  const viewedCountRef = useRef(0);

  const queueRef = useRef<NixQueueItem[]>(queue);
  const slideIndexRef = useRef(slideIndex);
  const closingRef = useRef(closing);

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

  const { data: capturePolicy = 'deny' } = useQuery({
    queryKey: queryKeys.capturePolicyForSender(paramSenderId ?? null),
    queryFn: async () => {
      if (!paramSenderId) return 'deny';
      return getCapturePolicyForSender(paramSenderId);
    },
    staleTime: 60_000,
  });

  const captureDenied = shouldBlockCapture(capturePolicy);
  const shouldBlurOverlay = captureDenied && appState !== 'active';

  useViewerCaptureGuard(captureDenied, paramSenderId);

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
      if (paramSenderId) {
        try {
          const nixes = await fetchUnreadInboxQueueFromSender(paramSenderId);
          if (cancelled) return;
          if (nixes.length === 0) {
            router.back();
            return;
          }
          const mappedQueue = nixes.map(toViewerQueueItem);

          unstable_batchedUpdates(() => {
            setQueueState((current) => ({ ...current, queue: mappedQueue, queueLoading: false }));
          });
        } catch (err) {
          console.error('Nie udało się pobrać kolejki nixów', err);
          if (!cancelled) router.back();
        }
        return;
      }

      if (paramId && paramPath) {
        unstable_batchedUpdates(() => {
          setQueueState((current) => ({
            ...current,
            queue: [
              {
                id: paramId,
                media_path: paramPath,
                view_duration_sec: paramViewDurationSec,
                media_type: 'image',
                playback_duration_ms: null,
                thumbnail_b64: null,
              },
            ],
            queueLoading: false,
          }));
        });
        return;
      }

      router.back();
    }

    void initQueue();
    return () => {
      cancelled = true;
    };
  }, [paramSenderId, paramId, paramPath, paramViewDurationSec]);

  useEffect(() => {
    flushCleanupQueue().catch((err) => {
      console.warn('Nie udało się zsynchronizować kolejki cleanup', err);
    });

    const viewedCount = viewedCountRef;
    return () => {
      if (viewedCount.current > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
        void refreshInboxBadgeCount(queryClient);
      }
      void clearMediaMemoryCache();
    };
  }, [queryClient]);

  const currentNix = queue[slideIndex] ?? null;
  const displayedNix = renderNix ?? currentNix;

  const finishCurrentSlide = () => {
    if (closingRef.current) return;
    const item = queueRef.current[slideIndexRef.current];
    if (!item) return;
    if (lastFinishedSlideIdRef.current === item.id) return;
    lastFinishedSlideIdRef.current = item.id;

    cancelAnimation(segmentProgress);
    segmentProgress.set(1);

    void markViewerSlideViewed(item, () => {
      viewedCountRef.current += 1;
    });

    if (slideIndexRef.current < queueRef.current.length - 1) {
      if (queueRef.current.length > 1) {
        selection();
      }
      setQueueState((current) => ({ ...current, slideIndex: current.slideIndex + 1 }));
      setMediaState((current) => ({ ...current, imageReady: false, imageLoadError: null }));
    } else {
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
        const signedUrl = await createSignedNixUrl(path, signedUrlTtlSec);
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
          finishCurrentSlideEvent();
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
    if (queueLoading || closing || !queue.length) return;
    const nix = displayedNix;
    if (!nix?.media_path) return;
    if (!loading && imageUrl && imageReady && !imageLoadError) {
      const isVideo = nix.media_type === 'video';
      segmentProgress.set(1);
      if (isVideo) {
        return () => {
          cancelAnimation(segmentProgress);
        };
      }
      const slideMs = Math.max(1000, (nix.view_duration_sec ?? 5) * 1000);
      segmentProgress.set(
        withTiming(
          0,
          {
            duration: slideMs,
            easing: Easing.linear,
          },
          (finished) => {
            if (finished && !isVideo) {
              runOnJS(finishCurrentSlideEvent)();
            }
          }
        )
      );
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
  ]);

  const activeSegmentMaskStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ scaleX: Math.max(0, 1 - segmentProgress.get()) }],
  }));

  const onSegmentProgress = (nextProgress: number) => {
    segmentProgress.set(nextProgress);
  };

  const onVideoReady = () => {
    trackEvent('viewer_media_ready_ms', {
      media_type: 'video',
      status: 'success',
    });
    setMediaState((current) => ({ ...current, imageReady: true, imageLoadError: null }));
  };

  const onVideoError = () => {
    setMediaState((current) => ({
      ...current,
      imageReady: false,
      imageLoadError: 'Nie udało się wczytać wideo.',
    }));
    finishCurrentSlide();
  };

  const onPrimaryImageLoad = () => {
    trackEvent('viewer_media_ready_ms', {
      media_type: 'image',
      status: 'success',
    });
    setMediaState((current) => ({ ...current, imageReady: true, imageLoadError: null }));
  };

  const onPrimaryImageError = (event: unknown) => {
    console.warn('expo-image load error, fallback to native image', event);
    setMediaState((current) => ({ ...current, imageReady: false, useNativeFallback: true }));
  };

  const onFallbackImageLoad = () => {
    setMediaState((current) => ({ ...current, imageReady: true, imageLoadError: null }));
  };

  const onFallbackImageError = () => {
    setMediaState((current) => ({
      ...current,
      imageReady: false,
      imageLoadError: 'Nie udało się wczytać zdjęcia.',
    }));
    finishCurrentSlide();
  };

  const isBootLoading = queueLoading || (!queue.length && !closing);

  return {
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
    useNativeFallback,
    videoPosterUri,
    videoThumbnailOverlay,
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
  };
}
