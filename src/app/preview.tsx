import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
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
import { AppIcon } from '../components/ui/app-icon';
import { DurationPickerSheet } from '../components/ui/duration-picker-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoDraft, type VideoSegmentDraft } from '../context/VideoDraftContext';
import { configureForPlayback } from '../lib/audioSession';
import { trackEvent } from '../lib/telemetry';
import { tap } from '../lib/haptics';
import {
  NIX_VIEW_DURATION_CHOICES,
  DEFAULT_NIX_VIEW_DURATION_SEC,
  formatNixViewDurationLabel,
  loadPreferredNixViewDuration,
  savePreferredNixViewDuration,
  shortNixViewDurationLabel,
  type NixViewDurationSec,
} from '../lib/nixViewDuration';

const TIMER_TRACK_HEIGHT = 8;
/** Maks. czas oczekiwania na `readyToPlay` zanim wymusimy `play()` + `onReady()`. */
const PREVIEW_VIDEO_WATCHDOG_MS = 2500;
/** Odstęp od safe area do pill z paskiem segmentów (zgodny z `timerHudShell`). */
const VIDEO_PREVIEW_TIMER_HUD_TOP = 10;
/** `paddingVertical` wewnątrz pill (`timerHudInner`) — musi być zsynchronizowany ze stylami. */
const VIDEO_PREVIEW_TIMER_HUD_PADDING_V = 8;
/** Odstęp między dolną krawędzią pill a przyciskiem zamknięcia. */
const VIDEO_PREVIEW_CLOSE_BELOW_TIMER_GAP = 12;

function previewTimerHudContentHeight() {
  return VIDEO_PREVIEW_TIMER_HUD_PADDING_V * 2 + TIMER_TRACK_HEIGHT;
}

function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function PreviewSegmentVideo({
  uri,
  segmentIndex,
  segmentProgress,
  onReady,
  onPlaybackError,
  style,
}: {
  uri: string;
  segmentIndex: number;
  segmentProgress: SharedValue<number>;
  onReady: () => void;
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

  const onReadyEffect = useEffectEvent(onReady);
  const onPlaybackErrorEffect = useEffectEvent(onPlaybackError);

  const statusEvent = useEvent(player, 'statusChange', { status: player.status });
  const status = statusEvent?.status ?? player.status;

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const dur = player.duration;
    if (dur > 0) {
      const nextProgress = Math.max(0, Math.min(1, 1 - currentTime / dur));
      segmentProgress.value = withTiming(nextProgress, {
        duration: 90,
        easing: Easing.linear,
      });
    }
  });

  useEffect(() => {
    if (status === 'readyToPlay') {
      if (!readyEmittedRef.current) {
        readyEmittedRef.current = true;
        trackEvent('preview_video_status_change', {
          status,
          segment_index: segmentIndex,
        });
        onReadyEffect();
      }
      try {
        player.play();
      } catch {
        // ignorujemy błąd play() — followup statusChange/error obsłuży przypadek
      }
      return;
    }
    if (status === 'error' && !errorEmittedRef.current) {
      errorEmittedRef.current = true;
      trackEvent('preview_video_status_change', {
        status,
        segment_index: segmentIndex,
      });
      onPlaybackErrorEffect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- useEffectEvent (onReady / onPlaybackError)
  }, [status, segmentIndex, player]);

  useEffect(() => {
    readyEmittedRef.current = false;
    errorEmittedRef.current = false;
    watchdogFiredRef.current = false;
  }, [uri]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (readyEmittedRef.current || errorEmittedRef.current) return;
      watchdogFiredRef.current = true;
      trackEvent('preview_video_stuck_watchdog', {
        current_status: player.status,
        segment_index: segmentIndex,
      });
      try {
        player.play();
      } catch {
        // ignorujemy
      }
      readyEmittedRef.current = true;
      onReadyEffect();
    }, PREVIEW_VIDEO_WATCHDOG_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- useEffectEvent onReady
  }, [uri, segmentIndex, player]);

  return <VideoView style={style} player={player} contentFit="cover" nativeControls={false} />;
}

