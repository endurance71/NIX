import { selectOwnedViewerMedia } from '../lib/viewerOwnedMedia';
import { useState, useEffect, useRef, useEffectEvent, useMemo, useReducer } from 'react';
import type { ViewStyle } from 'react-native';
import { AccessibilityInfo, ActionSheetIOS, Alert, unstable_batchedUpdates } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import type { VideoPlayer, VideoThumbnail } from 'expo-video';
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
  fetchNixPublicProfiles,
} from '../services/nixService';
import { markViewerSlideViewed, markViewerSlideUnplayable } from '../lib/viewerSlideActions';
import { normalizeViewerScreenParams } from '../lib/viewerScreenParams';
import { useAppTheme } from './useAppTheme';
import { clearMediaMemoryCache } from '../lib/mediaCache';
import { nowMs, trackDuration, trackEvent } from '../lib/telemetry';
import { queryKeys } from '../lib/queryKeys';
import { generateVideoThumbnailAtTime } from '../lib/videoThumbnails';
import { selection } from '../lib/haptics';
import { configureForViewerVideo } from '../lib/audioSession';
import { getCapturePolicyForSender } from '../services/capturePolicyService';
import { shouldBlockCapture } from '../lib/capturePolicy';
import { useAppStateSnapshot } from './useAppStateSnapshot';
import { useViewerCaptureGuard } from './useViewerCaptureGuard';
import {
  isSameViewerMedia,
  orderViewerQueueFromSeed,
  selectViewerVideoPoster,
  toViewerQueueItem,
} from '../lib/viewerQueue';
import {
  consumeViewerPhotoTimer,
  createViewerPhotoTimer,
  isViewerPlaybackPaused,
  shouldViewerAutoAdvance,
  viewerPhotoSlideMs,
  viewerPhotoTimerProgress,
  type ViewerPhotoTimer,
} from '../lib/viewerGestures';
import {
  formatViewerRelativeTime,
  viewerMediaAccessibilityLabel,
  viewerSenderName,
  viewerSlidePositionLabel,
} from '../lib/viewerPresentation';
import { getViewerSoundOn, setViewerSoundOn } from '../lib/viewerSound';
import { sendQuickTextReply } from '../lib/viewerQuickReply';
import { replyWithNixHref, viewerEmojiMode, type ViewerEmojiMode } from '../lib/viewerReactions';
import { useNixReactions, useToggleNixReaction, type NixReactionToggleResult } from './useNixReactions';
import { MESSAGE_REACTION_GLYPHS } from '../services/messageReactionService';
import type { MessageReactionEmoji } from '../types/database.types';
import { useSignedAvatarUrls } from './useSignedAvatarUrls';
import { chatPeerProfileFromInboxBundle } from '../lib/chatTimeline';
import type { InboxBundle } from '../lib/inboxQuery';
import { createViewerStyles } from '../components/viewer/viewerScreen.styles';
import { createViewerVideoPlayer } from '../lib/viewerVideoPlayer';
import { markInboxNixUnplayableInCache, markInboxNixViewedInCache } from '../lib/inboxQuery';
import { useTranslation } from 'react-i18next';
import { blockUser, reportNix, type ReportReason } from '../services/safetyService';
import { notifyDomainError, notifySuccess } from '../lib/appNotify';
import { runWithFinally } from '../lib/runWithFinally';
import { saveRemoteMediaToGallery } from '../lib/saveMediaToGalleryAction';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { loadPrivatePhoto, type PrivatePhotoLoad } from '../services/photoCacheService';
import { encryptedPhotoCache } from '../lib/encryptedPhotoCache';
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
  created_at?: string | null;
};

type VideoPreload = {
  nixId: string;
  mediaPath: string;
  uri: string;
  player: VideoPlayer;
  /** When the signed URL stops working; an older preload would fail on later byte ranges. */
  expiresAt: number;
};

/** Margin before the signed URL expiry within which a preload is no longer adopted. */
const VIDEO_PRELOAD_EXPIRY_MARGIN_MS = 30_000;

/** Guards a stray tap right after the slide appears without making advancing feel sluggish. */
const VIEWER_TAP_GUARD_MS = 150;

type ViewerError = ViewerMachineError & {
  kind: Exclude<ViewerFailureKind, 'unauthorized'>;
};

