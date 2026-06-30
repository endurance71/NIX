import { useCallback, useEffect, useReducer, useRef, type RefObject } from 'react';
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
import { useScreenInsets, type ScreenInsetsResult } from './useScreenInsets';
import { useAppTheme } from './useAppTheme';
import { VIDEO_HOLD_THRESHOLD_MS, VIDEO_TOTAL_MAX_DURATION_MS } from '../lib/videoRecordingLimits';
import { useVideoDraft } from '../context/VideoDraftContext';
import { nowMs, trackDuration, trackEvent } from '../lib/telemetry';
import { scheduleCameraSwitchWatchdog } from '../lib/cameraSwitchWatchdog';
import { configureForRecording } from '../lib/audioSession';
import { runWithFinally } from '../lib/runWithFinally';
import { cameraUiReducer, initialCameraUiState, type CameraUiState } from '../lib/cameraUiReducer';
import { createCameraStyles } from '../components/camera/cameraScreen.styles';
import { setNativeVideoTorchForRecording } from '../lib/videoTorchSession';

export const VIDEO_RECORDING_BITRATE = 2_500_000;
const VIDEO_RECORDING_MAX_FILE_SIZE_BYTES = 90 * 1024 * 1024;
const STILL_FLASH_ARM_DELAY_MS = 80;
const VIDEO_TORCH_PROP_COMMIT_DELAY_MS = 50;

