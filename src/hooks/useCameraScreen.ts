import { performCameraPermissionRequest } from '../lib/cameraPermissions';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import type { LayoutChangeEvent, View, ViewStyle } from 'react-native';
import { AccessibilityInfo, Alert, AppState, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CameraView,
  PermissionStatus,
  useCameraPermissions,
  useMicrophonePermissions,
  type AvailableLenses,
  type CameraOrientation,
  type ResponsiveOrientationChanged,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { tap, notify as hapticNotify, selection as hapticSelection } from '../lib/haptics';
import type { AnimatedStyle, SharedValue } from 'react-native-reanimated';
import {
  ReduceMotion,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  withSequence,
  cancelAnimation,
  useAnimatedReaction,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture } from 'react-native-gesture-handler';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useScreenInsets, type ScreenInsetsResult } from './useScreenInsets';
import { useAppTheme } from './useAppTheme';
import { VIDEO_HOLD_THRESHOLD_MS, VIDEO_TOTAL_MAX_DURATION_MS } from '../lib/videoRecordingLimits';
import { useVideoDraft } from '../context/videoDraft';
import { usePhotoDraft } from '../context/photoDraft';
import { nowMs, trackDuration, trackEvent } from '../lib/telemetry';
import { scheduleCameraSwitchWatchdog } from '../lib/cameraSwitchWatchdog';
import { configureForRecording } from '../lib/audioSession';
import { runWithFinally } from '../lib/runWithFinally';
import { cameraUiReducer, initialCameraUiState, type CameraUiState } from '../lib/cameraUiReducer';
import {
  buildLensSwitcherOptions,
  defaultLensOption,
  findLensOptionById,
  lensOptionsFromNativePresets,
  shouldShowLensSwitcher,
  type LensOption,
} from '../lib/cameraLenses';
import { createCameraStyles } from '../components/camera/cameraScreen.styles';
import { setNativeVideoTorchForRecording } from '../lib/videoTorchSession';
import { HOLD_ZOOM_GAIN } from '../lib/cameraHoldZoom';
import {
  addCaptureEventListener,
  boostScreenBrightnessAsync,
  getBackLensPresetsAsync,
  isCaptureEventsSupported,
  isFocusPointSupported,
  resetFocusAsync,
  restoreScreenBrightnessAsync,
  setCaptureEventsEnabledAsync,
  setFocusPointAsync,
  type NixCaptureEvent,
} from '../../modules/nix-camera-torch';
import { duration as motionDuration, useMotionEnabled } from '../theme/motion';
import { focusIndicatorOrigin, viewPointToDevicePoint } from '../lib/cameraFocusPoint';
import {
  loadHoldHintCount,
  nextHoldHintCount,
  saveHoldHintCount,
  shouldShowHoldHint,
} from '../lib/cameraHoldHint';
import { captureStatusVisibleMs } from '../lib/cameraStatusPill';
import { paramFirst } from '../lib/previewRoute';
import { queryKeys } from '../lib/queryKeys';
import { useAuth } from './useAuth';
import {
  ACCEPTED_FRIENDS_LIMIT,
  listAcceptedFriends,
  type FriendProfile,
} from '../services/friendService';
import { uploadFeatures } from '../config/uploadFeatures';
import {
  CAMERA_CAPTURE_PROFILE,
  VIDEO_RECORDING_BITRATE,
} from '../lib/cameraCaptureProfile';

const VIDEO_RECORDING_MAX_FILE_SIZE_BYTES = 90 * 1024 * 1024;
/** Lets the white screen reach full brightness and the front camera re-expose before the shot. */
const FRONT_SCREEN_FLASH_WARMUP_MS = 350;
const VIDEO_TORCH_PROP_COMMIT_DELAY_MS = 50;
/** Picked videos may run a frame or two past the limit after export rounding. */
const PICKED_VIDEO_DURATION_TOLERANCE_MS = 500;
/** Old preview fades to black before the flip so the remount does not blink. */
const CAMERA_FLIP_FADE_OUT_MS = 120;
const CAMERA_FLIP_FADE_IN_MS = 220;
const SHUTTER_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Inner disc → rounded square while recording (Camera app). */
const SHUTTER_PRESSED_SCALE = 0.92;
const SHUTTER_HOLD_SCALE = 1.1;
const SHUTTER_PRESSED_OPACITY = 0.7;
const SHUTTER_INNER_SIZE = 62;
const SHUTTER_INNER_RECORDING_SIZE = 44;
const SHUTTER_INNER_RECORDING_RADIUS = 12;

export type CameraFocusIndicator = {
  key: number;
  left: number;
  top: number;
  locked: boolean;
};

export type CameraScreenViewModel = {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: ReturnType<typeof useCameraPermissions>[1];
  handleCameraPermission: () => Promise<void>;
  permissionGranted: boolean;
  permissionLoadingTimedOut: boolean;
  styles: ReturnType<typeof createCameraStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  insets: ScreenInsetsResult;
  facing: 'back' | 'front';
  flash: 'off' | 'on';
  stillFlashArmed: boolean;
  videoTorchRequested: boolean;
  recordAudioMuted: boolean;
  videoPreparing: boolean;
  recordingVideo: boolean;
  recordingElapsedSec: number;
  /** UI-thread clock of the running recording (0 when idle), for the progress ring. */
  recordingElapsedMs: SharedValue<number>;
  cameraReady: boolean;
  cameraActive: boolean;
  zoom: number;
  selectedLens: string | null;
  lensOptionId: string | null;
  lensOptions: LensOption[];
  showLensSwitcher: boolean;
  /** Bumps on camera tab focus so NativeLensSwitcher remounts Expo UI Namespace. */
  lensSwitcherEpoch: number;
  isSwitchingCamera: boolean;
  cameraInstanceKey: number;
  captureMode: 'picture' | 'video';
  takingPicture: boolean;
  captureError: string | null;
  isNativeSimulator: boolean;
  frontScreenFlashLit: boolean;
  frontRingLightActive: boolean;
  cameraRef: RefObject<CameraView | null>;
  /**
   * Live zoom on the UI thread (PERF-12). Gestures write only this; `zoom` above is committed once
   * per gesture, so pinching never re-renders the camera controls.
   */
  zoomShared: SharedValue<number>;
  /** True while a pinch / hold-to-record drag is changing `zoomShared`. */
  zoomGestureActive: SharedValue<boolean>;
  /** Pinch-to-zoom racing tap-to-focus and long-press AE/AF lock on the preview. */
  previewGesture: ReturnType<typeof Gesture.Race>;
  shutterGesture: ReturnType<typeof Gesture.Pan>;
  previewViewRef: RefObject<View | null>;
  onPreviewLayout: (event: LayoutChangeEvent) => void;
  focusIndicator: CameraFocusIndicator | null;
  focusLocked: boolean;
  focusSupported: boolean;
  focusAtCenter: () => void;
  toggleFocusLockAtCenter: () => void;
  holdHintVisible: boolean;
  dismissHoldHint: () => void;
  /** Friend preset by a chat / friend screen; the next capture goes to them first. */
  presetRecipient: FriendProfile | null;
  clearPresetRecipient: () => void;
  /** Opened from a chat: a close button leads back to it. */
  canExitToChat: boolean;
  exitToChat: () => void;
  onCameraReady: () => void;
  onAvailableLensesChanged: (event: AvailableLenses) => void;
  onResponsiveOrientationChanged: (event: ResponsiveOrientationChanged) => void;
  selectLens: (lensOptionId: string) => void;
  animatedShutterStyle: AnimatedStyle<ViewStyle>;
  animatedShutterInnerStyle: AnimatedStyle<ViewStyle>;
  animatedFlashStyle: AnimatedStyle<ViewStyle>;
  /** Black cover that crossfades the preview over a camera flip. */
  previewCoverStyle: AnimatedStyle<ViewStyle>;
  pickFromGallery: () => Promise<void>;
  toggleFacing: () => void;
  toggleFlash: () => void;
  toggleRecordingMicMuted: () => void;
  takeAccessiblePhoto: () => void;
  startAccessibleVideo: () => void;
  stopAccessibleVideo: () => void;
};

function useLatestCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void
): (...args: TArgs) => void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}

export function useCameraScreen(): CameraScreenViewModel {
  const { t } = useTranslation();
  const isNativeSimulator = !Constants.isDevice;
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const { user, canUseNetworkSession } = useAuth();
  const searchParams = useLocalSearchParams<{
    recipientId?: string | string[];
    returnTo?: string | string[];
  }>();
  const presetRecipientId = paramFirst(searchParams.recipientId)?.trim() || null;
  /** Opened from a chat's camera button: the camera shows a close button back to that chat. */
  const returnToChatPeerId =
    paramFirst(searchParams.returnTo) === 'chat' ? presetRecipientId : null;
  const { setSegments } = useVideoDraft();
  const { setDraft: setPhotoDraft } = usePhotoDraft();
  const insets = useScreenInsets('cameraTab');
  const styles = useMemo(() => createCameraStyles(colors), [colors]);
  const [permission, requestPermission, getCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission, getMicPermission] = useMicrophonePermissions();
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void Promise.all([getCameraPermission(), getMicPermission()]).catch((error) => {
          console.warn('Camera permission refresh failed', error);
        });
      }
    });
    return () => subscription.remove();
  }, [getCameraPermission, getMicPermission]);
  const handleCameraPermission = async () => {
    await performCameraPermissionRequest(permission, {
      request: requestPermission, openSettings: () => Linking.openSettings(),
    });
  };
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
    selectedLens,
    lensOptionId,
    isSwitchingCamera,
    cameraInstanceKey,
    captureMode,
  } = cameraUi;

  const [lensOptions, setLensOptions] = useState<LensOption[]>([]);
  const [lensSwitcherEpoch, setLensSwitcherEpoch] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const cameraUiRef = useRef(cameraUi);
  const cameraReadyRef = useRef(false);
  const fingerDownRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingSessionRunningRef = useRef(false);
  const accessibleVideoPendingRef = useRef(false);
  const recordingStartedRef = useRef(false);
  const videoTorchSessionIdRef = useRef(0);
  const videoTorchSessionStartedAtRef = useRef<number | null>(null);
  const pressInTimeRef = useRef(0);
  const cameraMountStartedAtRef = useRef<number | null>(null);
  const zoomAtGestureStart = useSharedValue(0);
  const zoomShared = useSharedValue(0);
  const zoomGestureActive = useSharedValue(false);
  const recordingZoomEnabled = useSharedValue(false);
  const shutterEnabled = useSharedValue(true);
  const shutterFingerActive = useSharedValue(false);
  const isSwitchingCameraRef = useRef(false);
  const switchWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchRecoveryUsedRef = useRef(false);
  const safeStopRecordingRef = useRef<() => void>(() => {});
  const disableNativeVideoTorchRef = useRef<() => void>(() => {});
  const resetFocusRef = useRef<() => void>(() => {});
  const cameraOrientationRef = useRef<CameraOrientation | null>(null);
  const orientationWaitersRef = useRef<Set<() => void>>(new Set());

  const shutterScale = useSharedValue(1);
  /** Reduce Motion stand-in for the press scale: a dim instead of a size change. */
  const shutterPressOpacity = useSharedValue(1);
  const motionEnabledShared = useSharedValue(motionEnabled);
  /** 0 = round shutter, 1 = recording square; animated, not a style swap. */
  const shutterRecordingMorph = useSharedValue(0);
  const previewCoverOpacity = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardwarePressActiveRef = useRef(false);
  const recordingWithoutAudioRef = useRef(false);
  const previewViewRef = useRef<View>(null);
  const previewLayoutRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const focusLockedRef = useRef(false);
  const [focusIndicator, setFocusIndicator] = useState<CameraFocusIndicator | null>(null);
  const [holdHintVisible, setHoldHintVisible] = useState(false);
  const holdHintCountRef = useRef<number | null>(null);
  const presetRecipientIdRef = useRef<string | null>(presetRecipientId);
  useEffect(() => {
    presetRecipientIdRef.current = presetRecipientId;
  }, [presetRecipientId]);
  useEffect(() => {
    motionEnabledShared.set(motionEnabled);
  }, [motionEnabled, motionEnabledShared]);
  // Front-camera "flash": a white screen at full brightness for stills, a white ring while
  // recording so the preview stays visible.
  const [frontScreenFlashLit, setFrontScreenFlashLit] = useState(false);
  const frontRingLightActive = flash === 'on' && facing === 'front' && recordingVideo;
  useEffect(() => {
    if (!frontRingLightActive) return;
    void boostScreenBrightnessAsync();
    return () => {
      void restoreScreenBrightnessAsync();
    };
  }, [frontRingLightActive]);
  useEffect(
    () => () => {
      void restoreScreenBrightnessAsync();
    },
    []
  );
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
      const message = err instanceof Error ? err.message : String(err ?? '');
      const simulatorUnsupported = message.toLowerCase().includes('simulator');
      logVideoTorchEvent('stop-recording-catch', {}, { message, simulatorUnsupported });
      if (simulatorUnsupported) return;
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
    const now = nowMs();
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

  /** Drops a tap-to-focus point / AE-AF lock (lens change, flip, leaving the camera). */
  const resetFocus = () => {
    const hadFocus = focusLockedRef.current || focusIndicator != null;
    focusLockedRef.current = false;
    setFocusIndicator(null);
    if (hadFocus) void resetFocusAsync();
  };

  useEffect(() => {
    safeStopRecordingRef.current = safeStopRecording;
    disableNativeVideoTorchRef.current = disableNativeVideoTorch;
    resetFocusRef.current = resetFocus;
  });

  useFocusEffect(
    useCallback(() => {
      // Expo UI Namespace unregisters on disappear and does not re-register on appear —
      // remount NativeLensSwitcher so glassEffectId / matchedGeometry work again after tab blur.
      setLensSwitcherEpoch((epoch) => epoch + 1);
      dispatchCameraUi({ type: 'SET_CAMERA_ACTIVE', cameraActive: true });
      cameraMountStartedAtRef.current = nowMs();
      logVideoTorchEvent('screen-focus-active');
      return () => {
        logVideoTorchEvent('screen-blur-cleanup');
        dispatchCameraUi({ type: 'SET_CAMERA_ACTIVE', cameraActive: false });
        safeStopRecordingRef.current();
        disableNativeVideoTorchRef.current();
        resetFocusRef.current();
        hardwarePressActiveRef.current = false;
        if (flipTimerRef.current) {
          clearTimeout(flipTimerRef.current);
          flipTimerRef.current = null;
        }
        previewCoverOpacity.set(0);
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
    }, [previewCoverOpacity])
  );

  useEffect(() => {
    shutterRecordingMorph.set(
      withTiming(recordingVideo ? 1 : 0, {
        duration: motionEnabled ? motionDuration.medium : 0,
        easing: SHUTTER_EASE_OUT,
      })
    );
  }, [recordingVideo, motionEnabled, shutterRecordingMorph]);

  const animatedShutterStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: shutterPressOpacity.get(),
    transform: [{ scale: shutterScale.get() }],
  }));

  const shutterIdleFill = colors.cameraControlTint;
  const shutterRecordingFill = colors.destructive;
  const animatedShutterInnerStyle = useAnimatedStyle<ViewStyle>(() => {
    const morph = shutterRecordingMorph.get();
    const scale = interpolate(morph, [0, 1], [1, SHUTTER_INNER_RECORDING_SIZE / SHUTTER_INNER_SIZE]);
    return {
      // Radius is in pre-scale units so the visible corner lands on 12 pt.
      borderRadius: interpolate(
        morph,
        [0, 1],
        [SHUTTER_INNER_SIZE / 2, SHUTTER_INNER_RECORDING_RADIUS / scale]
      ),
      backgroundColor: interpolateColor(morph, [0, 1], [shutterIdleFill, shutterRecordingFill]),
      transform: [{ scale }],
    };
  });

  const previewCoverStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: previewCoverOpacity.get(),
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
        scheduleOnRN(pushRecordingElapsedSec, sec);
      }
    }
  );

  useEffect(() => {
    zoomShared.set(zoom);
  }, [zoom, zoomShared]);

  useEffect(() => {
    recordingZoomEnabled.set(recordingVideo);
  }, [recordingVideo, recordingZoomEnabled]);

  useEffect(() => {
    shutterEnabled.set(
      !takingPicture &&
        !isSwitchingCamera &&
        (isNativeSimulator || cameraReady || videoPreparing || recordingVideo)
    );
  }, [
    takingPicture,
    isSwitchingCamera,
    isNativeSimulator,
    cameraReady,
    videoPreparing,
    recordingVideo,
    shutterEnabled,
  ]);

  const setZoomFromGesture = useCallback((nextZoom: number) => {
    dispatchCameraUi({ type: 'SET_ZOOM', zoom: nextZoom });
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          'worklet';
          zoomAtGestureStart.set(zoomShared.get());
          zoomGestureActive.set(true);
        })
        .onUpdate((event) => {
          'worklet';
          // UI thread only (PERF-12): the preview subscribes to `zoomShared` on its own; React
          // state is committed once, when the pinch ends.
          zoomShared.set(Math.max(
            0,
            Math.min(1, zoomAtGestureStart.get() + (event.scale - 1) * 0.22)
          ));
        })
        .onEnd(() => {
          'worklet';
          zoomGestureActive.set(false);
          scheduleOnRN(setZoomFromGesture, zoomShared.get());
        })
        .onFinalize(() => {
          'worklet';
          if (!zoomGestureActive.get()) return;
          zoomGestureActive.set(false);
          scheduleOnRN(setZoomFromGesture, zoomShared.get());
        }),
    [
      setZoomFromGesture,
      zoomAtGestureStart,
      zoomGestureActive,
      zoomShared,
    ]
  );

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
    const deadline = nowMs() + timeoutMs;
    logVideoTorchEvent('wait-camera-ready-begin', {}, { timeoutMs });
    // Rekurencyjny polling zamiast while+await — ten sam semantycznie, bez ostrzeżenia react-doctor.
    const poll = async (): Promise<boolean> => {
      if (nowMs() >= deadline) {
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

  const applyLensOptions = useCallback((options: LensOption[]) => {
    const facingNow = cameraUiRef.current.facing;
    if (facingNow !== 'back') {
      setLensOptions([]);
      return;
    }

    setLensOptions(options);

    const currentId = cameraUiRef.current.lensOptionId;
    if (currentId != null && !options.some((option) => option.id === currentId)) {
      const fallback = defaultLensOption(options);
      dispatchCameraUi({
        type: 'SET_LENS_PRESET',
        selectedLens: fallback?.selectedLensValue ?? null,
        lensOptionId: fallback?.id ?? null,
        zoom: fallback?.zoom ?? 0,
      });
    }
  }, []);

  const refreshLensOptions = useCallback(async () => {
    if (cameraUiRef.current.facing !== 'back') {
      setLensOptions([]);
      return;
    }

    const nativePresets = await getBackLensPresetsAsync();
    if (nativePresets && nativePresets.length > 0) {
      applyLensOptions(lensOptionsFromNativePresets(nativePresets));
      return;
    }

    try {
      const lenses = (await cameraRef.current?.getAvailableLensesAsync()) ?? [];
      applyLensOptions(buildLensSwitcherOptions(lenses));
    } catch {
      applyLensOptions([]);
    }
  }, [applyLensOptions]);

  const applyAvailableLenses = useCallback(
    (lenses: string[]) => {
      // Prefer native deviceType presets; localizedName callback is fallback-only.
      void getBackLensPresetsAsync().then((nativePresets) => {
        if (nativePresets && nativePresets.length > 0) {
          applyLensOptions(lensOptionsFromNativePresets(nativePresets));
          return;
        }
        applyLensOptions(buildLensSwitcherOptions(lenses));
      });
    },
    [applyLensOptions]
  );

  const onAvailableLensesChanged = useCallback(
    (event: AvailableLenses) => {
      applyAvailableLenses(event.lenses);
    },
    [applyAvailableLenses]
  );

  const onResponsiveOrientationChanged = useCallback((event: ResponsiveOrientationChanged) => {
    cameraOrientationRef.current = event.orientation;
    for (const resolve of orientationWaitersRef.current) resolve();
    orientationWaitersRef.current.clear();
  }, []);

  const waitForResponsiveOrientation = async (): Promise<CameraOrientation | null> => {
    if (cameraOrientationRef.current) {
      return cameraOrientationRef.current;
    }

    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        orientationWaitersRef.current.delete(finish);
        resolve();
      };
      const timeout = setTimeout(finish, 180);
      orientationWaitersRef.current.add(finish);
    });
    return cameraOrientationRef.current;
  };

  const selectLens = useCallback(
    (nextLensOptionId: string) => {
      const option = findLensOptionById(lensOptions, nextLensOptionId);
      if (!option) return;

      const ui = cameraUiRef.current;
      if (
        ui.takingPicture ||
        ui.videoPreparing ||
        ui.isSwitchingCamera ||
        ui.recordingVideo ||
        isSwitchingCameraRef.current
      ) {
        return;
      }

      if (ui.lensOptionId === option.id && Math.abs(ui.zoom - option.zoom) < 0.0001) return;

      hapticSelection();
      resetFocusRef.current();
      zoomAtGestureStart.set(option.zoom);
      zoomShared.set(option.zoom);
      dispatchCameraUi({
        type: 'SET_LENS_PRESET',
        selectedLens: option.selectedLensValue,
        lensOptionId: option.id,
        zoom: option.zoom,
      });
      trackEvent('camera_lens_selected', { kind: option.kind, id: option.id });
    },
    [lensOptions, zoomAtGestureStart, zoomShared]
  );

  const showLensSwitcher = shouldShowLensSwitcher(facing, lensOptions);

  // --- Recipient preset by a chat / friend screen (`recipientId` search param) ---
  const { data: acceptedFriends } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: ACCEPTED_FRIENDS_LIMIT }),
    enabled: Boolean(presetRecipientId && user) && canUseNetworkSession,
    staleTime: 1000 * 60 * 2,
  });
  const presetRecipient = presetRecipientId
    ? (acceptedFriends?.find((friend) => friend.id === presetRecipientId) ?? null)
    : null;

  /** Hands the preset recipient to the preview once and clears it so the next capture is normal. */
  const consumePresetRecipientParams = (): { recipientId?: string } => {
    const recipientId = presetRecipientIdRef.current;
    if (!recipientId) return {};
    presetRecipientIdRef.current = null;
    // Runs before the push, while the camera route is still the focused one.
    router.setParams({ recipientId: undefined, returnTo: undefined });
    return { recipientId };
  };

  const clearPresetRecipient = () => {
    presetRecipientIdRef.current = null;
    router.setParams({ recipientId: undefined, returnTo: undefined });
  };

  /** Leaves the camera for the chat it was opened from (nothing captured, nothing sent). */
  const exitToChat = () => {
    const peerId = returnToChatPeerId;
    if (!peerId) return;
    presetRecipientIdRef.current = null;
    router.setParams({ recipientId: undefined, returnTo: undefined });
    router.push({ pathname: '/chat/[peerId]', params: { peerId } });
  };

  // --- One-time "Hold to record" hint ---
  const holdHintLoadStartedRef = useRef(false);
  const permissionGrantedForHint = Boolean(permission?.granted);
  useEffect(() => {
    if (!permissionGrantedForHint || holdHintLoadStartedRef.current) return;
    holdHintLoadStartedRef.current = true;
    let cancelled = false;
    void loadHoldHintCount().then((count) => {
      if (cancelled) return;
      holdHintCountRef.current = count;
      if (!shouldShowHoldHint(count)) return;
      setHoldHintVisible(true);
      const next = nextHoldHintCount(count, 'shown');
      holdHintCountRef.current = next;
      void saveHoldHintCount(next);
    });
    return () => {
      cancelled = true;
    };
  }, [permissionGrantedForHint]);

  const retireHoldHint = (reason: 'dismissed' | 'recorded') => {
    setHoldHintVisible(false);
    const current = holdHintCountRef.current ?? 0;
    const next = nextHoldHintCount(current, reason);
    if (next === holdHintCountRef.current) return;
    holdHintCountRef.current = next;
    void saveHoldHintCount(next);
  };
  const dismissHoldHint = () => retireHoldHint('dismissed');

  // --- Capture error / notice pill: hides itself instead of covering the lens switcher ---
  useEffect(() => {
    if (!captureError) return;
    AccessibilityInfo.announceForAccessibility(captureError);
    const timer = setTimeout(() => {
      dispatchCameraUi({ type: 'SET_CAPTURE_ERROR', captureError: null });
    }, captureStatusVisibleMs(captureError));
    return () => clearTimeout(timer);
  }, [captureError]);

  // --- Tap to focus / expose, long press to lock AE/AF ---
  const focusSupported = isFocusPointSupported();

  const onPreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    previewLayoutRef.current = { ...previewLayoutRef.current, width, height };
    previewViewRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      previewLayoutRef.current = { x, y, width: measuredWidth || width, height: measuredHeight || height };
    });
  }, []);

  const requestFocusAt = (x: number, y: number, windowX: number, windowY: number, lock: boolean) => {
    if (!focusSupported) return;
    const ui = cameraUiRef.current;
    if (ui.isSwitchingCamera || isSwitchingCameraRef.current) return;
    if (!cameraReadyRef.current && !ui.recordingVideo && !ui.videoPreparing) return;

    const { width, height } = previewLayoutRef.current;
    const wasLocked = focusLockedRef.current;
    focusLockedRef.current = lock;
    const origin = focusIndicatorOrigin(x, y, width, height);
    setFocusIndicator((previous) => ({ key: (previous?.key ?? 0) + 1, ...origin, locked: lock }));

    const fallback = viewPointToDevicePoint({
      x,
      y,
      viewWidth: width,
      viewHeight: height,
      mirrored: ui.facing === 'front',
    });
    void setFocusPointAsync({
      windowX,
      windowY,
      fallbackX: fallback.x,
      fallbackY: fallback.y,
      facing: ui.facing,
      lensName: ui.selectedLens,
      lock,
    });

    if (lock) {
      hapticSelection();
      AccessibilityInfo.announceForAccessibility(t('camera.focusLocked'));
    } else if (wasLocked) {
      AccessibilityInfo.announceForAccessibility(t('camera.focusUnlocked'));
    }
  };
  const handleFocusRequest = useLatestCallback(requestFocusAt);

  /** VoiceOver equivalents of the tap / long-press gestures: act on the preview centre. */
  const focusAtCenter = () => {
    const { x, y, width, height } = previewLayoutRef.current;
    requestFocusAt(width / 2, height / 2, x + width / 2, y + height / 2, false);
  };
  const toggleFocusLockAtCenter = () => {
    if (focusLockedRef.current) {
      resetFocus();
      AccessibilityInfo.announceForAccessibility(t('camera.focusUnlocked'));
      return;
    }
    const { x, y, width, height } = previewLayoutRef.current;
    requestFocusAt(width / 2, height / 2, x + width / 2, y + height / 2, true);
  };

  const previewGesture = useMemo(() => {
    const focusTap = Gesture.Tap()
      .maxDuration(300)
      .maxDistance(12)
      .onEnd((event, success) => {
        'worklet';
        if (!success) return;
        scheduleOnRN(handleFocusRequest, event.x, event.y, event.absoluteX, event.absoluteY, false);
      });
    const focusLock = Gesture.LongPress()
      .minDuration(600)
      .maxDistance(12)
      .numberOfPointers(1)
      .onStart((event) => {
        'worklet';
        scheduleOnRN(handleFocusRequest, event.x, event.y, event.absoluteX, event.absoluteY, true);
      });
    // Pinch wins as soon as two fingers scale; otherwise a hold locks, a tap focuses.
    return Gesture.Race(pinchGesture, Gesture.Exclusive(focusLock, focusTap));
  }, [handleFocusRequest, pinchGesture]);

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
      previewCoverOpacity.set(withTiming(0, { duration: CAMERA_FLIP_FADE_IN_MS, easing: SHUTTER_EASE_OUT }));
      trackEvent('camera_switch_ready', {
        facing,
        recovered: switchRecoveryUsedRef.current,
      });
      isSwitchingCameraRef.current = false;
      switchRecoveryUsedRef.current = false;
    }

    void refreshLensOptions();
  };

  const micGranted = micPermission?.granted === true;
  /** What the CameraView actually records: muted by the user or for lack of mic access. */
  const effectiveAudioMuted = recordAudioMuted || !micGranted;

  // Ask for the microphone once, right after the camera itself is allowed — never during the
  // 500 ms hold (the system alert steals the touch and the first recording always aborted).
  const micPromptRequestedRef = useRef(false);
  const permissionGrantedForMic = Boolean(permission?.granted);
  useEffect(() => {
    if (!permissionGrantedForMic || !cameraActive || micPromptRequestedRef.current) return;
    if (!micPermission || micPermission.granted) return;
    if (micPermission.status !== PermissionStatus.UNDETERMINED || micPermission.canAskAgain === false) return;
    micPromptRequestedRef.current = true;
    void requestMicPermission().catch((error: unknown) => {
      console.warn('Microphone permission request failed', error);
    });
  }, [permissionGrantedForMic, cameraActive, micPermission, requestMicPermission]);

  const waitForVideoTorchPropsCommit = async () => {
    logVideoTorchEvent('torch-props-commit-wait-begin', {}, { delayMs: VIDEO_TORCH_PROP_COMMIT_DELAY_MS });
    await new Promise((resolve) => setTimeout(resolve, VIDEO_TORCH_PROP_COMMIT_DELAY_MS));
    logVideoTorchEvent('torch-props-commit-wait-end');
  };

  const runVideoCaptureSession = async () => {
    const torchRequestedForSession = flash === 'on' && facing === 'back';
    videoTorchSessionIdRef.current += 1;
    videoTorchSessionStartedAtRef.current = nowMs();
    cameraReadyRef.current = false;
    cameraMountStartedAtRef.current = nowMs();
    logVideoTorchEvent('video-session-start', {}, { torchRequestedForSession });
    dispatchCameraUi({ type: 'VIDEO_PREPARE_BEGIN' });
    logVideoTorchEvent('video-prepare-begin', {
      facing,
      flash,
      captureMode: 'video',
      videoTorchRequested: torchRequestedForSession,
      videoPreparing: true,
      recordingVideo: false,
    });

    let recordingBegan = false;
    await runWithFinally(
      async () => {
        let result: { uri?: string } | undefined;
        let recordingCodec: 'avc1' | 'hvc1' = 'avc1';
        let captureOrientation: CameraOrientation | null = null;
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
            captureError: t('camera.recordingNotReady'),
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
          dispatchCameraUi({ type: 'SET_CAPTURE_ERROR', captureError: t('camera.unavailable') });
          return;
        }

        captureOrientation = await waitForResponsiveOrientation();

        const maxDurSec = Math.max(1, Math.ceil(VIDEO_TOTAL_MAX_DURATION_MS / 1000));
        attemptedRecord = true;
        const recordStartedAt = nowMs();
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
            const fingerStillDown = await waitForVideoTorchPropsCommit().then(() => fingerDownRef.current);
            if (!fingerStillDown) {
              return;
            }
          }
          recordingStartedRef.current = true;
          recordingBegan = true;
          AccessibilityInfo.announceForAccessibility(t('camera.recordingStarted'));
          retireHoldHint('recorded');
          if (recordingWithoutAudioRef.current) {
            dispatchCameraUi({
              type: 'SET_CAPTURE_ERROR',
              captureError: t('camera.recordingWithoutAudio'),
            });
          }
          recordingElapsedMs.set(0);
          recordingElapsedMs.set(
            withTiming(VIDEO_TOTAL_MAX_DURATION_MS, {
              duration: VIDEO_TOTAL_MAX_DURATION_MS,
              easing: Easing.linear,
              // This is a clock, not motion: with the system default, Reduce Motion would jump
              // straight to 180 s.
              reduceMotion: ReduceMotion.Never,
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
          const availableCodecs = uploadFeatures.hevcCapture
            ? await CameraView.getAvailableVideoCodecsAsync().catch(() => [])
            : [];
          recordingCodec = availableCodecs.includes('hvc1') ? 'hvc1' : 'avc1';
          result = await cam.recordAsync({
            maxDuration: maxDurSec,
            maxFileSize: VIDEO_RECORDING_MAX_FILE_SIZE_BYTES,
            codec: recordingCodec,
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

        const durationMs = Math.round(Math.min(nowMs() - recordStartedAt, VIDEO_TOTAL_MAX_DURATION_MS));
        if (result?.uri) {
          logVideoTorchEvent('record-result-success', {}, { durationMs });
          trackDuration('video_record_ms', sessionStartedAt, {
            status: 'success',
            duration_recorded_ms: durationMs,
            codec: recordingCodec,
            bitrate: VIDEO_RECORDING_BITRATE,
            capture_orientation: captureOrientation ?? 'unknown',
            picture_size: CAMERA_CAPTURE_PROFILE.pictureSize,
            video_quality: CAMERA_CAPTURE_PROFILE.videoQuality,
            video_stabilization_mode: CAMERA_CAPTURE_PROFILE.videoStabilizationMode,
          });
          setSegments([{
            uri: result.uri,
            durationMs,
            captureOrientation: captureOrientation ?? undefined,
          }]);
          router.push({
            pathname: '/preview',
            params: {
              mode: 'video',
              uri: result.uri,
              durationMs: String(durationMs),
              ...consumePresetRecipientParams(),
            },
          });
        } else if (attemptedRecord) {
          logVideoTorchEvent('record-result-empty', {}, { attemptedRecord });
          hapticNotify('error');
          dispatchCameraUi({
            type: 'SET_CAPTURE_ERROR',
            captureError: t('camera.recordingFailed'),
          });
        }
      },
      () => {
        if (recordingBegan) {
          // Pairs with the start haptic; fired once the file is closed so recording-time
          // haptic suppression cannot swallow it.
          tap('medium');
          AccessibilityInfo.announceForAccessibility(t('camera.recordingStopped'));
        }
        recordingStartedRef.current = false;
        cancelAnimation(recordingElapsedMs);
        recordingElapsedMs.set(0);
        cameraReadyRef.current = false;
        disableNativeVideoTorch();
        logVideoTorchEvent('video-session-end-dispatch');
        dispatchCameraUi({ type: 'VIDEO_SESSION_END' });
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

    // No prompt here: without mic access the clip is recorded silently and a notice says so.
    recordingWithoutAudioRef.current = !recordAudioMuted && !micGranted;
    logVideoTorchEvent('mic-state', {}, { micGranted, withoutAudio: recordingWithoutAudioRef.current });

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
        captureError: t('camera.audioSetupFailed'),
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
    const useFrontScreenFlash = flash === 'on' && facing === 'front';
    logVideoTorchEvent('take-picture-prepare');
    dispatchCameraUi({ type: 'PREPARE_STILL_CAPTURE' });
    tap('light');

    if (!useFrontScreenFlash) {
      flashOpacity.set(
        withSequence(
          withTiming(1, { duration: 50 }),
          withTiming(0, { duration: motionDuration.slow, easing: Easing.out(Easing.ease) })
        )
      );
    }

    if (cameraRef.current) {
      const camera = cameraRef.current;
      const captureStartedAt = nowMs();
      await runWithFinally(
        async () => {
          try {
            if (captureMode !== 'picture') {
              cameraReadyRef.current = false;
              dispatchCameraUi({ type: 'SET_CAPTURE_MODE', captureMode: 'picture' });
              const modeReady = await waitForCameraReady(8000);
              if (!modeReady) {
                hapticNotify('error');
                dispatchCameraUi({
                  type: 'SET_CAPTURE_ERROR',
                  captureError: t('camera.notReady'),
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
                    if (result.assets && result.assets.length > 0) {
                      const asset = result.assets[0];
                      setPhotoDraft({ uri: asset.uri, width: asset.width, height: asset.height });
                      router.push({ pathname: '/preview', params: consumePresetRecipientParams() });
                    }
                  }
                } catch (err) {
                  console.error('Symulator iOS: wybór zdjęcia z biblioteki nie powiódł się', err);
                  hapticNotify('error');
                  dispatchCameraUi({
                    type: 'SET_CAPTURE_ERROR',
                    captureError: t('camera.pickPhotoFailed'),
                  });
                }
              } else {
                hapticNotify('error');
                dispatchCameraUi({
                  type: 'SET_CAPTURE_ERROR',
                  captureError: t('camera.notReady'),
                });
              }
              return;
            }
            if (useFrontScreenFlash) {
              setFrontScreenFlashLit(true);
              await boostScreenBrightnessAsync();
              await new Promise((resolve) => setTimeout(resolve, FRONT_SCREEN_FLASH_WARMUP_MS));
            }
            logVideoTorchEvent('before-takePictureAsync', {}, { facing });
            const captureOrientation = await waitForResponsiveOrientation();
            // Selfie stills are mirrored by the `mirror` prop on CameraView (the per-call option
            // is deprecated), so they match the preview.
            const photo = await camera.takePictureAsync({
              quality: 0.8,
              base64: false,
            });
            logVideoTorchEvent('after-takePictureAsync', {}, {
              hasPhoto: Boolean(photo),
              width: photo?.width,
              height: photo?.height,
              facing,
            });

            if (photo?.uri) {
              trackDuration('photo_capture_ms', captureStartedAt, {
                status: 'success',
                width: photo.width,
                height: photo.height,
                capture_orientation: captureOrientation ?? 'unknown',
              });
              // Navigate immediately — bake/compress happens at send in mediaService.
              setPhotoDraft({
                uri: photo.uri,
                width: photo.width,
                height: photo.height,
                captureOrientation: captureOrientation ?? undefined,
              });
              trackDuration('photo_preview_nav_ms', captureStartedAt, {
                status: 'success',
                facing,
                width: photo.width,
                height: photo.height,
              });
              router.push({ pathname: '/preview', params: consumePresetRecipientParams() });
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
              captureError: t('camera.captureFailed'),
            });
          }
        },
        () => {
          if (useFrontScreenFlash) {
            setFrontScreenFlashLit(false);
            void restoreScreenBrightnessAsync();
          }
          dispatchCameraUi({ type: 'SET_TAKING_PICTURE', takingPicture: false });
        }
      );
    } else {
      hapticNotify('error');
      dispatchCameraUi({
        type: 'SET_CAPTURE_ERROR',
        captureError: t('camera.notReady'),
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
    pressInTimeRef.current = nowMs();
    fingerDownRef.current = true;
    logVideoTorchEvent('shutter-press-in-armed', {}, { holdThresholdMs: VIDEO_HOLD_THRESHOLD_MS });

    holdTimerRef.current = setTimeout(() => {
      logVideoTorchEvent('hold-threshold-fired', {}, {
        elapsedMs: nowMs() - pressInTimeRef.current,
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
      elapsedMs: nowMs() - pressInTimeRef.current,
      hasHoldTimer: Boolean(holdTimerRef.current),
    });
    fingerDownRef.current = false;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      const elapsed = nowMs() - pressInTimeRef.current;
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

  // Stable JS bridges for worklets — gesture objects must not be recreated mid-touch
  // (SET_ZOOM / recordingVideo re-renders previously rebuilt Gesture.Pan and crashed Hermes).
  const handleShutterPressIn = useLatestCallback(onShutterPressIn);
  const handleShutterPressOut = useLatestCallback(onShutterPressOut);

  // Camera Control (iPhone 16+) and the volume buttons drive the same press-in / press-out path
  // as the on-screen shutter: a short press takes a photo, a hold records.
  const onHardwareCaptureEvent = (event: NixCaptureEvent) => {
    if (event.phase === 'began') {
      if (hardwarePressActiveRef.current || fingerDownRef.current) return;
      const ui = cameraUiRef.current;
      const shutterReady =
        !ui.takingPicture &&
        !ui.isSwitchingCamera &&
        !isSwitchingCameraRef.current &&
        (isNativeSimulator || ui.cameraReady || ui.videoPreparing || ui.recordingVideo);
      if (!shutterReady) return;
      hardwarePressActiveRef.current = true;
      if (motionEnabled) {
        shutterScale.set(withTiming(SHUTTER_PRESSED_SCALE, { duration: 100, easing: SHUTTER_EASE_OUT }));
      } else {
        shutterPressOpacity.set(withTiming(SHUTTER_PRESSED_OPACITY, { duration: 100 }));
      }
      onShutterPressIn();
      return;
    }

    if (!hardwarePressActiveRef.current) return;
    hardwarePressActiveRef.current = false;
    shutterScale.set(withTiming(1, { duration: 150, easing: SHUTTER_EASE_OUT }));
    shutterPressOpacity.set(withTiming(1, { duration: 150 }));

    if (event.phase === 'ended') {
      onShutterPressOut();
      return;
    }

    // Cancelled (e.g. the system took the button back): never a surprise photo.
    fingerDownRef.current = false;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (recordingSessionRunningRef.current) {
      safeStopRecording();
    } else {
      disableNativeVideoTorch();
      dispatchCameraUi({ type: 'CLEAR_VIDEO_TORCH' });
    }
  };
  const handleHardwareCaptureEvent = useLatestCallback(onHardwareCaptureEvent);
  const captureEventsPermissionGranted = Boolean(permission?.granted);

  useFocusEffect(
    useCallback(() => {
      if (!captureEventsPermissionGranted || !isCaptureEventsSupported()) return;
      const subscription = addCaptureEventListener(handleHardwareCaptureEvent);
      void setCaptureEventsEnabledAsync(true);
      return () => {
        subscription.remove();
        // Gives the volume buttons back to the system as soon as the camera is left.
        void setCaptureEventsEnabledAsync(false);
        if (hardwarePressActiveRef.current) {
          hardwarePressActiveRef.current = false;
          fingerDownRef.current = false;
        }
      };
    }, [captureEventsPermissionGranted, handleHardwareCaptureEvent])
  );

  // Hold-to-record + Snapchat-style vertical drag-to-zoom while REC is active.
  // manualActivation keeps the touch alive through drag (Pressable would cancel on move).
  // Memoized: recreating Pan mid-hold (zoom commits / recording state) aborted Hermes in TF.
  const shutterGesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((_event, state) => {
          'worklet';
          if (!shutterEnabled.get()) {
            state.fail();
            return;
          }
          shutterFingerActive.set(true);
          state.activate();
          // Feedback on touch-down, on the UI thread: a press-in, then from ~150 ms a slow grow
          // that previews the hold-to-record threshold (500 ms).
          if (motionEnabledShared.get()) {
            shutterScale.set(
              withSequence(
                withTiming(SHUTTER_PRESSED_SCALE, { duration: 100, easing: SHUTTER_EASE_OUT }),
                withDelay(
                  50,
                  withTiming(SHUTTER_HOLD_SCALE, {
                    duration: VIDEO_HOLD_THRESHOLD_MS - 150,
                    easing: SHUTTER_EASE_OUT,
                  })
                )
              )
            );
          } else {
            shutterPressOpacity.set(withTiming(SHUTTER_PRESSED_OPACITY, { duration: 100 }));
          }
          scheduleOnRN(handleShutterPressIn);
        })
        .onChange((event) => {
          'worklet';
          if (!recordingZoomEnabled.get()) return;
          // Inline hold-zoom math — do not call applyHoldZoomDelta (cross-file non-worklet).
          // UI thread only (PERF-12); committed to React state when the finger lifts.
          zoomGestureActive.set(true);
          zoomShared.set(Math.max(
            0,
            Math.min(1, zoomShared.get() - event.changeY * HOLD_ZOOM_GAIN)
          ));
        })
        .onFinalize(() => {
          'worklet';
          if (!shutterFingerActive.get()) return;
          shutterFingerActive.set(false);
          zoomGestureActive.set(false);
          shutterScale.set(withTiming(1, { duration: 150, easing: SHUTTER_EASE_OUT }));
          shutterPressOpacity.set(withTiming(1, { duration: 150 }));
          scheduleOnRN(setZoomFromGesture, zoomShared.get());
          scheduleOnRN(handleShutterPressOut);
        }),
    [
      handleShutterPressIn,
      handleShutterPressOut,
      motionEnabledShared,
      recordingZoomEnabled,
      setZoomFromGesture,
      shutterEnabled,
      shutterFingerActive,
      shutterPressOpacity,
      shutterScale,
      zoomGestureActive,
      zoomShared,
    ]
  );

  const takeAccessiblePhoto = () => {
    if (takingPicture || isSwitchingCamera || accessibleVideoPendingRef.current || recordingSessionRunningRef.current
      || (!isNativeSimulator && !cameraReadyRef.current)) return;
    void takePicture();
  };
  const startAccessibleVideo = () => {
    if (takingPicture || isSwitchingCamera || accessibleVideoPendingRef.current || recordingSessionRunningRef.current
      || (!isNativeSimulator && !cameraReadyRef.current)) return;
    fingerDownRef.current = true;
    accessibleVideoPendingRef.current = true;
    void startVideoCaptureFlow().finally(() => { accessibleVideoPendingRef.current = false; });
  };
  const stopAccessibleVideo = () => {
    fingerDownRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    safeStopRecording();
  };

  const pickFromGallery = async () => {
    if (videoPreparing || recordingVideo || takingPicture || isSwitchingCamera) return;
    if (recordingSessionRunningRef.current) return;
    dispatchCameraUi({ type: 'SET_CAPTURE_ERROR', captureError: null });

    try {
      // PHPicker runs out of process and needs no Photos permission; asking for full library
      // access first was a needless prompt and a dead gallery button after a refusal.
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
          captureError: t('camera.loadFileFailed'),
        });
        return;
      }

      trackEvent('camera_gallery_pick', { type: asset.type ?? 'unknown' });

      if (asset.type === 'video') {
        // expo-image-picker reports the duration in milliseconds.
        const pickedDurationMs = asset.duration ?? 0;
        if (pickedDurationMs > VIDEO_TOTAL_MAX_DURATION_MS + PICKED_VIDEO_DURATION_TOLERANCE_MS) {
          trackEvent('camera_gallery_video_too_long', { duration_ms: Math.round(pickedDurationMs) });
          hapticNotify('error');
          dispatchCameraUi({
            type: 'SET_CAPTURE_ERROR',
            captureError: t('camera.videoTooLong'),
          });
          return;
        }
        const durationMs = Math.round(Math.min(pickedDurationMs, VIDEO_TOTAL_MAX_DURATION_MS));
        setSegments([{ uri: asset.uri, durationMs, width: asset.width, height: asset.height }]);
        router.push({ pathname: '/preview', params: { mode: 'video', ...consumePresetRecipientParams() } });
      } else {
        setPhotoDraft({ uri: asset.uri, width: asset.width, height: asset.height });
        router.push({ pathname: '/preview', params: consumePresetRecipientParams() });
      }
    } catch (err) {
      console.error('Wybór z galerii nie powiódł się', err);
      hapticNotify('error');
      dispatchCameraUi({
        type: 'SET_CAPTURE_ERROR',
        captureError: t('camera.galleryFailed'),
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
    hapticSelection();
    resetFocus();

    isSwitchingCameraRef.current = true;
    switchRecoveryUsedRef.current = false;

    const nextFacing = facing === 'back' ? 'front' : 'back';
    // Fade the old preview to black first, then remount on the new camera and fade back in on
    // onCameraReady — a crossfade instead of a hard black blink. Opacity only, so it also stays
    // under Reduce Motion.
    previewCoverOpacity.set(withTiming(1, { duration: CAMERA_FLIP_FADE_OUT_MS, easing: SHUTTER_EASE_OUT }));
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    dispatchCameraUi({ type: 'SET_SWITCHING_CAMERA', isSwitchingCamera: true });
    // Cleared on blur, so it only fires while the camera is still on screen.
    flipTimerRef.current = setTimeout(() => {
      flipTimerRef.current = null;
      isSwitchingCameraRef.current = true;
      startCameraSwitch(nextFacing);
    }, CAMERA_FLIP_FADE_OUT_MS);
  };

  const startCameraSwitch = (nextFacing: 'back' | 'front') => {
    disableNativeVideoTorch();
    zoomAtGestureStart.set(0);
    zoomShared.set(0);
    setLensOptions([]);
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
        previewCoverOpacity.set(withTiming(0, { duration: CAMERA_FLIP_FADE_IN_MS }));
        hapticNotify('error');
        dispatchCameraUi({
          type: 'SET_CAPTURE_ERROR',
          captureError: t('camera.switchFailed'),
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
    if (!micGranted) {
      // The mic button is the place to grant access later; it never toggles a muted state the
      // user cannot hear anyway.
      if (micPermission?.canAskAgain === false) {
        Alert.alert(t('camera.microphoneBlockedTitle'), t('camera.microphoneBlockedMessage'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('camera.openSettings'), onPress: () => { void Linking.openSettings(); } },
        ]);
        return;
      }
      void requestMicPermission()
        .then((result) => {
          if (result.granted && recordAudioMuted) dispatchCameraUi({ type: 'TOGGLE_RECORD_AUDIO_MUTED' });
        })
        .catch((error: unknown) => {
          console.warn('Microphone permission request failed', error);
        });
      return;
    }
    dispatchCameraUi({ type: 'TOGGLE_RECORD_AUDIO_MUTED' });
  };

  const permissionGranted = Boolean(permission?.granted);

  return {
    permission,
    requestPermission,
    handleCameraPermission,
    permissionGranted,
    permissionLoadingTimedOut,
    styles,
    colors,
    insets,
    facing,
    flash,
    stillFlashArmed,
    videoTorchRequested,
    recordAudioMuted: effectiveAudioMuted,
    videoPreparing,
    recordingVideo,
    recordingElapsedSec,
    recordingElapsedMs,
    cameraReady,
    cameraActive,
    zoom,
    selectedLens,
    lensOptionId,
    lensOptions,
    showLensSwitcher,
    lensSwitcherEpoch,
    isSwitchingCamera,
    cameraInstanceKey,
    captureMode,
    takingPicture,
    captureError,
    isNativeSimulator,
    frontScreenFlashLit,
    frontRingLightActive,
    cameraRef,
    zoomShared,
    zoomGestureActive,
    previewGesture,
    shutterGesture,
    previewViewRef,
    onPreviewLayout,
    focusIndicator,
    focusLocked: focusIndicator?.locked === true,
    focusSupported,
    focusAtCenter,
    toggleFocusLockAtCenter,
    holdHintVisible,
    dismissHoldHint,
    presetRecipient,
    clearPresetRecipient,
    canExitToChat: returnToChatPeerId !== null,
    exitToChat,
    onCameraReady,
    onAvailableLensesChanged,
    onResponsiveOrientationChanged,
    selectLens,
    animatedShutterStyle,
    animatedShutterInnerStyle,
    animatedFlashStyle,
    previewCoverStyle,
    pickFromGallery,
    toggleFacing,
    toggleFlash,
    toggleRecordingMicMuted,
    takeAccessiblePhoto,
    startAccessibleVideo,
    stopAccessibleVideo,
  };
}