export type ViewerScreenViewModel = {
  viewerPhase: ViewerMachineState['status'];
  isBootLoading: boolean;
  styles: ReturnType<typeof createViewerStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
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
  /** Preloaded player for the displayed video slide (PERF-21); null → the slide creates its own. */
  videoPlayer: VideoPlayer | null;
  canDismissByTap: boolean;
  finishCurrentSlide: () => void;
  handleNextTap: () => void;
  segmentProgress: ReturnType<typeof useSharedValue<number>>;
  activeSegmentFillStyle: AnimatedStyle<ViewStyle>;
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
  leaveViewer: (reason?: ViewerLeaveReason) => void;
  skipUnavailable: () => void;
  /** False while VoiceOver runs: slides advance only manually (WCAG 2.2.1). */
  autoAdvance: boolean;
  screenReaderEnabled: boolean;
  /** Any pause reason: hold, safety menu, reply field, app not active. */
  playbackPaused: boolean;
  /** Hold-to-pause or the VoiceOver pause action. */
  userPaused: boolean;
  setUserPaused: (paused: boolean) => void;
  /** Bumped when the current slide restarts (left tap zone). */
  restartKey: number;
  restartCurrentSlide: () => void;
  /** Video slides loop when unlimited or while advancing is manual. */
  videoLoop: boolean;
  isVideoSlide: boolean;
  soundOn: boolean;
  toggleSound: () => void;
  sender: ViewerSender | null;
  isReplay: boolean;
  slidePositionLabel: string;
  mediaAccessibilityLabel: string;
  canReply: boolean;
  replyFocused: boolean;
  setReplyFocused: (focused: boolean) => void;
  sendReply: (body: string) => Promise<boolean>;
  /** What an emoji in the quick-reply row does: NiX reaction, text reply fallback, or nothing. */
  emojiMode: ViewerEmojiMode;
  /** The viewer's own reaction on the NiX on screen. */
  nixReaction: MessageReactionEmoji | null;
  /** Tapback toggle on the NiX on screen (same emoji again removes it). */
  reactToNix: (emoji: MessageReactionEmoji) => Promise<ViewerReactionOutcome>;
  /** Closes the viewer and opens the camera with the sender preselected. */
  replyWithNix: () => void;
};

export type ViewerReactionOutcome =
  | Exclude<NixReactionToggleResult, { status: 'unavailable' }>
  | { status: 'sentAsText' };

type ViewerLeaveReason =
  | 'explicit_back'
  | 'close_button'
  | 'swipe_down'
  | 'accessibility_escape'
  | 'reply_with_nix';

type ViewerSender = {
  name: string | null;
  avatarUrl: string | null;
  avatarPath: string | null;
  avatarEmoji: string | null;
  fallbackInitial: string | null;
  timeLabel: string | null;
};

function useViewerSeed({
  paramId,
  paramPath,
  paramViewDurationSec,
  paramMediaType,
  paramPlaybackDurationMs,
  paramThumbnailB64,
}: ReturnType<typeof normalizeViewerScreenParams>) {
  return useMemo<NixQueueItem | null>(
    () =>
      paramId && paramPath
        ? {
            id: paramId,
            media_path: paramPath,
            view_duration_sec: paramViewDurationSec,
            media_type: paramMediaType,
            playback_duration_ms: paramPlaybackDurationMs,
            thumbnail_b64: paramThumbnailB64,
          }
        : null,
    [
      paramId,
      paramPath,
      paramViewDurationSec,
      paramMediaType,
      paramPlaybackDurationMs,
      paramThumbnailB64,
    ],
  );
}

