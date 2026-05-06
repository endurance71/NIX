import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
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
import { SFSymbol } from '../components/ui/sf-symbol';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoDraft, type VideoSegmentDraft } from '../context/VideoDraftContext';
import {
  SNAP_VIEW_DURATION_CHOICES,
  DEFAULT_SNAP_VIEW_DURATION_SEC,
  formatSnapViewDurationLabel,
  loadPreferredSnapViewDuration,
  savePreferredSnapViewDuration,
  shortSnapViewDurationLabel,
  type SnapViewDurationSec,
} from '../lib/snapViewDuration';
import { Host, ConfirmationDialog, Button, Text as SUIText, RNHostView } from '@expo/ui/swift-ui';

const TIMER_TRACK_HEIGHT = 8;
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
  segmentProgress,
  onReady,
  onPlaybackError,
  style,
}: {
  uri: string;
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
    // Autoplay attempt on initialization (some iOS devices are more reliable this way).
    p.play();
  });

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

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      // Safety replay in case initial autoplay was ignored during buffering.
      player.play();
      onReady();
    }
    if (status === 'error') {
      onPlaybackError();
    }
  });

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
    setVideoReady(false);
    setVideoError(null);
    cancelAnimation(segmentProgress);
    segmentProgress.value = 1;
  }, [clipIndex, current.uri, segmentProgress]);

  const activeSegmentMaskStyle = useAnimatedStyle(() => ({
    width: `${(1 - segmentProgress.value) * 100}%`,
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
            <SFSymbol name="xmark" size={22} tintColor={colors.cameraControlTint} />
          </Pressable>
        </View>

        <View style={styles.bottomControls}>
          <Pressable
            accessibilityLabel="Wyślij nagranie"
            accessibilityRole="button"
            onPress={handleSendTo}
            style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}>
            <Text style={styles.sendButtonText}>Wyślij do</Text>
            <SFSymbol name="chevron.right" size={16} tintColor={colors.buttonPrimaryText} />
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

  const [viewDurationSec, setViewDurationSec] = useState<SnapViewDurationSec>(DEFAULT_SNAP_VIEW_DURATION_SEC);
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);

  const { segments, clearSegments } = useVideoDraft();

  useEffect(() => {
    let cancelled = false;
    void loadPreferredSnapViewDuration().then((sec) => {
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
            <SFSymbol name="xmark" size={22} tintColor={colors.cameraControlTint} />
          </Pressable>
          <Host matchContents>
            <ConfirmationDialog
              title="Czas wyświetlania"
              isPresented={durationPickerOpen}
              onIsPresentedChange={setDurationPickerOpen}>
              <ConfirmationDialog.Trigger>
                <RNHostView matchContents>
                  <Pressable
                    style={styles.snapDurationButton}
                    onPress={() => setDurationPickerOpen(true)}
                    hitSlop={10}
                    accessibilityLabel={`Czas wyświetlania: ${formatSnapViewDurationLabel(viewDurationSec)}`}>
                    <SFSymbol name="timer" size={20} tintColor={colors.cameraControlTint} />
                    <Text style={styles.snapDurationButtonLabel}>{shortSnapViewDurationLabel(viewDurationSec)}</Text>
                  </Pressable>
                </RNHostView>
              </ConfirmationDialog.Trigger>
              <ConfirmationDialog.Message>
                <SUIText>Jak długo zdjęcie będzie widoczne u odbiorcy po otwarciu.</SUIText>
              </ConfirmationDialog.Message>
              <ConfirmationDialog.Actions>
                {SNAP_VIEW_DURATION_CHOICES.map((sec) => (
                  <Button
                    key={sec}
                    label={formatSnapViewDurationLabel(sec)}
                    {...(sec === viewDurationSec ? { systemImage: 'checkmark.circle.fill' as const } : {})}
                    onPress={() => {
                      setViewDurationSec(sec);
                      void savePreferredSnapViewDuration(sec);
                      setDurationPickerOpen(false);
                    }}
                  />
                ))}
                <Button role="cancel" label="Anuluj" onPress={() => setDurationPickerOpen(false)} />
              </ConfirmationDialog.Actions>
            </ConfirmationDialog>
          </Host>
        </View>

        <View style={styles.bottomControls}>
          <Pressable
            accessibilityLabel="Wybierz odbiorców zdjęcia"
            accessibilityRole="button"
            onPress={handleSendTo}
            style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}>
            <Text style={styles.sendButtonText}>Wyślij do</Text>
            <SFSymbol name="chevron.right" size={16} tintColor={colors.buttonPrimaryText} />
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
    snapDurationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 48,
      paddingHorizontal: 14,
      borderRadius: 24,
      backgroundColor: colors.cameraControlBackground,
    },
    snapDurationButtonLabel: {
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
      ...StyleSheet.absoluteFillObject,
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
    dismissArea: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 5,
    },
    loadingOverlaySolid: {
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      zIndex: 8,
    },
  });
};
