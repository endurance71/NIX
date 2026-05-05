import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withSequence,
  withRepeat,
  cancelAnimation,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { SFSymbol } from '../../components/ui/sf-symbol';
import { VIDEO_HOLD_THRESHOLD_MS, VIDEO_TOTAL_MAX_DURATION_MS } from '../../lib/videoRecordingLimits';
import { useVideoDraft } from '../../context/VideoDraftContext';

export default function CameraScreen() {
  const { colors, statusBarStyle } = useAppTheme();
  const { setSegments } = useVideoDraft();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  /** `true` = nagranie bez dźwięku (`CameraView` mute). */
  const [recordAudioMuted, setRecordAudioMuted] = useState(false);
  const [permissionLoadingTimedOut, setPermissionLoadingTimedOut] = useState(false);
  const [takingPicture, setTakingPicture] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const cameraReadyRef = useRef(false);
  const fingerDownRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingSessionRunningRef = useRef(false);
  const pressInTimeRef = useRef(0);

  const shutterScale = useSharedValue(1);
  const recordingPulseScale = useSharedValue(1);
  const flashOpacity = useSharedValue(0);

  useEffect(() => {
    if (!recordingVideo) {
      cancelAnimation(recordingPulseScale);
      recordingPulseScale.value = 1;
      return;
    }
    recordingPulseScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [recordingVideo, recordingPulseScale]);

  const animatedShutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value * recordingPulseScale.value }],
  }));

  const animatedFlashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  useEffect(() => {
    if (permission) {
      setPermissionLoadingTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setPermissionLoadingTimedOut(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [permission]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    cameraReadyRef.current = false;
    setCameraReady(false);
  }, [facing]);

  const waitForCameraReady = useCallback(async (timeoutMs = 12000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (cameraReadyRef.current && cameraRef.current != null) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    return false;
  }, []);

  const onCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
    setCameraReady(true);
  }, []);

  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    if (micPermission?.granted) return true;
    const res = await requestMicPermission();
    return res.granted;
  }, [micPermission?.granted, requestMicPermission]);

  const runVideoCaptureSession = useCallback(async () => {
    const sessionStart = Date.now();

    const tick = setInterval(() => {
      setRecordingElapsedMs(Math.min(Date.now() - sessionStart, VIDEO_TOTAL_MAX_DURATION_MS));
    }, 120);

    setRecordingVideo(true);
    setRecordingElapsedMs(0);
    setCaptureError(null);

    let result: { uri?: string } | undefined;
    let attemptedRecord = false;
    try {
      const ready = await waitForCameraReady();
      if (!ready) {
        console.error('recordAsync: przekroczono oczekiwanie na onCameraReady');
        return;
      }
      if (!fingerDownRef.current) {
        return;
      }

      const cam = cameraRef.current;
      if (!cam) {
        setCaptureError('Kamera nie jest dostępna.');
        return;
      }

      const maxDurSec = Math.max(1, Math.ceil(VIDEO_TOTAL_MAX_DURATION_MS / 1000));
      attemptedRecord = true;
      const recordStartedAt = Date.now();
      try {
        result = await cam.recordAsync({ maxDuration: maxDurSec });
      } catch (err) {
        console.error('recordAsync nie powiodło się', err);
      }

      const durationMs = Math.min(Date.now() - recordStartedAt, VIDEO_TOTAL_MAX_DURATION_MS);
      if (result?.uri) {
        setSegments([{ uri: result.uri, durationMs }]);
        router.push({ pathname: '/preview', params: { mode: 'video' } });
      } else if (attemptedRecord) {
        setCaptureError('Nie udało się zapisać nagrania. Spróbuj ponownie.');
      }
    } finally {
      clearInterval(tick);
      setRecordingVideo(false);
      setRecordingElapsedMs(0);
    }
  }, [setSegments, waitForCameraReady]);

  const startVideoCaptureFlow = useCallback(async () => {
    if (recordingSessionRunningRef.current) return;
    if (!fingerDownRef.current) return;

    const micOk = await ensureMicPermission();
    if (!micOk) {
      setCaptureError('NiX potrzebuje dostępu do mikrofonu, aby nagrywać wideo.');
      fingerDownRef.current = false;
      return;
    }
    if (!fingerDownRef.current) return;

    recordingSessionRunningRef.current = true;
    try {
      if (process.env.EXPO_OS === 'ios') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await runVideoCaptureSession();
    } finally {
      recordingSessionRunningRef.current = false;
    }
  }, [ensureMicPermission, runVideoCaptureSession]);

  const takePicture = async () => {
    if (takingPicture || recordingVideo || recordingSessionRunningRef.current) return;
    setTakingPicture(true);
    setCaptureError(null);
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    shutterScale.value = withSequence(
      withTiming(0.85, { duration: 100, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 100, easing: Easing.out(Easing.ease) })
    );

    flashOpacity.value = withSequence(
      withTiming(1, { duration: 50 }),
      withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) })
    );

    if (cameraRef.current) {
      try {
        const ready = await waitForCameraReady();
        if (!ready) {
          setCaptureError('Kamera nie jest jeszcze gotowa. Spróbuj ponownie.');
          setTakingPicture(false);
          return;
        }
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
          skipProcessing: false,
        });

        if (photo) {
          router.push({
            pathname: '/preview',
            params: { uri: photo.uri },
          });
        }
      } catch (err) {
        console.error('Nie udało się zrobić zdjęcia', err);
        setCaptureError('Nie udało się zrobić zdjęcia. Spróbuj ponownie.');
      } finally {
        setTakingPicture(false);
      }
    } else {
      setCaptureError('Kamera nie jest jeszcze gotowa.');
      setTakingPicture(false);
    }
  };

  const onShutterPressIn = () => {
    if (takingPicture || recordingSessionRunningRef.current) return;
    pressInTimeRef.current = Date.now();
    fingerDownRef.current = true;

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (!fingerDownRef.current) return;
      void startVideoCaptureFlow();
    }, VIDEO_HOLD_THRESHOLD_MS);
  };

  const onShutterPressOut = () => {
    fingerDownRef.current = false;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      const elapsed = Date.now() - pressInTimeRef.current;
      if (elapsed < VIDEO_HOLD_THRESHOLD_MS && !recordingSessionRunningRef.current) {
        void takePicture();
      }
      return;
    }

    if (recordingSessionRunningRef.current) {
      cameraRef.current?.stopRecording();
    }
  };

  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Inicjalizacja kamery...</Text>
        {permissionLoadingTimedOut && (
          <>
            <Text style={styles.permissionHint}>
              Kamera nie odpowiedziała. Spróbuj ponownie albo przejdź do Skrzynki.
            </Text>
            <Pressable style={styles.permissionButton} onPress={() => router.replace('/(tabs)/inbox')}>
              <Text style={styles.permissionButtonText}>Przejdź do Skrzynki</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>NiX potrzebuje dostępu do kamery, aby uchwycić momenty.</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Udziel dostępu</Text>
        </Pressable>
      </View>
    );
  }

  const toggleFacing = () => {
    if (recordingVideo) return;
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    if (recordingVideo) return;
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  };

  const toggleRecordingMicMuted = () => {
    setRecordAudioMuted((m) => !m);
  };

  const recordingSecTotal = Math.floor(recordingElapsedMs / 1000);

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} hidden />
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="video"
        mute={recordAudioMuted}
        enableTorch={flash === 'on'}
        onCameraReady={onCameraReady}
      />
      <View style={styles.cameraOverlay}>
        <Animated.View style={[styles.flashOverlay, animatedFlashStyle]} pointerEvents="none" />

        <View style={[styles.controlsContainer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.topControls}>
            {recordingVideo ? (
              <>
                <View style={styles.recordingTimerTopLeft} pointerEvents="none" accessibilityLiveRegion="polite">
                  <View style={styles.recordingPill}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingHudText} accessibilityLabel={`Nagrywanie ${recordingSecTotal} sekund z ${VIDEO_TOTAL_MAX_DURATION_MS / 1000}`}>
                      {recordingSecTotal}s / {VIDEO_TOTAL_MAX_DURATION_MS / 1000}s
                    </Text>
                  </View>
                </View>
                <View style={styles.topTrailingCluster}>
                  <Pressable
                    onPress={toggleRecordingMicMuted}
                    style={styles.iconButton}
                    accessibilityLabel={
                      recordAudioMuted ? 'Włącz nagrywanie dźwięku' : 'Wycisz nagrywanie dźwięku'
                    }
                    hitSlop={15}>
                    <SFSymbol
                      name={recordAudioMuted ? 'mic.slash.fill' : 'mic.fill'}
                      size={22}
                      tintColor={colors.cameraControlTint}
                    />
                  </Pressable>
                  {facing === 'back' ? (
                    <Pressable
                      onPress={toggleFlash}
                      style={styles.iconButton}
                      accessibilityLabel={flash === 'on' ? 'Wyłącz latarkę' : 'Włącz latarkę'}
                      hitSlop={15}
                      disabled={true}>
                      <SFSymbol
                        name={flash === 'on' ? 'bolt.fill' : 'bolt.slash.fill'}
                        size={22}
                        tintColor={colors.cameraControlTint}
                      />
                    </Pressable>
                  ) : (
                    <View style={styles.topControlTrailingSpacer} />
                  )}
                </View>
              </>
            ) : (
              <>
                <View style={styles.topLeadingCluster}>
                  {facing === 'back' ? (
                    <Pressable
                      onPress={toggleFlash}
                      style={styles.iconButton}
                      accessibilityLabel={flash === 'on' ? 'Wyłącz latarkę' : 'Włącz latarkę'}
                      hitSlop={15}>
                      <SFSymbol
                        name={flash === 'on' ? 'bolt.fill' : 'bolt.slash.fill'}
                        size={22}
                        tintColor={colors.cameraControlTint}
                      />
                    </Pressable>
                  ) : (
                    <View style={styles.topControlTrailingSpacer} />
                  )}
                  <Pressable
                    onPress={toggleRecordingMicMuted}
                    style={styles.iconButton}
                    accessibilityLabel={
                      recordAudioMuted ? 'Włącz nagrywanie dźwięku' : 'Wycisz nagrywanie dźwięku'
                    }
                    hitSlop={15}>
                    <SFSymbol
                      name={recordAudioMuted ? 'mic.slash.fill' : 'mic.fill'}
                      size={22}
                      tintColor={colors.cameraControlTint}
                    />
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <View style={styles.bottomControls}>
            <View style={styles.sideButtonContainer} />

            <View style={styles.shutterStack}>
              {captureError ? <Text style={styles.captureError}>{captureError}</Text> : null}
              <Pressable
                onPressIn={onShutterPressIn}
                onPressOut={onShutterPressOut}
                accessibilityLabel="Dotknij dla zdjęcia; przytrzymaj, aby nagrywać wideo, puść, aby zakończyć"
                accessibilityRole="button"
                accessibilityState={{ disabled: takingPicture || (!cameraReady && !recordingVideo) }}
                disabled={takingPicture || (!cameraReady && !recordingVideo)}
                hitSlop={15}>
                <Animated.View
                  style={[
                    styles.shutterOuter,
                    recordingVideo && styles.shutterRecording,
                    takingPicture && styles.shutterDisabled,
                    animatedShutterStyle,
                  ]}>
                  <View style={[styles.shutterInner, recordingVideo && styles.shutterInnerRecording]} />
                </Animated.View>
              </Pressable>
            </View>

            <View style={styles.sideButtonContainer}>
              <Pressable
                onPress={toggleFacing}
                style={styles.iconButton}
                accessibilityLabel="Zmień kamerę"
                hitSlop={15}
                disabled={recordingVideo}>
                <SFSymbol name="camera.rotate.fill" size={22} tintColor={colors.cameraControlTint} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    permissionContainer: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    permissionText: {
      color: colors.textPrimary,
      ...typography.callout,
      textAlign: 'center',
      marginBottom: 24,
      fontWeight: '500',
      letterSpacing: 0.2,
    },
    permissionHint: {
      color: colors.textSecondary,
      ...typography.footnote,
      textAlign: 'center',
      marginBottom: 20,
    },
    permissionButton: {
      backgroundColor: colors.buttonPrimaryBg,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 24,
    },
    permissionButtonText: {
      color: colors.buttonPrimaryText,
      ...typography.callout,
      fontWeight: '600',
    },
    camera: {
      flex: 1,
    },
    cameraOverlay: {
      ...StyleSheet.absoluteFill,
    },
    flashOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.background,
    },
    controlsContainer: {
      flex: 1,
      justifyContent: 'space-between',
    },
    recordingTimerTopLeft: {
      justifyContent: 'center',
      minHeight: 48,
    },
    recordingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 22,
      backgroundColor: colors.cameraControlBackground,
    },
    recordingDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#FF3B30',
    },
    recordingHudText: {
      ...typography.callout,
      fontVariant: ['tabular-nums'],
      color: colors.cameraControlTint,
      fontWeight: '700',
    },
    topControls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    topLeadingCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    topTrailingCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    topControlTrailingSpacer: {
      width: 48,
      height: 48,
    },
    bottomControls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    sideButtonContainer: {
      width: 60,
      alignItems: 'center',
    },
    iconButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.cameraControlBackground,
      justifyContent: 'center',
      alignItems: 'center',
    },
    shutterStack: {
      alignItems: 'center',
      gap: 10,
    },
    captureError: {
      ...typography.footnote,
      maxWidth: 220,
      color: colors.cameraControlTint,
      textAlign: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      borderCurve: 'continuous',
      backgroundColor: colors.cameraControlBackground,
      overflow: 'hidden',
    },
    shutterOuter: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 4,
      borderColor: colors.cameraControlTint,
      justifyContent: 'center',
      alignItems: 'center',
    },
    shutterRecording: {
      borderColor: '#FF3B30',
    },
    shutterInner: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: colors.cameraControlTint,
    },
    shutterInnerRecording: {
      borderRadius: 12,
      width: 44,
      height: 44,
      backgroundColor: '#FF3B30',
    },
    shutterDisabled: {
      opacity: 0.55,
    },
  });