export function useViewerScreen(): ViewerScreenViewModel {
  // Retry loops with throw inside try/catch that the React Compiler cannot lower yet.
  'use no memo';
  const { t } = useTranslation();
  const { user, canUseNetworkSession } = useAuth();
  const ownerId = user?.id;
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
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
  const {
    paramId,
    paramPath,
    paramSenderId,
    paramViewDurationSec,
    paramMediaType,
    paramPlaybackDurationMs,
    paramThumbnailB64,
    paramIsReplay,
  } = normalizeViewerScreenParams(raw);
  const seedItem = useViewerSeed({
    paramId,
    paramPath,
    paramSenderId,
    paramViewDurationSec,
    paramMediaType,
    paramPlaybackDurationMs,
    paramThumbnailB64,
    paramIsReplay,
  });

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
    videoThumbnailOverlay: VideoThumbnail | null;
    videoPlayer: VideoPlayer | null;
    photoExpiresAt: number | null;
    renderOwnerId: string | null;
  }>({
    renderNix: null,
    imageUrl: null,
    loading: true,
    imageReady: false,
    imageLoadError: null,
    useNativeFallback: false,
    videoThumbnailOverlay: null,
    videoPlayer: null,
    photoExpiresAt: null,
    renderOwnerId: null,
  });
  const {
    loading,
    imageLoadError,
    useNativeFallback,
    videoThumbnailOverlay,
    videoPlayer,
    photoExpiresAt,
  } = mediaState;
  const { renderNix, imageUrl, imageReady } = selectOwnedViewerMedia(mediaState, ownerId);
  const appState = useAppStateSnapshot();
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [safetyPaused, setSafetyPaused] = useState(false);
  const [canDismissByTap, setCanDismissByTap] = useState(false);
  const [viewerMachine, dispatchViewer] = useReducer(
    viewerMachineReducer,
    initialViewerMachineState,
  );
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
    }, VIEWER_TAP_GUARD_MS);
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

  const [userPaused, setUserPaused] = useState(false);
  const [replyFocused, setReplyFocused] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const [soundOn, setSoundOn] = useState(getViewerSoundOn);
  // Unknown until the first query resolves: no auto-advance can consume a slide in the meantime.
  const [screenReaderEnabled, setScreenReaderEnabled] = useState<boolean | null>(null);
  const [openedAtMs] = useState(() => Date.now());
  const photoTimerRef = useRef<ViewerPhotoTimer | null>(null);

  useEffect(() => {
    let mounted = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      changed = true;
      setScreenReaderEnabled(enabled);
    });
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (mounted && !changed) setScreenReaderEnabled(enabled);
      })
      .catch(() => {
        if (mounted && !changed) setScreenReaderEnabled(false);
      });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  // Switch Control has no React Native API; its users get the same custom actions as VoiceOver.
  const autoAdvance = screenReaderEnabled !== null && shouldViewerAutoAdvance(screenReaderEnabled);

  const { data: capturePolicy = 'deny', isPending: capturePolicyPending } = useQuery({
    queryKey: queryKeys.capturePolicyForSender(paramSenderId ?? null),
    queryFn: async () => {
      if (!paramSenderId) return 'deny';
      return getCapturePolicyForSender(paramSenderId);
    },
    staleTime: 60_000,
  });

  // Same cache entry as the chat header (DB-7): from the inbox bundle at once, then refreshed.
  const senderProfileQuery = useQuery({
    queryKey: ['peerProfile', paramSenderId ?? ''],
    queryFn: async () => {
      if (!paramSenderId) return null;
      const map = await fetchNixPublicProfiles([paramSenderId]);
      return map.get(paramSenderId) ?? null;
    },
    staleTime: 60_000,
    enabled: canUseNetworkSession && Boolean(paramSenderId),
    initialData: () =>
      paramSenderId
        ? chatPeerProfileFromInboxBundle(
            queryClient.getQueryData<InboxBundle>(queryKeys.inboxNixesBundle),
            paramSenderId,
          )
        : undefined,
    initialDataUpdatedAt: () => queryClient.getQueryState(queryKeys.inboxNixesBundle)?.dataUpdatedAt,
  });
  const senderProfile = senderProfileQuery.data ?? null;
  const senderAvatarPath = senderProfile?.avatar_storage_path ?? null;
  const senderAvatarUrls = useSignedAvatarUrls([senderAvatarPath], { enabled: canUseNetworkSession });
  const senderName = viewerSenderName(senderProfile);

  const currentNix = queue[slideIndex] ?? null;
  const displayedNix = renderNix ?? currentNix;
  const videoPosterUri = selectViewerVideoPoster(displayedNix, currentNix);

  const captureDenied = shouldBlockCapture(capturePolicy);
  const canSaveToGallery = !captureDenied;
  const shouldBlurOverlay = captureDenied && appState !== 'active';

  useViewerCaptureGuard(
    capturePolicyPending ? null : captureDenied,
    paramSenderId,
    displayedNix?.id,
  );
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
            if (!seedItem)
              setViewerError({
                kind: 'transient',
                message: t('viewer.fetchMediaFailed'),
                reason: 'queue_replay_failed',
              });
          }
          trackEvent('viewer_load_stage', {
            stage: 'queue',
            status: 'failure',
            error_class: 'transient',
          });
        }
        return;
      }

      if (paramSenderId) {
        try {
          const nixes = await fetchUnreadInboxQueueFromSender(paramSenderId);
          if (cancelled) return;
          if (nixes.length === 0) {
            setQueueState((current) => ({ ...current, queueLoading: false }));
            if (!seedItem)
              setViewerError({
                kind: 'permanentMissing',
                message: t('viewer.mediaUnavailable'),
                reason: 'empty_queue',
              });
            return;
          }
          // Opened from a chat on a later unread NiX: that one plays first (seed), then the rest.
          const mappedQueue = orderViewerQueueFromSeed(nixes.map(toViewerQueueItem), paramId);

          unstable_batchedUpdates(() => {
            setQueueState((current) => ({ ...current, queue: mappedQueue, queueLoading: false }));
          });
          trackEvent('viewer_load_stage', { stage: 'queue', status: 'success', mode: 'inbox' });
        } catch (err) {
          console.error('Nie udało się pobrać kolejki nixów', err);
          if (!cancelled) {
            setQueueState((current) => ({ ...current, queueLoading: false }));
            if (!seedItem)
              setViewerError({
                kind: 'transient',
                message: t('viewer.fetchMessageFailed'),
                reason: 'queue_fetch_failed',
              });
          }
          trackEvent('viewer_load_stage', {
            stage: 'queue',
            status: 'failure',
            error_class: 'transient',
          });
        }
        return;
      }

      if (seedItem) {
        unstable_batchedUpdates(() => {
          setQueueState((current) => ({
            ...current,
            queue: [seedItem],
            queueLoading: false,
          }));
        });
        trackEvent('viewer_load_stage', { stage: 'queue', status: 'success', mode: 'seed' });
        return;
      }

      setQueueState((current) => ({ ...current, queueLoading: false }));
      setViewerError({
        kind: 'permanentMissing',
        message: t('viewer.invalidMediaLink'),
        reason: 'missing_params',
      });
      trackEvent('viewer_load_stage', {
        stage: 'queue',
        status: 'failure',
        error_class: 'permanentMissing',
      });
    }

    void initQueue();
    return () => {
      cancelled = true;
    };
  }, [paramSenderId, paramId, paramIsReplay, queueRetryKey, seedItem, t]);

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
    if (paramIsReplay && ownerId) void encryptedPhotoCache.remove(ownerId, item.id).catch(() => {});
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
    if (ownerId) void encryptedPhotoCache.remove(ownerId, item.id).catch(() => {});
    void markViewerSlideUnplayable(item, reason, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
    });

    advanceAfterCurrentSlide();
  };

  const advanceAfterCurrentSlide = () => {
    if (slideIndexRef.current < queueRef.current.length - 1) {
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
          videoThumbnailOverlay: null,
          videoPlayer: null,
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

  // Haptics only for the user's own tap; auto-advance and video end stay silent.
  const handleNextTap = () => {
    if (slideIndexRef.current < queueRef.current.length - 1) selection();
    finishCurrentSlide();
  };

  const finishCurrentSlideEvent = useEffectEvent(() => {
    finishCurrentSlide();
  });

  // PERF-21: at most one detached player, for the next slide; adopted players live in mediaState.
  const videoPreloadRef = useRef<VideoPreload | null>(null);

  const takeVideoPreload = (item: NixQueueItem): VideoPreload | null => {
    const preload = videoPreloadRef.current;
    if (!preload || !isSameViewerMedia({ id: preload.nixId, media_path: preload.mediaPath }, item)) {
      return null;
    }
    videoPreloadRef.current = null;
    // The user may have lingered (paused, long slide) past the URL's TTL: load the slide fresh.
    if (Date.now() >= preload.expiresAt - VIDEO_PRELOAD_EXPIRY_MARGIN_MS) {
      preload.player.release();
      return null;
    }
    return preload;
  };

  const showLoadFailure = (err: unknown) => {
    const kind = classifyViewerFailure(err);
    trackEvent('viewer_load_stage', {
      stage: 'signed_url',
      status: 'failure',
      error_class: kind,
    });
    setMediaState((current) => ({ ...current, loading: false, imageReady: false }));
    setViewerError({
      kind: kind === 'permanentMissing' ? 'permanentMissing' : 'transient',
      message:
        kind === 'permanentMissing' ? t('viewer.mediaUnavailable') : t('viewer.loadMediaFailed'),
      reason: 'signed_url_failed',
    });
  };

  /**
   * PERF-19: runs for the route seed while the queue is still loading. Keyed by media identity, so
   * the fetched copy of the same nix does not restart the load; a different first item does.
   */
  const loadCurrentMedia = useEffectEvent(() => {
    const item = currentNix;
    const path = item?.media_path;
    if (!item || !path || !ownerId || closing) return;
    const owner = ownerId;
    const isVideo = item.media_type === 'video';

    let cancelled = false;
    unstable_batchedUpdates(() => {
      setViewerError(null);
      setMediaState((current) => ({
        ...current,
        // Never keep showing another nix (e.g. the seed when the queue starts elsewhere).
        ...(current.renderNix?.id !== item.id
          ? { renderNix: null, imageUrl: null, videoPlayer: null }
          : {}),
        loading: true,
        imageReady: false,
        imageLoadError: null,
        useNativeFallback: false,
        videoThumbnailOverlay: null,
        photoExpiresAt: null,
      }));
    });
    if (isVideo && item.thumbnail_b64) {
      trackEvent('viewer_thumbnail_source', { source: 'embedded' });
    } else if (isVideo) {
      trackEvent('viewer_thumbnail_source', { source: 'missing' });
    }

    const commit = (
      signedUrl: string,
      extra: { photoExpiresAt: number | null; videoPlayer: VideoPlayer | null },
    ) => {
      unstable_batchedUpdates(() => {
        setMediaState((current) => ({
          ...current,
          imageUrl: signedUrl,
          renderNix: item,
          renderOwnerId: owner,
          loading: false,
          ...extra,
        }));
      });
      // PERF-24: an old nix without an embedded thumbnail never waits for one before playback.
      if (isVideo && !item.thumbnail_b64 && !extra.videoPlayer) {
        void generateVideoThumbnailAtTime(signedUrl, 0, { maxWidth: 720 })
          .then((thumbnail) => {
            if (cancelled || !thumbnail) return;
            setMediaState((current) =>
              current.imageReady || current.renderNix?.id !== item.id
                ? current
                : { ...current, videoThumbnailOverlay: thumbnail },
            );
          })
          .catch(() => {
            // Miniatura opcjonalna — odtwarzanie i tak ruszy po readyToPlay.
          });
      }
    };

    const preload = isVideo ? takeVideoPreload(item) : null;
    if (preload) {
      trackEvent('viewer_load_stage', { stage: 'signed_url', status: 'success', preloaded: true });
      commit(preload.uri, { photoExpiresAt: null, videoPlayer: preload.player });
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const signedUrlStartedAt = nowMs();
        trackEvent('viewer_load_stage', { stage: 'signed_url', status: 'started' });
        let signedUrl: string;
        let photo: PrivatePhotoLoad | null = null;
        let refreshedSession = false;
        let transientRetries = 0;
        while (true) {
          try {
            if (isVideo) signedUrl = await createSignedNixUrl(path, signedUrlTtlSec);
            else {
              photo = await loadPrivatePhoto(item.id, path, owner);
              signedUrl = photo.uri;
            }
            break;
          } catch (loadError) {
            const failureKind = classifyViewerFailure(loadError);
            if (failureKind === 'unauthorized' && !refreshedSession) {
              refreshedSession = true;
              const { error: refreshError } = await supabase.auth.refreshSession();
              // oxlint-disable-next-line react-hooks-js/todo -- opted out of compilation ('use no memo') above
              if (refreshError) throw refreshError;
              continue;
            }
            if (failureKind === 'transient' && transientRetries < 1) {
              transientRetries += 1;
              continue;
            }
            // oxlint-disable-next-line react-hooks-js/todo -- opted out of compilation ('use no memo') above
            throw loadError;
          }
        }
        trackEvent('viewer_load_stage', { stage: 'signed_url', status: 'success' });
        trackDuration('viewer_signed_url_ms', signedUrlStartedAt, {
          media_type: item.media_type ?? 'image',
          status: 'success',
        });
        if (cancelled) return;
        commit(signedUrl, { photoExpiresAt: photo?.expiresAt ?? null, videoPlayer: null });
        // The encrypted copy is stored in the background and authorized online once more;
        // a revoked/expired outcome hides the photo again, like the retention timer.
        photo?.persisted.then(
          (expiresAt) => {
            if (cancelled) return;
            setMediaState((current) =>
              current.renderNix?.id === item.id ? { ...current, photoExpiresAt: expiresAt } : current,
            );
          },
          (persistError: unknown) => {
            if (cancelled) return;
            console.error('Zdjęcie przestało być dostępne po zapisie w cache', persistError);
            showLoadFailure(persistError);
            setMediaState((current) => ({ ...current, imageUrl: null, photoExpiresAt: null }));
          },
        );
      } catch (err) {
        console.error('Nie udało się załadować wiadomości', err);
        trackEvent('viewer_signed_url_ms', {
          media_type: item.media_type ?? 'image',
          status: 'failure',
          error_message: err instanceof Error ? err.message : 'Unknown viewer load error',
        });
        if (!cancelled) showLoadFailure(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  const currentMediaId = currentNix?.id;
  const currentMediaPath = currentNix?.media_path;
  const currentMediaType = currentNix?.media_type;
  useEffect(
    () => loadCurrentMedia(),
    [currentMediaId, currentMediaPath, currentMediaType, closing, mediaRetryKey, ownerId],
  );

  // Adopted (preloaded) players are released once nothing renders them anymore.
  useEffect(() => {
    if (!videoPlayer) return;
    return () => videoPlayer.release();
  }, [videoPlayer]);

  useEffect(
    () => () => {
      videoPreloadRef.current?.player.release();
      videoPreloadRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!photoExpiresAt || !currentMediaId || !ownerId) return;
    const nixId = currentMediaId;
    const expire = () => {
      void encryptedPhotoCache.remove(ownerId, nixId).catch(() => {});
      setMediaState((current) => ({ ...current, imageUrl: null, imageReady: false }));
      setViewerError({
        kind: 'permanentMissing',
        message: t('viewer.mediaExpired'),
        reason: 'photo_retention_expired',
      });
    };
    const timer = setTimeout(expire, Math.max(0, photoExpiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [photoExpiresAt, currentMediaId, ownerId, appState, t]);

  const nextNix = queue[slideIndex + 1] ?? null;
  useEffect(() => {
    const path = nextNix?.media_path;
    if (!path || !ownerId || nextNix.media_type === 'video' || queueLoading || closing) return;
    void (async () => {
      try {
        const photo = await loadPrivatePhoto(nextNix.id, path, ownerId);
        // Warm the encrypted cache fully so the slide opens as a cache hit.
        await photo.persisted;
      } catch {
        // Prefetch opcjonalny — ignorujemy błędy sieci.
      }
    })();
  }, [nextNix?.id, nextNix?.media_path, nextNix?.media_type, ownerId, queueLoading, closing]);

  /** PERF-21: signed URL + buffering player for the next video, handed over when it becomes current. */
  const preloadNextVideo = useEffectEvent(() => {
    const item = nextNix;
    // Starts once the current slide shows, so it never competes with its first frame.
    if (!imageReady || closing || !ownerId) return;
    if (!item || item.media_type !== 'video' || !item.media_path) return;
    const current = videoPreloadRef.current;
    if (current && isSameViewerMedia({ id: current.nixId, media_path: current.mediaPath }, item)) {
      return;
    }
    // Bounded memory: a stale preload (queue changed under it) is released, never stacked.
    current?.player.release();
    videoPreloadRef.current = null;
    const mediaPath = item.media_path;
    const loop = item.view_duration_sec === 0;
    let cancelled = false;
    const ttlSec = signedUrlTtlSec;
    const requestedAt = Date.now();
    createSignedNixUrl(mediaPath, ttlSec)
      .then((uri) => {
        if (cancelled) return;
        videoPreloadRef.current = {
          nixId: item.id,
          mediaPath,
          uri,
          player: createViewerVideoPlayer(uri, loop),
          expiresAt: requestedAt + ttlSec * 1000,
        };
      })
      .catch(() => {
        // Preload opcjonalny — slajd pobierze własny podpisany URL.
      });
    return () => {
      cancelled = true;
    };
  });

  const nextMediaId = nextNix?.id;
  const nextMediaPath = nextNix?.media_path;
  const nextMediaType = nextNix?.media_type;
  // Declared after the current-media effect: on advance, the current slide adopts first.
  useEffect(
    () => preloadNextVideo(),
    [nextMediaId, nextMediaPath, nextMediaType, ownerId, closing, imageReady],
  );

  const playbackPaused = isViewerPlaybackPaused({
    hold: userPaused,
    safetyMenu: safetyPaused,
    reply: replyFocused,
    // Control Center / notification centre: the content is masked, so viewing time stops too.
    appInactive: appState !== 'active',
  });

  /**
   * Photo slide timer. Every pause (hold, safety menu, reply field, app inactive) keeps the
   * remaining time in `photoTimerRef`, so resuming continues the bar instead of restarting it.
   */
  useEffect(() => {
    if (queueLoading || closing || !queue.length) return;
    const nix = displayedNix;
    if (!nix?.media_path) return;
    // The video slide drives its own progress on the UI thread (ViewerNixVideo, PERF-24).
    if (nix.media_type === 'video') return;
    if (loading || !imageUrl || !imageReady || imageLoadError) {
      return () => {
        cancelAnimation(segmentProgress);
      };
    }

    const slideMs = autoAdvance ? viewerPhotoSlideMs(nix.view_duration_sec) : null;
    cancelAnimation(segmentProgress);
    if (slideMs === null) {
      // Unlimited, or manual advance for VoiceOver: the slide waits for the user.
      segmentProgress.set(1);
      return () => {
        cancelAnimation(segmentProgress);
      };
    }

    const existing = photoTimerRef.current;
    const timer =
      existing && existing.slideId === nix.id && existing.totalMs === slideMs
        ? existing
        : createViewerPhotoTimer(nix.id, slideMs);
    photoTimerRef.current = timer;
    segmentProgress.set(viewerPhotoTimerProgress(timer));
    if (playbackPaused) {
      return () => {
        cancelAnimation(segmentProgress);
      };
    }

    const startedAt = Date.now();
    segmentProgress.set(
      withTiming(0, {
        duration: timer.remainingMs,
        easing: Easing.linear,
      }),
    );
    // Dedicated JS timer to reliably advance slide, avoiding Reanimated callback races
    const advanceTimer = setTimeout(() => {
      finishCurrentSlideEvent();
    }, timer.remainingMs);

    return () => {
      clearTimeout(advanceTimer);
      cancelAnimation(segmentProgress);
      const current = photoTimerRef.current;
      // A restart clears the ref first; otherwise keep what is left for the resume.
      if (current && current.slideId === timer.slideId) {
        photoTimerRef.current = consumeViewerPhotoTimer(current, Date.now() - startedAt);
      }
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
    playbackPaused,
    autoAdvance,
    restartKey,
  ]);

  /** Left tap zone: the current slide starts over; it is not marked as viewed. */
  const restartCurrentSlide = () => {
    if (closingRef.current) return;
    photoTimerRef.current = null;
    setRestartKey((key) => key + 1);
  };

  const isVideoSlide = displayedNix?.media_type === 'video';
  // Muted videos mix with the user's music; only sound the user turned on takes the session.
  useEffect(() => {
    if (!isVideoSlide) return;
    void configureForViewerVideo(soundOn).catch((error: unknown) => {
      console.warn('Viewer audio session setup failed', error);
    });
  }, [isVideoSlide, soundOn]);

  const toggleSound = () => {
    const next = !soundOn;
    setViewerSoundOn(next);
    setSoundOn(next);
  };

  // Absolute, childless fill: animating width keeps its rounded end (scaleX would smear it).
  const activeSegmentFillStyle = useAnimatedStyle<ViewStyle>(() => ({
    width: `${Math.min(1, Math.max(0, 1 - segmentProgress.get())) * 100}%`,
  }));

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
    trackEvent('viewer_load_stage', {
      stage: 'decode',
      status: 'failure',
      media_type: 'video',
      error_class: 'transient',
    });
    setMediaState((current) => ({
      ...current,
      imageReady: false,
      imageLoadError: t('viewer.loadVideoFailed'),
    }));
    setViewerError({
      kind: 'transient',
      message: t('viewer.playVideoFailed'),
      reason: 'video_load_failed',
    });
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
    trackEvent('viewer_load_stage', {
      stage: 'decode',
      status: 'failure',
      media_type: 'image',
      error_class: 'transient',
    });
    setMediaState((current) => ({
      ...current,
      imageReady: false,
      imageLoadError: t('viewer.loadImageFailed'),
    }));
    setViewerError({
      kind: 'transient',
      message: t('viewer.loadImageFailed'),
      reason: 'image_load_failed',
    });
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
      () => setSafetyBusy(false),
    ).catch((error: unknown) => {
      notifyDomainError(error, t('viewer.reportFailure'));
      setSafetyPaused(false);
    });
  };

  const showReportReasons = () => {
    const reasons: ReportReason[] = [
      'harassment',
      'hate',
      'sexual_content',
      'violence',
      'self_harm',
      'impersonation',
      'spam',
      'privacy',
      'illegal_content',
      'other',
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
      },
    );
  };

  const confirmBlock = () => {
    if (!paramSenderId) {
      setSafetyPaused(false);
      return;
    }
    const title = senderName
      ? t('viewer.blockConfirmTitleNamed', { name: senderName })
      : t('viewer.blockConfirmTitle');
    Alert.alert(title, t('viewer.blockConfirmMessage'), [
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
      () => setIsSavingToGallery(false),
    );
  };

  const retryViewer = () => {
    setViewerError(null);
    setMediaState((current) => ({
      ...current,
      imageLoadError: null,
      loading: true,
      useNativeFallback: false,
    }));
    if (queue.length === 0) setQueueRetryKey((value) => value + 1);
    else setMediaRetryKey((value) => value + 1);
  };

  const leavingRef = useRef(false);
  const leaveViewer = (reason: ViewerLeaveReason = 'explicit_back') => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    trackEvent('viewer_close_reason', { reason });
    dispatchViewer({ type: 'close' });
    router.back();
  };

  const replyWithNix = () => {
    if (!paramSenderId || leavingRef.current) return;
    leavingRef.current = true;
    // Playback stops at once; the viewer then closes like any other exit.
    setUserPaused(true);
    trackEvent('viewer_close_reason', { reason: 'reply_with_nix' satisfies ViewerLeaveReason });
    dispatchViewer({ type: 'close' });
    router.dismissTo(replyWithNixHref(paramSenderId));
  };

  const skipUnavailable = () => {
    if (viewerError?.kind !== 'permanentMissing' || !currentNix) return;
    trackEvent('viewer_close_reason', { reason: 'explicit_skip_missing' });
    skipUnplayableSlide(viewerError.reason);
  };

  // While the queue loads, only the seed's media can fail; that error waits for the queue, which
  // may start with another nix (queue failures clear `queueLoading` together with their error).
  const isBootLoading =
    capturePolicyPending ||
    viewerMachine.status === 'booting' ||
    queueLoading ||
    (!queue.length && !closing && !viewerError);

  const slidePositionLabel = viewerSlidePositionLabel(slideIndex, queue.length, t);
  const mediaAccessibilityLabel = viewerMediaAccessibilityLabel({
    mediaType: displayedNix?.media_type ?? currentNix?.media_type,
    senderName,
    slideIndex,
    total: queue.length,
    t,
  });
  const sender: ViewerSender | null = paramSenderId
    ? {
        name: senderName,
        avatarUrl: senderAvatarPath ? (senderAvatarUrls[senderAvatarPath] ?? null) : null,
        avatarPath: senderAvatarPath,
        avatarEmoji: senderProfile?.avatar_emoji ?? null,
        fallbackInitial: senderProfile?.display_name ?? senderProfile?.username ?? null,
        timeLabel: formatViewerRelativeTime(currentNix?.created_at, openedAtMs, t),
      }
    : null;

  // VoiceOver: say which NiX is on screen once it is ready, and every error state.
  const announcedSlideRef = useRef<string | null>(null);
  useEffect(() => {
    if (!screenReaderEnabled || !imageReady || !displayedNix) return;
    if (announcedSlideRef.current === displayedNix.id) return;
    announcedSlideRef.current = displayedNix.id;
    AccessibilityInfo.announceForAccessibility(mediaAccessibilityLabel);
  }, [screenReaderEnabled, imageReady, displayedNix, mediaAccessibilityLabel]);

  const viewerErrorMessage = viewerError?.message ?? null;
  useEffect(() => {
    if (viewerErrorMessage) AccessibilityInfo.announceForAccessibility(viewerErrorMessage);
  }, [viewerErrorMessage]);

  const canReply = Boolean(paramSenderId && ownerId && paramSenderId !== ownerId);
  /**
   * A typed reply counts as having opened the NiX (Snapchat): once queued, the slide is marked
   * viewed and the viewer moves on (next NiX, or closes after the last). Emoji fallbacks sent as
   * text (`advance: false`) keep the NiX on screen.
   */
  const sendReply = async (body: string, options: { advance?: boolean } = {}): Promise<boolean> => {
    if (!paramSenderId || !ownerId) return false;
    try {
      const sent = await sendQuickTextReply({
        ownerId,
        peerId: paramSenderId,
        body,
        online: canUseNetworkSession,
        queryClient,
        // The NiX on screen; the server ignores it unless this sender sent it to me.
        replyToNixId: displayedNix?.id ?? null,
      });
      if (sent) {
        notifySuccess(t('viewer.replySent'));
        if (options.advance !== false) {
          setReplyFocused(false);
          finishCurrentSlide();
        }
      }
      return sent;
    } catch (error) {
      notifyDomainError(error, t('viewer.replyFailure'));
      return false;
    }
  };

  // NiX reactions (receiver only). The whole queue in one query: switching slides is instant.
  const nixReactions = useNixReactions(
    queue.map((item) => item.id),
    { enabled: canReply },
  );
  const toggleNixReaction = useToggleNixReaction();
  const reactionNixId = displayedNix?.id ?? null;
  const emojiMode = viewerEmojiMode({
    canReply,
    reactionsAvailable: nixReactions.available,
    nixId: reactionNixId,
  });
  const nixReaction = nixReactions.reactionFor(reactionNixId)?.emoji ?? null;
  const reactToNix = async (emoji: MessageReactionEmoji): Promise<ViewerReactionOutcome> => {
    const glyph = MESSAGE_REACTION_GLYPHS[emoji];
    const sendAsText = async (): Promise<ViewerReactionOutcome> =>
      (await sendReply(glyph, { advance: false }))
        ? { status: 'sentAsText' }
        : { status: 'failed', error: null };
    if (emojiMode !== 'reaction' || !reactionNixId) return sendAsText();
    const result = await toggleNixReaction(reactionNixId, emoji);
    // The backend lost the RPCs (rollback / stale schema cache): keep the old text behaviour.
    if (result.status === 'unavailable') return sendAsText();
    if (result.status === 'failed') notifyDomainError(result.error, t('viewer.nixReactionFailure'));
    return result;
  };

  return {
    viewerPhase: viewerMachine.status,
    isBootLoading,
    styles,
    colors,
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
    videoPlayer,
    canDismissByTap,
    finishCurrentSlide,
    handleNextTap,
    segmentProgress,
    activeSegmentFillStyle,
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
    autoAdvance,
    screenReaderEnabled: screenReaderEnabled === true,
    playbackPaused,
    userPaused,
    setUserPaused,
    restartKey,
    restartCurrentSlide,
    videoLoop: (displayedNix?.view_duration_sec ?? 5) === 0 || !autoAdvance,
    isVideoSlide,
    soundOn,
    toggleSound,
    sender,
    isReplay: paramIsReplay,
    slidePositionLabel,
    mediaAccessibilityLabel,
    canReply,
    replyFocused,
    setReplyFocused,
    sendReply,
    emojiMode,
    nixReaction,
    reactToNix,
    replyWithNix,
  };
}
