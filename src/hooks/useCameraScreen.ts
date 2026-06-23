import type { RefObject } from 'react';
import { useEffect, useMemo, useReducer, useRef, useCallback } from 'react';
import type { ViewStyle } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { tap, notify as hapticNotify } from '../lib/haptics';
import type { AnimatedStyle } from 'react-native-reanimated';
import {
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
import { Gesture } from 'react-native-gesture-handler';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from './useAppTheme';
import { VIDEO_HOLD_THRESHOLD_MS, VIDEO_TOTAL_MAX_DURATION_MS } from '../lib/videoRecordingLimits';
import { useVideoDraft } from '../context/VideoDraftContext';
import { nowMs, trackDuration, trackEvent } from '../lib/telemetry';
import { scheduleCameraSwitchWatchdog } from '../lib/cameraSwitchWatchdog';
import { cameraUiReducer, initialCameraUiState } from '../lib/cameraUiReducer';
import { createCameraStyles } from '../components/camera/cameraScreen.styles';

export const VIDEO_RECORDING_BITRATE = 2_500_000;
const VIDEO_RECORDING_MAX_FILE_SIZE_BYTES = 90 * 1024 * 1024;

export type CameraScreenViewModel = {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: ReturnType<typeof useCameraPermissions>[1];
  permissionGranted: boolean;
  permissionLoadingTimedOut: boolean;
  styles: ReturnType<typeof createCameraStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  statusBarStyle: ReturnType<typeof useAppTheme>['statusBarStyle'];
  insets: ReturnType<typeof useSafeAreaInsets>;
  facing: 'back' | 'front';
  flash: 'off' | 'on';
  recordAudioMuted: boolean;
  recordingVideo: boolean;
  recordingElapsedSec: number;
  cameraReady: boolean;
  cameraActive: boolean;
  zoom: number;
  isSwitchingCamera: boolean;
  cameraInstanceKey: number;
  takingPicture: boolean;
  captureError: string | null;
  isNativeSimulator: boolean;
  cameraRef: RefObject<CameraView | null>;
  pinchGesture: ReturnType<typeof Gesture.Pinch>;
  onCameraReady: () => void;
  animatedShutterStyle: AnimatedStyle<ViewStyle>;
  animatedFlashStyle: AnimatedStyle<ViewStyle>;
  pickFromGallery: () => Promise<void>;
  onShutterPressIn: () => void;
  onShutterPressOut: () => void;
  toggleFacing: () => void;
  toggleFlash: () => void;
  toggleRecordingMicMuted: () => void;
};

export function useCameraScreen(): CameraScreenViewModel {
  const isNativeSimulator = !Constants.isDevice;
  const { colors, statusBarStyle } = useAppTheme();
  const { setSegments } = useVideoDraft();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createCameraStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [cameraUi, dispatchCameraUi] = useReducer(cameraUiReducer, initialCameraUiState);
  const {
    facing,
    flash,
    recordAudioMuted,
    permissionLoadingTimedOut,
    takingPicture,
    captureError,
    recordingVideo,
    recordingElapsedSec,
    cameraReady,
    cameraActive,
    zoom,
    isSwitchingCamera,
    cameraInstanceKey,
  } = cameraUi;

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

  const safeStopRecording = useCallback(() => {
    if (!recordingStartedRef.current) return;
    try {
      cameraRef.current?.stopRecording();
    } catch (err) {
      if (process.env.EXPO_OS === 'ios') {
        const message = err instanceof Error ? err.message : String(err ?? '');
        const simulatorUnsupported = message.toLowerCase().includes('simulator');
        if (simulatorUnsupported) return;
      }
      console.warn('stopRecording failed', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      dispatchCameraUi({ type: 'SET_CAMERA_ACTIVE', cameraActive: true });
      cameraMountStartedAtRef.current = nowMs();
      return () => {
        dispatchCameraUi({ type: 'SET_CAMERA_ACTIVE', cameraActive: false });
        safeStopRecording();
        if (switchWatchdogRef.current) {
          clearTimeout(switchWatchdogRef.current);
          switchWatchdogRef.current = null;
        }
        if (isSwitchingCameraRef.current) {
          isSwitchingCameraRef.current = false;
          switchRecoveryUsedRef.current = false;
          dispatchCameraUi({ type: 'SET_SWITCHING_CAMERA', isSwitchingCamera: false });
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

  const animatedShutterStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ scale: shutterScale.value * recordingPulseScale.value }],
  }));

  const animatedFlashStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: flashOpacity.value,
  }));

  const pushRecordingElapsedSec = useCallback((sec: number) => {
    dispatchCameraUi({ type: 'SET_RECORDING_ELAPSED_SEC', recordingElapsedSec: sec });
  }, []);

  useAnimatedReaction(
    () => Math.floor(recordingElapsedMs.value / 1000),
    (sec, previousSec) => {
      if (sec !== previousSec) {
        runOnJS(pushRecordingElapsedSec)(sec);
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
          dispatchCameraUi({ type: 'SET_ZOOM', zoom: nextZoom });
        }),
    [zoom]
  );

  useEffect(() => {
    if (permission) return;

    const timer = setTimeout(() => {
      dispatchCameraUi({ type: 'PERMISSION_LOADING_TIMED_OUT' });
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
    dispatchCameraUi({ type: 'REMOUNT_CAMERA_PREVIEW' });
    cameraMountStartedAtRef.current = nowMs();
  }, [facing, cameraInstanceKey]);

  const waitForCameraReady = useCallback(async (timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    // Rekurencyjny polling zamiast while+await — ten sam semantycznie, bez ostrzeżenia react-doctor.
    const poll = async (): Promise<boolean> => {
      if (Date.now() >= deadline) return false;
      if (cameraReadyRef.current && cameraRef.current != null) return true;
      await new Promise((r) => setTimeout(r, 40));
      return poll();
    };
    return poll();
  }, []);

  const onCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
    const clearSwitchingUi = isSwitchingCameraRef.current;
    dispatchCameraUi({ type: 'ON_CAMERA_READY', clearSwitchingUi });
    trackDuration('camera_ready_ms', cameraMountStartedAtRef.current, {
      facing,
      screen: 'camera',
    });

    if (switchWatchdogRef.current) {
      clearTimeout(switchWatchdogRef.current);
      switchWatchdogRef.current = null;
    }

    if (clearSwitchingUi) {
      trackEvent('camera_switch_ready', {
        facing,
        recovered: switchRecoveryUsedRef.current,
      });
      isSwitchingCameraRef.current = false;
      switchRecoveryUsedRef.current = false;
    }
  }, [facing]);

  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    if (micPermission?.granted) return true;
    const res = await requestMicPermission();
    return res.granted;
  }, [micPermission?.granted, requestMicPermission]);

  const runVideoCaptureSession = useCallback(async () => {
    dispatchCameraUi({ type: 'VIDEO_SESSION_BEGIN' });
    recordingElapsedMs.value = 0;
    recordingElapsedMs.value = withTiming(VIDEO_TOTAL_MAX_DURATION_MS, {
      duration: VIDEO_TOTAL_MAX_DURATION_MS,
      easing: Easing.linear,
    });
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
        dispatchCameraUi({ type: 'SET_CAPTURE_ERROR', captureError: 'Kamera nie jest dostępna.' });
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
        dispatchCameraUi({
          type: 'SET_CAPTURE_ERROR',
          captureError: 'Nie udało się zapisać nagrania. Spróbuj ponownie.',
        });
      }
    } finally {
      recordingStartedRef.current = false;
      cancelAnimation(recordingElapsedMs);
      recordingElapsedMs.value = 0;
      dispatchCameraUi({ type: 'VIDEO_SESSION_END' });
    }
  }, [recordingElapsedMs, setSegments, waitForCameraReady]);

  const startVideoCaptureFlow = useCallback(async () => {
    if (recordingSessionRunningRef.current) return;
    if (!fingerDownRef.current) return;

    const micOk = await ensureMicPermission();
    if (!micOk) {
      hapticNotify('error');
      dispatchCameraUi({
        type: 'SET_CAPTURE_ERROR',
        captureError: 'NiX potrzebuje dostępu do mikrofonu, aby nagrywać wideo.',
      });
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
    dispatchCameraUi({ type: 'PREPARE_STILL_CAPTURE' });
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
          if (isNativeSimulator) {
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.8,
              });
              if (!result.canceled) {
                const selected = result.assets[0];
                router.push({
                  pathname: '/preview',
                  params: { uri: selected.uri },
                });
              }
            } catch (err) {
              console.error('Symulator iOS: wybór zdjęcia z biblioteki nie powiódł się', err);
              hapticNotify('error');
              dispatchCameraUi({
                type: 'SET_CAPTURE_ERROR',
                captureError: 'Nie udało się wybrać zdjęcia z biblioteki.',
              });
            }
          } else {
            hapticNotify('error');
            dispatchCameraUi({
              type: 'SET_CAPTURE_ERROR',
              captureError: 'Kamera nie jest jeszcze gotowa. Spróbuj ponownie.',
            });
          }
          dispatchCameraUi({ type: 'SET_TAKING_PICTURE', takingPicture: false });
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
        dispatchCameraUi({
          type: 'SET_CAPTURE_ERROR',
          captureError: 'Nie udało się zrobić zdjęcia. Spróbuj ponownie.',
        });
      } finally {
        dispatchCameraUi({ type: 'SET_TAKING_PICTURE', takingPicture: false });
      }
    } else {
      hapticNotify('error');
      dispatchCameraUi({
        type: 'SET_CAPTURE_ERROR',
        captureError: 'Kamera nie jest jeszcze gotowa.',
      });
      dispatchCameraUi({ type: 'SET_TAKING_PICTURE', takingPicture: false });
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

  const pickFromGallery = useCallback(async () => {
    if (recordingVideo || takingPicture || isSwitchingCamera) return;
    if (recordingSessionRunningRef.current) return;
    tap('light');
    dispatchCameraUi({ type: 'SET_CAPTURE_ERROR', captureError: null });

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        hapticNotify('error');
        dispatchCameraUi({
          type: 'SET_CAPTURE_ERROR',
          captureError: 'NiX potrzebuje dostępu do biblioteki, aby wybierać zdjęcia i filmy.',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.8,
        selectionLimit: 1,
        videoMaxDuration: Math.ceil(VIDEO_TOTAL_MAX_DURATION_MS / 1000),
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri) {
        hapticNotify('error');
        dispatchCameraUi({
          type: 'SET_CAPTURE_ERROR',
          captureError: 'Nie udało się wczytać wybranego pliku.',
        });
        return;
      }

      trackEvent('camera_gallery_pick', { type: asset.type ?? 'unknown' });

      if (asset.type === 'video') {
        const durationMs = Math.min(asset.duration ?? 0, VIDEO_TOTAL_MAX_DURATION_MS);
        setSegments([{ uri: asset.uri, durationMs }]);
        router.push({ pathname: '/preview', params: { mode: 'video' } });
      } else {
        router.push({
          pathname: '/preview',
          params: { uri: asset.uri },
        });
      }
    } catch (err) {
      console.error('Wybór z galerii nie powiódł się', err);
      hapticNotify('error');
      dispatchCameraUi({
        type: 'SET_CAPTURE_ERROR',
        captureError: 'Nie udało się otworzyć galerii. Spróbuj ponownie.',
      });
    }
  }, [recordingVideo, takingPicture, isSwitchingCamera, setSegments]);

  const toggleFacing = () => {
    if (recordingVideo) return;
    if (isSwitchingCameraRef.current) return;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    fingerDownRef.current = false;
    zoomAtGestureStartRef.current = 0;

    isSwitchingCameraRef.current = true;
    switchRecoveryUsedRef.current = false;

    const nextFacing = facing === 'back' ? 'front' : 'back';
    trackEvent('camera_switch_started', { from: facing, to: nextFacing });
    dispatchCameraUi({ type: 'START_CAMERA_SWITCH', nextFacing });

    scheduleCameraSwitchWatchdog({
      nextFacing,
      isSwitchingCameraRef,
      cameraReadyRef,
      switchRecoveryUsedRef,
      switchWatchdogRef,
      setCameraInstanceKey: (updater) =>
        dispatchCameraUi({ type: 'UPDATE_CAMERA_INSTANCE_KEY', updater }),
      setIsSwitchingCamera: (value) =>
        dispatchCameraUi({ type: 'SET_SWITCHING_CAMERA', isSwitchingCamera: value }),
      onSwitchTimeout: ({ facing: timeoutFacing, recoveryAttempted }) => {
        trackEvent('camera_switch_timeout', {
          facing: timeoutFacing,
          recovery_attempted: recoveryAttempted,
        });
      },
      onSwitchFailure: () => {
        hapticNotify('error');
        dispatchCameraUi({
          type: 'SET_CAPTURE_ERROR',
          captureError: 'Nie udało się przełączyć kamery. Spróbuj ponownie.',
        });
      },
    });
  };

  const toggleFlash = () => {
    if (recordingVideo) return;
    dispatchCameraUi({ type: 'TOGGLE_FLASH' });
  };

  const toggleRecordingMicMuted = () => {
    if (recordingVideo || recordingSessionRunningRef.current) return;
    dispatchCameraUi({ type: 'TOGGLE_RECORD_AUDIO_MUTED' });
  };

  const permissionGranted = Boolean(permission?.granted);

  return {
    permission,
    requestPermission,
    permissionGranted,
    permissionLoadingTimedOut,
    styles,
    colors,
    statusBarStyle,
    insets,
    facing,
    flash,
    recordAudioMuted,
    recordingVideo,
    recordingElapsedSec,
    cameraReady,
    cameraActive,
    zoom,
    isSwitchingCamera,
    cameraInstanceKey,
    takingPicture,
    captureError,
    isNativeSimulator,
    cameraRef,
    pinchGesture,
    onCameraReady,
    animatedShutterStyle,
    animatedFlashStyle,
    pickFromGallery,
    onShutterPressIn,
    onShutterPressOut,
    toggleFacing,
    toggleFlash,
    toggleRecordingMicMuted,
  };
}
