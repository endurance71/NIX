import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { tap, notify as hapticNotify } from '../../lib/haptics';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withSequence,
  withRepeat,
  cancelAnimation,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { SFSymbol } from '../../components/ui/sf-symbol';
import { VIDEO_HOLD_THRESHOLD_MS, VIDEO_TOTAL_MAX_DURATION_MS } from '../../lib/videoRecordingLimits';
import { useVideoDraft } from '../../context/VideoDraftContext';
import { nowMs, trackDuration, trackEvent } from '../../lib/telemetry';

const VIDEO_RECORDING_BITRATE = 2_500_000;
const VIDEO_RECORDING_MAX_FILE_SIZE_BYTES = 90 * 1024 * 1024;

export default function CameraScreen() {
  const safeStopRecording = useCallback(() => {
    if (!recordingStartedRef.current) return;
    try {
      cameraRef.current?.stopRecording();
    } catch (err) {
      if (Platform.OS === 'ios') {
        const message = err instanceof Error ? err.message : String(err ?? '');
        const simulatorUnsupported = message.toLowerCase().includes('simulator');
        if (simulatorUnsupported) return;
      }
      console.warn('stopRecording failed', err);
    }
  }, []);

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
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [zoom, setZoom] = useState(0);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [cameraInstanceKey, setCameraInstanceKey] = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const cameraReadyRef = useRef(false);
  const fingerDownRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingSessionRunningRef = useRef(false);
  const recordingStartedRef = useRef(false);
  const pressInTimeRef = useRef(0);
  const cameraMountStartedAtRef = useRef(nowMs());
  const zoomAtGestureStartRef = useRef(0);
  const isSwitchingCameraRef = useRef(false);
  const switchWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchRecoveryUsedRef = useRef(false);

  const shutterScale = useSharedValue(1);
  const recordingPulseScale = useSharedValue(1);
  const flashOpacity = useSharedValue(0);
  const recordingElapsedMs = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      setCameraActive(true);
      cameraMountStartedAtRef.current = nowMs();
      return () => {
        setCameraActive(false);
        safeStopRecording();
        if (switchWatchdogRef.current) {
          clearTimeout(switchWatchdogRef.current);
          switchWatchdogRef.current = null;
        }
        if (isSwitchingCameraRef.current) {
          isSwitchingCameraRef.current = false;
          switchRecoveryUsedRef.current = false;
          setIsSwitchingCamera(false);
        }
      };
    }, [safeStopRecording])
  );

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

  useAnimatedReaction(
    () => Math.floor(recordingElapsedMs.value / 1000),
    (sec, previousSec) => {
      if (sec !== previousSec) {
        runOnJS(setRecordingElapsedSec)(sec);
      }
    }
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          zoomAtGestureStartRef.current = zoom;
        })
        .onUpdate((event) => {
          const nextZoom = Math.max(0, Math.min(1, zoomAtGestureStartRef.current + (event.scale - 1) * 0.22));
          setZoom(nextZoom);
        }),
    [zoom]
  );

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
      if (switchWatchdogRef.current) {
        clearTimeout(switchWatchdogRef.current);
        switchWatchdogRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    cameraReadyRef.current = false;
    setCameraReady(false);
    cameraMountStartedAtRef.current = nowMs();
  }, [facing, cameraInstanceKey]);

  const waitForCameraReady = useCallback(async (timeoutMs = 5000) => {
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
    trackDuration('camera_ready_ms', cameraMountStartedAtRef.current, {
      facing,
      screen: 'camera',
    });

    if (switchWatchdogRef.current) {
      clearTimeout(switchWatchdogRef.current);
      switchWatchdogRef.current = null;
    }

    if (isSwitchingCameraRef.current) {
      trackEvent('camera_switch_ready', {
        facing,
        recovered: switchRecoveryUsedRef.current,
      });
      isSwitchingCameraRef.current = false;
      switchRecoveryUsedRef.current = false;
      setIsSwitchingCamera(false);
    }
  }, [facing]);

  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    if (micPermission?.granted) return true;
    const res = await requestMicPermission();
    return res.granted;
  }, [micPermission?.granted, requestMicPermission]);

  const runVideoCaptureSession = useCallback(async () => {
    setRecordingVideo(true);
    setRecordingElapsedSec(0);
    recordingElapsedMs.value = 0;
    recordingElapsedMs.value = withTiming(VIDEO_TOTAL_MAX_DURATION_MS, {
      duration: VIDEO_TOTAL_MAX_DURATION_MS,
      easing: Easing.linear,
    });
    setCaptureError(null);

    let result: { uri?: string } | undefined;
    let attemptedRecord = false;
    const sessionStartedAt = nowMs();
    try {
      recordingStartedRef.current = false;
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
        hapticNotify('error');
        setCaptureError('Kamera nie jest dostępna.');
        return;
      }

      const maxDurSec = Math.max(1, Math.ceil(VIDEO_TOTAL_MAX_DURATION_MS / 1000));
      attemptedRecord = true;
      const recordStartedAt = Date.now();
      try {
        recordingStartedRef.current = true;
        result = await cam.recordAsync({
          maxDuration: maxDurSec,
          maxFileSize: VIDEO_RECORDING_MAX_FILE_SIZE_BYTES,
          codec: 'avc1',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err ?? 'Unknown recordAsync error');
        const isExpectedInterruption =
          message.includes('An error occurred while recording a video') ||
          message.toLowerCase().includes('recording was stopped') ||
          message.toLowerCase().includes('no recording in progress');

        if (!isExpectedInterruption) {
          console.error('recordAsync nie powiodło się', err);
          trackEvent('video_record_ms', {
            status: 'failure',
            error_message: message,
          });
        }
      }

      const durationMs = Math.min(Date.now() - recordStartedAt, VIDEO_TOTAL_MAX_DURATION_MS);
      if (result?.uri) {
        trackDuration('video_record_ms', sessionStartedAt, {
          status: 'success',
          duration_recorded_ms: durationMs,
          codec: 'avc1',
          bitrate: VIDEO_RECORDING_BITRATE,
        });
        setSegments([{ uri: result.uri, durationMs }]);
        router.push({ pathname: '/preview', params: { mode: 'video' } });
      } else if (attemptedRecord) {
        hapticNotify('error');
        setCaptureError('Nie udało się zapisać nagrania. Spróbuj ponownie.');
      }
    } finally {
      recordingStartedRef.current = false;
      cancelAnimation(recordingElapsedMs);
      recordingElapsedMs.value = 0;
      setRecordingVideo(false);
      setRecordingElapsedSec(0);
    }
  }, [recordingElapsedMs, setSegments, waitForCameraReady]);

  const startVideoCaptureFlow = useCallback(async () => {
    if (recordingSessionRunningRef.current) return;
    if (!fingerDownRef.current) return;

    const micOk = await ensureMicPermission();
    if (!micOk) {
      hapticNotify('error');
      setCaptureError('NiX potrzebuje dostępu do mikrofonu, aby nagrywać wideo.');
      fingerDownRef.current = false;
      return;
    }
    if (!fingerDownRef.current) return;

    recordingSessionRunningRef.current = true;
    try {
      tap('medium');
      await runVideoCaptureSession();
    } finally {
      recordingSessionRunningRef.current = false;
    }
  }, [ensureMicPermission, runVideoCaptureSession]);

  const takePicture = async () => {
    if (takingPicture || recordingVideo || recordingSessionRunningRef.current) return;
    setTakingPicture(true);
    setCaptureError(null);
    tap('light');

    shutterScale.value = withSequence(
      withTiming(0.85, { duration: 100, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 100, easing: Easing.out(Easing.ease) })
    );

    flashOpacity.value = withSequence(
      withTiming(1, { duration: 50 }),
      withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) })
    );

    if (cameraRef.current) {
      const captureStartedAt = nowMs();
      try {
        const ready = await waitForCameraReady();
        if (!ready) {
          hapticNotify('error');
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
          trackDuration('photo_capture_ms', captureStartedAt, {
            status: 'success',
            width: photo.width,
            height: photo.height,
          });
          router.push({
            pathname: '/preview',
            params: { uri: photo.uri },
          });
        }
      } catch (err) {
        console.error('Nie udało się zrobić zdjęcia', err);
        trackDuration('photo_capture_ms', captureStartedAt, {
          status: 'failure',
          error_message: err instanceof Error ? err.message : 'Unknown capture error',
        });
        hapticNotify('error');
        setCaptureError('Nie udało się zrobić zdjęcia. Spróbuj ponownie.');
      } finally {
        setTakingPicture(false);
      }
    } else {
      hapticNotify('error');
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
      safeStopRecording();
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
    if (isSwitchingCameraRef.current) return;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    fingerDownRef.current = false;
    setZoom(0);
    zoomAtGestureStartRef.current = 0;

    isSwitchingCameraRef.current = true;
    switchRecoveryUsedRef.current = false;
    setIsSwitchingCamera(true);
    setCaptureError(null);

    const nextFacing = facing === 'back' ? 'front' : 'back';
    trackEvent('camera_switch_started', { from: facing, to: nextFacing });
    setFacing(nextFacing);

    if (switchWatchdogRef.current) {
      clearTimeout(switchWatchdogRef.current);
    }
    switchWatchdogRef.current = setTimeout(() => {
      switchWatchdogRef.current = null;
      if (!isSwitchingCameraRef.current) return;
      if (cameraReadyRef.current) return;

      trackEvent('camera_switch_timeout', {
        facing: nextFacing,
        recovery_attempted: !switchRecoveryUsedRef.current,
      });

      if (!switchRecoveryUsedRef.current) {
        switchRecoveryUsedRef.current = true;
        setCameraInstanceKey((k) => k + 1);

        switchWatchdogRef.current = setTimeout(() => {
          switchWatchdogRef.current = null;
          if (!isSwitchingCameraRef.current) return;
          if (cameraReadyRef.current) return;

          trackEvent('camera_switch_timeout', {
            facing: nextFacing,
            recovery_attempted: false,
          });
          isSwitchingCameraRef.current = false;
          switchRecoveryUsedRef.current = false;
          setIsSwitchingCamera(false);
          hapticNotify('error');
          setCaptureError('Nie udało się przełączyć kamery. Spróbuj ponownie.');
        }, 4000);
      } else {
        isSwitchingCameraRef.current = false;
        switchRecoveryUsedRef.current = false;
        setIsSwitchingCamera(false);
        hapticNotify('error');
        setCaptureError('Nie udało się przełączyć kamery. Spróbuj ponownie.');
      }
    }, 4000);
  };

  const toggleFlash = () => {
    if (recordingVideo) return;
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  };

  const toggleRecordingMicMuted = () => {
    if (recordingVideo || recordingSessionRunningRef.current) return;
    setRecordAudioMuted((m) => !m);
  };

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} hidden />
      <GestureDetector gesture={pinchGesture}>
        <CameraView
          key={`${facing}:${cameraInstanceKey}`}
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          mode="video"
          mute={recordAudioMuted}
          enableTorch={flash === 'on'}
          onCameraReady={onCameraReady}
          active={cameraActive}
          zoom={zoom}
          videoQuality="720p"
          videoBitrate={VIDEO_RECORDING_BITRATE}
          videoStabilizationMode="auto"
        />
      </GestureDetector>
      <View style={styles.cameraOverlay}>
        <Animated.View style={[styles.flashOverlay, animatedFlashStyle]} pointerEvents="none" />

        <View style={[styles.controlsContainer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.topControls}>
            {recordingVideo ? (
              <>
                <View style={styles.recordingTimerTopLeft} pointerEvents="none" accessibilityLiveRegion="polite">
                  <View style={styles.recordingPill}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingHudText} accessibilityLabel={`Nagrywanie ${recordingElapsedSec} sekund z ${VIDEO_TOTAL_MAX_DURATION_MS / 1000}`}>
                      {recordingElapsedSec}s / {VIDEO_TOTAL_MAX_DURATION_MS / 1000}s
                    </Text>
                  </View>
                </View>
                <View style={styles.topControlTrailingSpacer} />
              </>
            ) : (
              <>
                <View style={styles.topLeadingCluster}>
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
                </View>
              </>
            )}
          </View>

          <View style={styles.bottomControls}>
            <View style={styles.sideButtonContainer} />

            <View style={styles.shutterStack}>
              {isSwitchingCamera ? (
                <Text style={styles.captureHint}>Przełączanie kamery...</Text>
              ) : captureError ? (
                <Text style={styles.captureError}>{captureError}</Text>
              ) : null}
              <Pressable
                onPressIn={onShutterPressIn}
                onPressOut={onShutterPressOut}
                accessibilityLabel="Dotknij dla zdjęcia; przytrzymaj, aby nagrywać wideo, puść, aby zakończyć"
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    takingPicture || isSwitchingCamera || (!cameraReady && !recordingVideo),
                }}
                disabled={
                  takingPicture || isSwitchingCamera || (!cameraReady && !recordingVideo)
                }
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
                accessibilityState={{ disabled: recordingVideo || isSwitchingCamera }}
                hitSlop={15}
                disabled={recordingVideo || isSwitchingCamera}>
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
    captureHint: {
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
      opacity: 0.85,
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
