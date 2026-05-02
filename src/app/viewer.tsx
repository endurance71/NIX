import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable, Image as RNImage } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  createSignedSnapUrl,
  flushCleanupQueue,
  markSnapViewedWithCleanup,
  fetchUnreadInboxQueueFromSender,
} from '../services/snapService';
import { normalizeSnapViewDurationSec } from '../lib/snapViewDuration';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { refreshInboxBadgeCount } from '../lib/inboxBadgeStore';

type SnapQueueItem = { id: string; media_path: string; view_duration_sec: number };

function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function ViewerScreen() {
  const queryClient = useQueryClient();
  const { colors, statusBarStyle, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const raw = useLocalSearchParams<{
    id?: string;
    path?: string;
    senderId?: string;
    viewDurationSec?: string;
  }>();
  const paramId = paramFirst(raw.id);
  const paramPath = paramFirst(raw.path);
  const paramSenderId = paramFirst(raw.senderId);
  const paramViewDurationSec = normalizeSnapViewDurationSec(paramFirst(raw.viewDurationSec));

  const [queueLoading, setQueueLoading] = useState(true);
  const [queue, setQueue] = useState<SnapQueueItem[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageReady, setImageReady] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  const [useNativeFallback, setUseNativeFallback] = useState(false);
  const [closing, setClosing] = useState(false);
  const segmentProgress = useSharedValue(1);
  const lastFinishedSlideIdRef = useRef<string | null>(null);

  // Refs for stable callback
  const queueRef = useRef<SnapQueueItem[]>(queue);
  const slideIndexRef = useRef(slideIndex);
  const closingRef = useRef(closing);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { slideIndexRef.current = slideIndex; }, [slideIndex]);
  useEffect(() => { closingRef.current = closing; }, [closing]);

  const signedUrlTtlSec = useMemo(() => {
    const totalViewSec = queue.reduce((acc, s) => acc + (s.view_duration_sec ?? 5), 0);
    return Math.min(600, 90 + totalViewSec);
  }, [queue]);

  useEffect(() => {
    let cancelled = false;

    async function initQueue() {
      if (paramSenderId) {
        setQueueLoading(true);
        try {
          const snaps = await fetchUnreadInboxQueueFromSender(paramSenderId);
          if (cancelled) return;
          if (snaps.length === 0) {
            router.back();
            return;
          }
          setQueue(
            snaps.map((s) => ({
              id: s.id,
              media_path: s.media_path,
              view_duration_sec: s.view_duration_sec ?? 5,
            }))
          );
        } catch (err) {
          console.error('Nie udało się pobrać kolejki snapów', err);
          if (!cancelled) router.back();
        } finally {
          if (!cancelled) setQueueLoading(false);
        }
        return;
      }

      if (paramId && paramPath) {
        setQueue([{ id: paramId, media_path: paramPath, view_duration_sec: paramViewDurationSec }]);
        setQueueLoading(false);
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
  }, []);

  const currentSnap = queue[slideIndex] ?? null;

  const finishCurrentSlide = useCallback(() => {
    if (closingRef.current) return;
    const item = queueRef.current[slideIndexRef.current];
    if (!item) return;
    if (lastFinishedSlideIdRef.current === item.id) return;
    lastFinishedSlideIdRef.current = item.id;

    cancelAnimation(segmentProgress);
    segmentProgress.value = 1;

    void (async () => {
      try {
        await markSnapViewedWithCleanup(item.id, item.media_path);
      } catch (err) {
        console.error('Nie udało się zaktualizować statusu', err);
      } finally {
        await refreshInboxBadgeCount(queryClient);
      }
    })();

    if (slideIndexRef.current < queueRef.current.length - 1) {
      setSlideIndex((n) => n + 1);
      setImageReady(false);
      setImageLoadError(null);
    } else {
      setClosing(true);
      router.back();
    }
  }, [queryClient, segmentProgress]);

  useEffect(() => {
    const path = currentSnap?.media_path;
    if (!path || queueLoading || closing) return;

    let cancelled = false;
    setLoading(true);
    setImageReady(false);
    setImageLoadError(null);
    setUseNativeFallback(false);

    (async () => {
      try {
        const signedUrl = await createSignedSnapUrl(path, signedUrlTtlSec);
        if (cancelled) return;
        await ExpoImage.prefetch(signedUrl, 'memory-disk');
        if (cancelled) return;
        setImageUrl(signedUrl);
      } catch (err) {
        console.error('Nie udało się załadować wiadomości', err);
        if (!cancelled) {
          finishCurrentSlide();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentSnap?.media_path, queueLoading, closing, signedUrlTtlSec, finishCurrentSlide]);

  const nextSnap = queue[slideIndex + 1] ?? null;
  useEffect(() => {
    const path = nextSnap?.media_path;
    if (!path || queueLoading || closing) return;

    let cancelled = false;
    void (async () => {
      try {
        const signedUrl = await createSignedSnapUrl(path, signedUrlTtlSec);
        if (!cancelled) await ExpoImage.prefetch(signedUrl, 'memory-disk');
      } catch {
        // Prefetch opcjonalny — ignorujemy błędy sieci.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nextSnap?.media_path, signedUrlTtlSec, queueLoading, closing]);

  useEffect(() => {
    if (!imageLoadError || closing || queueLoading) return;
    finishCurrentSlide();
  }, [imageLoadError, closing, queueLoading, finishCurrentSlide]);

  useEffect(() => {
    if (queueLoading || closing || !queue.length) return;
    if (!currentSnap?.media_path) return;
    if (!loading && imageUrl && imageReady && !imageLoadError) {
      const slideMs = Math.max(1000, (currentSnap.view_duration_sec ?? 5) * 1000);
      segmentProgress.value = 1;
      segmentProgress.value = withTiming(
        0,
        {
          duration: slideMs,
          easing: Easing.linear,
        },
        (finished) => {
          if (finished) {
            runOnJS(finishCurrentSlide)();
          }
        }
      );
    }
    return () => {
      cancelAnimation(segmentProgress);
    };
  }, [
    queueLoading,
    closing,
    queue.length,
    currentSnap?.media_path,
    currentSnap?.view_duration_sec,
    loading,
    imageUrl,
    imageReady,
    imageLoadError,
    finishCurrentSlide,
    segmentProgress,
  ]);

  const activeSegmentMaskStyle = useAnimatedStyle(() => ({
    width: `${(1 - segmentProgress.value) * 100}%`,
  }));

  if (queueLoading || (!queue.length && !closing)) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.label} />
      </View>
    );
  }

  return (
    <Animated.View style={styles.container} entering={FadeIn}>
      <StatusBar style={statusBarStyle} hidden />

      <View style={[styles.timerHudShell, { top: insets.top + 10 }]}>
        <BlurView intensity={isDark ? 72 : 58} tint={isDark ? 'dark' : 'light'} style={styles.timerBlur} />
        <View style={styles.timerHudInner}>
          <View style={styles.segmentsRow}>
            {queue.map((snap, segIndex) => {
              const isDone = segIndex < slideIndex;
              const isActive = segIndex === slideIndex;
              return (
                <View key={snap.id} style={styles.segmentCell}>
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

      {imageUrl ? (
        <View style={styles.imageContainer}>
          {!useNativeFallback ? (
            <ExpoImage
              source={{
                uri: imageUrl,
                cacheKey: currentSnap?.media_path ?? imageUrl,
              }}
              style={styles.image}
              contentFit="cover"
              transition={380}
              cachePolicy="memory-disk"
              onLoad={() => {
                setImageReady(true);
                setImageLoadError(null);
              }}
              onError={(event) => {
                console.warn('expo-image load error, fallback to native image', event);
                setImageReady(false);
                setUseNativeFallback(true);
              }}
            />
          ) : (
            <RNImage
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="cover"
              onLoad={() => {
                setImageReady(true);
                setImageLoadError(null);
              }}
              onError={(event) => {
                console.error('native image load error', event.nativeEvent);
                setImageReady(false);
                setImageLoadError('Nie udało się wczytać zdjęcia.');
              }}
            />
          )}
        </View>
      ) : null}
      {imageReady && !imageLoadError ? (
        <Pressable
          style={styles.dismissArea}
          onPress={finishCurrentSlide}
          disabled={closing}
          accessibilityLabel="Przejdź do następnego snapa"
          accessibilityRole="button"
        />
      ) : null}
      {!imageUrl && !imageLoadError ? (
        <View style={styles.loadingOverlaySolid}>
          <ActivityIndicator color={colors.label} />
        </View>
      ) : null}
      {imageLoadError ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{imageLoadError}</Text>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityLabel="Wróć"
            accessibilityRole="button"
            hitSlop={10}
          >
            <Text style={styles.backButtonText}>Wróć</Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

const TIMER_TRACK_HEIGHT = 8;

const createStyles = (colors: ThemeColors) => {
  const progressBlue = colors.systemBlue;
  const trackSoftWhite = colors.viewerChromeFill;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.systemBackground,
      justifyContent: 'center',
      alignItems: 'center',
    },
    timerHudShell: {
      position: 'absolute',
      left: 16,
      right: 16,
      borderRadius: 12,
      overflow: 'hidden',
      zIndex: 10,
    },
    timerBlur: {
      ...StyleSheet.absoluteFillObject,
    },
    timerHudInner: {
      paddingHorizontal: 14,
      paddingVertical: 8,
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
      ...StyleSheet.absoluteFillObject,
      backgroundColor: trackSoftWhite,
    },
    segmentFillDone: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: progressBlue,
    },
    segmentProgressMask: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: TIMER_TRACK_HEIGHT / 2,
      backgroundColor: progressBlue,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    imageContainer: {
      width: '100%',
      height: '100%',
    },
    dismissArea: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 5,
    },
    loadingOverlaySolid: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.systemBackground,
      zIndex: 6,
    },
    errorOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.systemBackground,
      paddingHorizontal: 24,
    },
    errorText: {
      ...typography.callout,
      color: colors.label,
      textAlign: 'center',
      marginBottom: 14,
    },
    backButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.secondarySystemBackground,
    },
    backButtonText: {
      ...typography.footnote,
      color: colors.label,
      fontWeight: '700',
    },
  });
};