function PreviewVideoContent({
  segments,
  clearDraft,
}: {
  segments: VideoSegmentDraft[];
  clearDraft: () => void;
}) {
  const { colors, statusBarStyle, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [clipIndex, setClipIndex] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const segmentProgress = useSharedValue(1);

  const current = segments[clipIndex];

  useEffect(() => {
    void configureForPlayback().catch((error) => {
      console.warn('Preview audio session setup failed', error);
    });
  }, []);

  useEffect(() => {
    setVideoReady(false);
    setVideoError(null);
    cancelAnimation(segmentProgress);
    segmentProgress.value = 1;
  }, [clipIndex, current.uri, segmentProgress]);

  const activeSegmentMaskStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0, 1 - segmentProgress.value) }],
  }));

  const advanceClip = useCallback(() => {
    setClipIndex((i) => (i + 1) % segments.length);
  }, [segments.length]);

  const handleVideoReady = useCallback(() => {
    setVideoReady(true);
    setVideoError(null);
  }, []);

  const handleVideoPlaybackError = useCallback(() => {
    setVideoError('Nie udało się odtworzyć nagrania.');
  }, []);

  const handleDiscard = () => {
    clearDraft();
    router.back();
  };

  const handleSendTo = () => {
    tap('light');
    router.push({
      pathname: '/send-to',
      params: { mode: 'video' },
    });
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
      <StatusBar style={statusBarStyle} hidden />

      <View style={[styles.timerHudShell, { top: insets.top + VIDEO_PREVIEW_TIMER_HUD_TOP }]}>
        <BlurView intensity={isDark ? 72 : 58} tint={isDark ? 'dark' : 'light'} style={styles.timerBlur} />
        <View style={styles.timerHudInner}>
          <View style={styles.segmentsRow}>
            {segments.map((_, segIndex) => {
              const isDone = segIndex < clipIndex;
              const isActive = segIndex === clipIndex;
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

      <PreviewSegmentVideo
        key={`${clipIndex}-${current.uri}`}
        uri={current.uri}
        segmentIndex={clipIndex}
        segmentProgress={segmentProgress}
        onReady={handleVideoReady}
        onPlaybackError={handleVideoPlaybackError}
        style={styles.image}
      />

      {videoReady && !videoError ? (
        <Pressable
          style={styles.dismissArea}
          onPress={advanceClip}
          accessibilityLabel="Następny fragment"
          accessibilityRole="button"
        />
      ) : null}

      {!videoReady && !videoError ? (
        <View style={styles.loadingOverlaySolid}>
          <Text style={styles.loadingHint}>Ładowanie podglądu…</Text>
        </View>
      ) : null}

      {videoError ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{videoError}</Text>
          <Pressable style={styles.backButton} onPress={handleDiscard}>
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
          <Pressable accessibilityLabel="Porzuć nagranie" accessibilityRole="button" onPress={handleDiscard} style={styles.iconButton}>
            <AppIcon name="close" size={22} color={colors.cameraControlTint} />
          </Pressable>
        </View>

        <View style={styles.bottomControls}>
          <Pressable
            accessibilityLabel="Wyślij nagranie"
            accessibilityRole="button"
            onPress={handleSendTo}
            style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}>
            <Text style={styles.sendButtonText}>Wyślij do</Text>
            <AppIcon name="chevronRight" size={16} color={colors.buttonPrimaryText} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

export default function PreviewScreen() {
  const { colors, statusBarStyle } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const raw = useLocalSearchParams<{ uri?: string; viewDurationSec?: string; mode?: string }>();
  const mode = paramFirst(raw.mode);
  const uri = paramFirst(raw.uri);

  const [viewDurationSec, setViewDurationSec] = useState<NixViewDurationSec>(DEFAULT_NIX_VIEW_DURATION_SEC);
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);

  const { segments, clearSegments } = useVideoDraft();

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
    if (!segments?.length) {
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
    return <PreviewVideoContent segments={segments} clearDraft={clearSegments} />;
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

  const handleDiscard = () => {
    router.back();
  };

  const handleSendTo = () => {
    tap('light');
    router.push({
      pathname: '/send-to',
      params: { uri, mode: 'image', viewDurationSec: String(viewDurationSec) },
    });
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
      <StatusBar style={statusBarStyle} hidden />

      <Image source={{ uri }} style={styles.image} contentFit="cover" cachePolicy="none" />

      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }]}>
        <View style={[styles.topControls, styles.photoPreviewTopControls]}>
          <Pressable
            accessibilityLabel="Odrzuć zdjęcie"
            accessibilityRole="button"
            onPress={handleDiscard}
            style={styles.iconButton}>
            <AppIcon name="close" size={22} color={colors.cameraControlTint} />
          </Pressable>
          <Pressable
            style={styles.nixDurationButton}
            onPress={() => setDurationPickerOpen(true)}
            hitSlop={10}
            accessibilityLabel={`Czas wyświetlania: ${formatNixViewDurationLabel(viewDurationSec)}`}>
            <AppIcon name="timer" size={20} color={colors.cameraControlTint} />
            <Text style={styles.nixDurationButtonLabel}>{shortNixViewDurationLabel(viewDurationSec)}</Text>
          </Pressable>
          <DurationPickerSheet
            isPresented={durationPickerOpen}
            onDismiss={() => setDurationPickerOpen(false)}
            selectedDurationSec={viewDurationSec}
            choices={NIX_VIEW_DURATION_CHOICES}
            onSelect={(sec) => {
              setViewDurationSec(sec);
              void savePreferredNixViewDuration(sec);
            }}
          />
        </View>

        <View style={styles.bottomControls}>
          <Pressable
            accessibilityLabel="Wybierz odbiorców zdjęcia"
            accessibilityRole="button"
            onPress={handleSendTo}
            style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}>
            <Text style={styles.sendButtonText}>Wyślij do</Text>
            <AppIcon name="chevronRight" size={16} color={colors.buttonPrimaryText} />
          </Pressable>
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
      backgroundColor: colors.background,
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
      justifyContent: 'space-between',
      alignItems: 'center',
      alignSelf: 'stretch',
    },
    nixDurationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 48,
      paddingHorizontal: 14,
      borderRadius: 24,
      backgroundColor: colors.cameraControlBackground,
    },
    nixDurationButtonLabel: {
      color: colors.cameraControlTint,
      ...typography.footnote,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.cameraControlBackground,
      justifyContent: 'center',
      alignItems: 'center',
    },
    bottomControls: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.buttonPrimaryBg,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 24,
      gap: 4,
    },
    sendButtonPressed: {
      opacity: 0.8,
    },
    sendButtonText: {
      ...typography.callout,
      color: colors.buttonPrimaryText,
      fontWeight: '700',
      letterSpacing: 0.3,
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
      backgroundColor: colors.background,
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
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      zIndex: 8,
    },
  });
};