export type CameraScreenViewModel = {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: ReturnType<typeof useCameraPermissions>[1];
  permissionGranted: boolean;
  permissionLoadingTimedOut: boolean;
  styles: ReturnType<typeof createCameraStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  statusBarStyle: ReturnType<typeof useAppTheme>['statusBarStyle'];
  insets: ScreenInsetsResult;
  facing: 'back' | 'front';
  flash: 'off' | 'on';
  stillFlashArmed: boolean;
  videoTorchRequested: boolean;
  recordAudioMuted: boolean;
  videoPreparing: boolean;
  recordingVideo: boolean;
  recordingElapsedSec: number;
  cameraReady: boolean;
  cameraActive: boolean;
  zoom: number;
  isSwitchingCamera: boolean;
  cameraInstanceKey: number;
  captureMode: 'picture' | 'video';
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
  const remountCameraOnModeChange = process.env.EXPO_OS !== 'ios';
  const { colors, statusBarStyle } = useAppTheme();
  const { setSegments } = useVideoDraft();
  const insets = useScreenInsets('cameraTab');
  const styles = createCameraStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [cameraUi, dispatchCameraUi] = useReducer(cameraUiReducer, initialCameraUiState);
  const {
    facing,
    flash,
    stillFlashArmed,
    videoTorchRequested,
    recordAudioMuted,
    permissionLoadingTimedOut,
    takingPicture,
    captureError,
    videoPreparing,
    recordingVideo,
    recordingElapsedSec,
    cameraReady,
    cameraActive,
    zoom,
    isSwitchingCamera,
    cameraInstanceKey,
    captureMode,
  } = cameraUi;

  const cameraRef = useRef<CameraView>(null);
  const cameraUiRef = useRef(cameraUi);
  const cameraReadyRef = useRef(false);
  const fingerDownRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingSessionRunningRef = useRef(false);
  const recordingStartedRef = useRef(false);
  const videoTorchSessionIdRef = useRef(0);
  const videoTorchSessionStartedAtRef = useRef<number | null>(null);
  const pressInTimeRef = useRef(0);
  const cameraMountStartedAtRef = useRef<number | null>(null);
  const zoomAtGestureStart = useSharedValue(0);
  const zoomShared = useSharedValue(0);
  const isSwitchingCameraRef = useRef(false);
  const switchWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchRecoveryUsedRef = useRef(false);

  const shutterScale = useSharedValue(1);
  const recordingPulseScale = useSharedValue(1);
  const flashOpacity = useSharedValue(0);
  const recordingElapsedMs = useSharedValue(0);

  const safeStopRecording = () => {
    if (!recordingStartedRef.current) {
      logVideoTorchEvent('stop-recording-skip-not-started');
      return;
    }
    logVideoTorchEvent('stop-recording-call');
    try {
      cameraRef.current?.stopRecording();
      logVideoTorchEvent('stop-recording-return');
    } catch (err) {
      if (process.env.EXPO_OS === 'ios') {
        const message = err instanceof Error ? err.message : String(err ?? '');
        const simulatorUnsupported = message.toLowerCase().includes('simulator');
        logVideoTorchEvent('stop-recording-catch', {}, { message, simulatorUnsupported });
        if (simulatorUnsupported) return;
      }
      console.warn('stopRecording failed', err);
    }
  };

  useEffect(() => {
    cameraUiRef.current = cameraUi;
  }, [cameraUi]);

  const logVideoTorchEvent = (
    event: string,
    overrides: Partial<CameraUiState> = {},
    details: Record<string, unknown> = {}
  ) => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    const snapshot = { ...cameraUiRef.current, ...overrides };
    const sessionStartedAt = videoTorchSessionStartedAtRef.current;
    const now = Date.now();
    console.info('[CameraVideoTorch]', {
      event,
      sessionId: videoTorchSessionIdRef.current,
      tMs: sessionStartedAt == null ? null : now - sessionStartedAt,
      wallTimeMs: now,
      facing: snapshot.facing,
      flash: snapshot.flash,
      captureMode: snapshot.captureMode,
      videoTorchRequested: snapshot.videoTorchRequested,
      videoPreparing: snapshot.videoPreparing,
      recordingVideo: snapshot.recordingVideo,
      cameraReady: snapshot.cameraReady,
      cameraActive: snapshot.cameraActive,
      stillFlashArmed: snapshot.stillFlashArmed,
      fingerDown: fingerDownRef.current,
      recordingSessionRunning: recordingSessionRunningRef.current,
      recordingStarted: recordingStartedRef.current,
      expectedNativePatchLog: '[ExpoCameraTorch]',
      ...details,
    });
  };

  const disableNativeVideoTorch = () => {
    logVideoTorchEvent('cleanup-disable');
    void setNativeVideoTorchForRecording({ facing: 'back', flash: 'on' }, false);
  };

  useFocusEffect(
    useCallback(() => {
      dispatchCameraUi({ type: 'SET_CAMERA_ACTIVE', cameraActive: true });
      cameraMountStartedAtRef.current = nowMs();
      logVideoTorchEvent('screen-focus-active');
      return () => {
        logVideoTorchEvent('screen-blur-cleanup');
        dispatchCameraUi({ type: 'SET_CAMERA_ACTIVE', cameraActive: false });
        safeStopRecording();
        disableNativeVideoTorch();
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
    }, [])
  );

  useEffect(() => {
    if (!recordingVideo) {
      cancelAnimation(recordingPulseScale);
      recordingPulseScale.set(1);
      return;
    }
    recordingPulseScale.set(
      withRepeat(
        withSequence(
          withTiming(1.1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
  }, [recordingVideo, recordingPulseScale]);

  const animatedShutterStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ scale: shutterScale.get() * recordingPulseScale.get() }],
  }));

  const animatedFlashStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: flashOpacity.get(),
  }));

  const pushRecordingElapsedSec = (sec: number) => {
    dispatchCameraUi({ type: 'SET_RECORDING_ELAPSED_SEC', recordingElapsedSec: sec });
  };

  useAnimatedReaction(
    () => Math.floor(recordingElapsedMs.get() / 1000),
    (sec, previousSec) => {
      if (sec !== previousSec) {
        runOnJS(pushRecordingElapsedSec)(sec);
      }
    }
  );

  useEffect(() => {
    zoomShared.set(zoom);
  }, [zoom, zoomShared]);

  const setZoomFromGesture = (nextZoom: number) => {
    dispatchCameraUi({ type: 'SET_ZOOM', zoom: nextZoom });
  };

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      zoomAtGestureStart.set(zoomShared.get());
    })
    .onUpdate((event) => {
      const nextZoom = Math.max(0, Math.min(1, zoomAtGestureStart.get() + (event.scale - 1) * 0.22));
      runOnJS(setZoomFromGesture)(nextZoom);
    });

  useEffect(() => {
    if (permission) return;

    const timer = setTimeout(() => {
      dispatchCameraUi({ type: 'PERMISSION_LOADING_TIMED_OUT' });
    }, 2500);

    return () => clearTimeout(timer);
  }, [permission]);

  useEffect(() => {
    const holdTimer = holdTimerRef;
    const switchWatchdog = switchWatchdogRef;
    return () => {
      const holdId = holdTimer.current;
      if (holdId) {
        clearTimeout(holdId);
      }
      const watchdogId = switchWatchdog.current;
      if (watchdogId) {
        clearTimeout(watchdogId);
        switchWatchdog.current = null;
      }
    };
  }, []);

  useEffect(() => {
    cameraReadyRef.current = false;
    logVideoTorchEvent('camera-remount-request', {}, { facing, cameraInstanceKey });
    dispatchCameraUi({ type: 'REMOUNT_CAMERA_PREVIEW' });
    cameraMountStartedAtRef.current = nowMs();
    // captureMode jest obsługiwany jawnie przy start/stop wideo, bo zmiana trybu
    // remountuje CameraView przez jego key.
  }, [facing, cameraInstanceKey]);

  const waitForCameraReady = async (timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    logVideoTorchEvent('wait-camera-ready-begin', {}, { timeoutMs });
    // Rekurencyjny polling zamiast while+await — ten sam semantycznie, bez ostrzeżenia react-doctor.
    const poll = async (): Promise<boolean> => {
      if (Date.now() >= deadline) {
        logVideoTorchEvent('wait-camera-ready-timeout', {}, {
          hasCameraRef: Boolean(cameraRef.current),
          cameraReadyRef: cameraReadyRef.current,
        });
        return false;
      }
      if (cameraReadyRef.current && cameraRef.current != null) {
        logVideoTorchEvent('wait-camera-ready-resolved', {}, {
          hasCameraRef: true,
          cameraReadyRef: true,
        });
        return true;
      }
      await new Promise((r) => setTimeout(r, 40));
      return poll();
    };
    return poll();
  };

  const onCameraReady = () => {
    cameraReadyRef.current = true;
    const clearSwitchingUi = isSwitchingCameraRef.current;
    logVideoTorchEvent('on-camera-ready', {}, { clearSwitchingUi });
    dispatchCameraUi({ type: 'ON_CAMERA_READY', clearSwitchingUi });
    trackDuration('camera_ready_ms', cameraMountStartedAtRef.current ?? nowMs(), {
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
  };

  const ensureMicPermission = async (): Promise<boolean> => {
    if (micPermission?.granted) return true;
    const res = await requestMicPermission();
    return res.granted;
  };

  const waitForVideoTorchPropsCommit = async () => {
    logVideoTorchEvent('torch-props-commit-wait-begin', {}, { delayMs: VIDEO_TORCH_PROP_COMMIT_DELAY_MS });
    await new Promise((resolve) => setTimeout(resolve, VIDEO_TORCH_PROP_COMMIT_DELAY_MS));
    logVideoTorchEvent('torch-props-commit-wait-end');
  };

  const runVideoCaptureSession = async () => {
    const torchRequestedForSession = flash === 'on' && facing === 'back';
    videoTorchSessionIdRef.current += 1;
    videoTorchSessionStartedAtRef.current = Date.now();
    if (remountCameraOnModeChange) {
      cameraReadyRef.current = false;
    }
    cameraMountStartedAtRef.current = nowMs();
    logVideoTorchEvent('video-session-start', {}, { torchRequestedForSession });
    dispatchCameraUi({ type: 'VIDEO_PREPARE_BEGIN', resetCameraReady: remountCameraOnModeChange });
    logVideoTorchEvent('video-prepare-begin', {
      facing,
      flash,
      captureMode: 'video',
      videoTorchRequested: torchRequestedForSession,
      videoPreparing: true,
      recordingVideo: false,
    });

    await runWithFinally(
      async () => {
        let result: { uri?: string } | undefined;
        let attemptedRecord = false;
        const sessionStartedAt = nowMs();
        recordingStartedRef.current = false;
        const ready = await waitForCameraReady(5000);
        logVideoTorchEvent('wait-camera-ready-end', {}, { ready });
        if (!ready) {
          console.error('recordAsync: przekroczono oczekiwanie na onCameraReady');
          trackEvent('video_record_ms', {
            status: 'failure',
            phase: 'camera_ready_timeout',
          });
          hapticNotify('error');
          dispatchCameraUi({
            type: 'SET_CAPTURE_ERROR',
            captureError: 'Kamera nie zdążyła przygotować nagrywania. Spróbuj ponownie.',
          });
          return;
        }
        if (!fingerDownRef.current) {
          return;
        }

        const cam = cameraRef.current;
        logVideoTorchEvent('camera-ref-read', {}, { hasCameraRef: Boolean(cam) });
        if (!cam) {
          hapticNotify('error');
          dispatchCameraUi({ type: 'SET_CAPTURE_ERROR', captureError: 'Kamera nie jest dostępna.' });
          return;
        }

        const maxDurSec = Math.max(1, Math.ceil(VIDEO_TOTAL_MAX_DURATION_MS / 1000));
        attemptedRecord = true;
        const recordStartedAt = Date.now();
        try {
          dispatchCameraUi({ type: 'VIDEO_RECORDING_BEGIN' });
          logVideoTorchEvent('video-recording-begin', {
            facing,
            flash,
            captureMode: 'video',
            videoTorchRequested: torchRequestedForSession,
            videoPreparing: false,
            recordingVideo: true,
          });
          if (!fingerDownRef.current) {
            return;
          }
          if (torchRequestedForSession) {
            await waitForVideoTorchPropsCommit();
            if (!fingerDownRef.current) {
              return;
            }
          }
          recordingStartedRef.current = true;
          recordingElapsedMs.set(0);
          recordingElapsedMs.set(
            withTiming(VIDEO_TOTAL_MAX_DURATION_MS, {
              duration: VIDEO_TOTAL_MAX_DURATION_MS,
              easing: Easing.linear,
            })
          );
          logVideoTorchEvent('before-recordAsync', {
            facing,
            flash,
            captureMode: 'video',
            videoTorchRequested: torchRequestedForSession,
            videoPreparing: false,
            recordingVideo: true,
          }, { maxDurSec });
          result = await cam.recordAsync({
            maxDuration: maxDurSec,
            maxFileSize: VIDEO_RECORDING_MAX_FILE_SIZE_BYTES,
            codec: 'avc1',
          });
          logVideoTorchEvent('after-recordAsync-resolved', {}, { hasUri: Boolean(result?.uri) });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err ?? 'Unknown recordAsync error');
          logVideoTorchEvent('recordAsync-catch', {}, { message });
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
          logVideoTorchEvent('record-result-success', {}, { durationMs });
          trackDuration('video_record_ms', sessionStartedAt, {
            status: 'success',
            duration_recorded_ms: durationMs,
            codec: 'avc1',
            bitrate: VIDEO_RECORDING_BITRATE,
          });
          setSegments([{ uri: result.uri, durationMs }]);
          router.push({
            pathname: '/preview',
            params: {
              mode: 'video',
              uri: result.uri,
              durationMs: String(durationMs),
            },
          });
        } else if (attemptedRecord) {
          logVideoTorchEvent('record-result-empty', {}, { attemptedRecord });
          hapticNotify('error');
          dispatchCameraUi({
            type: 'SET_CAPTURE_ERROR',
            captureError: 'Nie udało się zapisać nagrania. Spróbuj ponownie.',
          });
        }
      },
      () => {
        recordingStartedRef.current = false;
        cancelAnimation(recordingElapsedMs);
        recordingElapsedMs.set(0);
        if (remountCameraOnModeChange) {
          cameraReadyRef.current = false;
        }
        disableNativeVideoTorch();
        logVideoTorchEvent('video-session-end-dispatch');
        dispatchCameraUi({ type: 'VIDEO_SESSION_END', resetCameraReady: remountCameraOnModeChange });
      }
    );
  };

  const startVideoCaptureFlow = async () => {
    logVideoTorchEvent('start-video-flow-enter');
    if (recordingSessionRunningRef.current) {
      logVideoTorchEvent('start-video-flow-skip-running');
      return;
    }
    if (!fingerDownRef.current) {
      logVideoTorchEvent('start-video-flow-skip-finger-up');
      return;
    }

    if (!recordAudioMuted) {
      logVideoTorchEvent('mic-permission-check-begin', {}, { alreadyGranted: Boolean(micPermission?.granted) });
      const micOk = await ensureMicPermission();
      logVideoTorchEvent('mic-permission-check-end', {}, { micOk });
      if (!micOk) {
        hapticNotify('error');
        dispatchCameraUi({
          type: 'SET_CAPTURE_ERROR',
          captureError: 'NiX potrzebuje dostępu do mikrofonu, aby nagrywać wideo z dźwiękiem.',
        });
        fingerDownRef.current = false;
        return;
      }
    }
    if (!fingerDownRef.current) {
      logVideoTorchEvent('start-video-flow-abort-after-mic');
      return;
    }

    try {
      logVideoTorchEvent('audio-session-recording-begin');
      await configureForRecording();
      logVideoTorchEvent('audio-session-recording-success');
    } catch (error) {
      logVideoTorchEvent('audio-session-recording-failure', {}, {
        message: error instanceof Error ? error.message : String(error ?? 'Unknown audio session error'),
      });
      hapticNotify('error');
      trackEvent('video_record_ms', {
        status: 'failure',
        phase: 'audio_session',
        error_message: error instanceof Error ? error.message : 'Unknown audio session error',
      });
      dispatchCameraUi({
        type: 'SET_CAPTURE_ERROR',
        captureError: 'Nie udało się przygotować dźwięku do nagrywania. Spróbuj ponownie.',
      });
      fingerDownRef.current = false;
      return;
    }
    if (!fingerDownRef.current) {
      logVideoTorchEvent('start-video-flow-abort-after-audio');
      return;
    }
    recordingSessionRunningRef.current = true;
    logVideoTorchEvent('recording-session-running-true');
    await runWithFinally(
      async () => {
        tap('medium');
        await runVideoCaptureSession();
      },
      () => {
        logVideoTorchEvent('recording-session-running-false');
        recordingSessionRunningRef.current = false;
      }
    );
  };

  const takePicture = async () => {
    logVideoTorchEvent('take-picture-enter');
    if (takingPicture || videoPreparing || recordingVideo || recordingSessionRunningRef.current || isSwitchingCamera) {
      logVideoTorchEvent('take-picture-skip-busy', {}, {
        takingPicture,
        videoPreparing,
        recordingVideo,
        recordingSessionRunning: recordingSessionRunningRef.current,
        isSwitchingCamera,
      });
      return;
    }
    const shouldWaitForStillFlash = flash === 'on';
    logVideoTorchEvent('take-picture-prepare', {}, { shouldWaitForStillFlash });
    dispatchCameraUi({ type: 'PREPARE_STILL_CAPTURE' });
    tap('light');

    shutterScale.set(
      withSequence(
        withTiming(0.85, { duration: 100, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 100, easing: Easing.out(Easing.ease) })
      )
    );

    flashOpacity.set(
      withSequence(
        withTiming(1, { duration: 50 }),
        withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) })
      )
    );

    if (cameraRef.current) {
      const camera = cameraRef.current;
      const captureStartedAt = nowMs();
      await runWithFinally(
        async () => {
          try {
            if (captureMode !== 'picture') {
              if (remountCameraOnModeChange) {
                cameraReadyRef.current = false;
              }
              dispatchCameraUi({ type: 'SET_CAPTURE_MODE', captureMode: 'picture', resetCameraReady: remountCameraOnModeChange });
              const modeReady = await waitForCameraReady(8000);
              if (!modeReady) {
                hapticNotify('error');
                dispatchCameraUi({
                  type: 'SET_CAPTURE_ERROR',
                  captureError: 'Kamera nie jest jeszcze gotowa. Spróbuj ponownie.',
                });
                return;
              }
            }

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
              return;
            }
            if (shouldWaitForStillFlash) {
              logVideoTorchEvent('still-flash-arm-delay-begin', {}, { delayMs: STILL_FLASH_ARM_DELAY_MS });
              await new Promise((resolve) => setTimeout(resolve, STILL_FLASH_ARM_DELAY_MS));
              logVideoTorchEvent('still-flash-arm-delay-end');
            }
            logVideoTorchEvent('before-takePictureAsync');
            const photo = await camera.takePictureAsync({
              quality: 0.8,
              base64: false,
              skipProcessing: false,
            });
            logVideoTorchEvent('after-takePictureAsync', {}, { hasPhoto: Boolean(photo) });

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
          }
        },
        () => dispatchCameraUi({ type: 'SET_TAKING_PICTURE', takingPicture: false })
      );
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
    logVideoTorchEvent('shutter-press-in');
    if (takingPicture || recordingSessionRunningRef.current) {
      logVideoTorchEvent('shutter-press-in-skip-busy', {}, {
        takingPicture,
        recordingSessionRunning: recordingSessionRunningRef.current,
      });
      return;
    }
    pressInTimeRef.current = Date.now();
    fingerDownRef.current = true;
    logVideoTorchEvent('shutter-press-in-armed', {}, { holdThresholdMs: VIDEO_HOLD_THRESHOLD_MS });

    holdTimerRef.current = setTimeout(() => {
      logVideoTorchEvent('hold-threshold-fired', {}, {
        elapsedMs: Date.now() - pressInTimeRef.current,
      });
      if (!fingerDownRef.current) {
        logVideoTorchEvent('hold-threshold-skip-finger-up');
        return;
      }
      holdTimerRef.current = null;
      void startVideoCaptureFlow();
    }, VIDEO_HOLD_THRESHOLD_MS);
  };

  const onShutterPressOut = () => {
    logVideoTorchEvent('shutter-press-out', {}, {
      elapsedMs: Date.now() - pressInTimeRef.current,
      hasHoldTimer: Boolean(holdTimerRef.current),
    });
    fingerDownRef.current = false;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      const elapsed = Date.now() - pressInTimeRef.current;
      if (elapsed < VIDEO_HOLD_THRESHOLD_MS && !recordingSessionRunningRef.current) {
        logVideoTorchEvent('shutter-release-photo-path', {}, { elapsedMs: elapsed });
        void takePicture();
      } else {
        logVideoTorchEvent('shutter-release-cancel-video-before-start', {}, { elapsedMs: elapsed });
        disableNativeVideoTorch();
        dispatchCameraUi({ type: 'CLEAR_VIDEO_TORCH' });
      }
      return;
    }

    if (recordingSessionRunningRef.current) {
      logVideoTorchEvent('shutter-release-stop-video');
      safeStopRecording();
    } else {
      logVideoTorchEvent('shutter-release-cleanup-idle');
      disableNativeVideoTorch();
      dispatchCameraUi({ type: 'CLEAR_VIDEO_TORCH' });
    }
  };

  const pickFromGallery = async () => {
    if (videoPreparing || recordingVideo || takingPicture || isSwitchingCamera) return;
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
  };

  const toggleFacing = () => {
    logVideoTorchEvent('toggle-facing-press');
    if (videoPreparing || recordingVideo) {
      logVideoTorchEvent('toggle-facing-skip-recording');
      return;
    }
    if (isSwitchingCameraRef.current) {
      logVideoTorchEvent('toggle-facing-skip-switching');
      return;
    }

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    fingerDownRef.current = false;
    disableNativeVideoTorch();
    zoomAtGestureStart.set(0);

    isSwitchingCameraRef.current = true;
    switchRecoveryUsedRef.current = false;

    const nextFacing = facing === 'back' ? 'front' : 'back';
    logVideoTorchEvent('toggle-facing-start', {}, { nextFacing });
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
    logVideoTorchEvent('toggle-flash-press');
    if (videoPreparing || recordingVideo) {
      logVideoTorchEvent('toggle-flash-skip-recording');
      return;
    }
    logVideoTorchEvent('toggle-flash-dispatch', {}, { nextFlash: flash === 'on' ? 'off' : 'on' });
    dispatchCameraUi({ type: 'TOGGLE_FLASH' });
  };

  const toggleRecordingMicMuted = () => {
    if (videoPreparing || recordingVideo || recordingSessionRunningRef.current) return;
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
    stillFlashArmed,
    videoTorchRequested,
    recordAudioMuted,
    videoPreparing,
    recordingVideo,
    recordingElapsedSec,
    cameraReady,
    cameraActive,
    zoom,
    isSwitchingCamera,
    cameraInstanceKey,
    captureMode,
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
