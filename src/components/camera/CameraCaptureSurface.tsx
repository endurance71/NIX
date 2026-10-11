import { useEffect, useMemo, useRef, useState, type ComponentProps, type RefObject } from 'react';
import { View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView } from 'expo-camera';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Canvas, Group, Path, Skia, vec } from '@shopify/react-native-skia';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector } from 'react-native-gesture-handler';
import type { CameraFocusIndicator, CameraScreenViewModel } from '../../hooks/useCameraScreen';
import {
  CAMERA_CAPTURE_PROFILE,
  VIDEO_RECORDING_BITRATE,
} from '../../lib/cameraCaptureProfile';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { NativeGlassPill } from '../ui/native-glass-pill';
import { VIDEO_TOTAL_MAX_DURATION_MS } from '../../lib/videoRecordingLimits';
import { getCameraLightProps } from '../../lib/cameraLightProps';
import { NativeLensSwitcher } from './NativeLensSwitcher';
import { OfflineStatusBanner } from '../auth/OfflineStatusBanner';
import { useTranslation } from 'react-i18next';
import { performCameraAccessibleAction } from '../../lib/cameraAccessibility';
import { formatRecordingClock, recordingProgress } from '../../lib/cameraRecordingClock';
import {
  effectiveZoomFactor,
  formatZoomFactorLabel,
  isZoomedAwayFromPreset,
} from '../../lib/cameraLenses';
import { useMotionEnabled } from '../../theme/motion';

type Props = {
  vm: CameraScreenViewModel;
};

/** While a gesture is zooming, push every Nth UI-thread zoom change to the native preview. */
const LIVE_ZOOM_FRAME_STRIDE = 3;
/** Pill sizes of the RN chrome they replaced. */
const RECIPIENT_CHIP_MAX_WIDTH = 200;
const RECORDING_DOT_SIZE = 10;
const CAPTURE_ERROR_MAX_WIDTH = 220;

type ZoomedCameraViewProps = Omit<ComponentProps<typeof CameraView>, 'zoom' | 'ref'> & {
  cameraRef: RefObject<CameraView | null>;
  /** Committed zoom; seeds the preview on mount. */
  initialZoom: number;
  zoomShared: SharedValue<number>;
  zoomGestureActive: SharedValue<boolean>;
};

/**
 * Owns the live zoom of the preview (PERF-12). Pinch / hold-to-record zoom only writes
 * `zoomShared` on the UI thread; this component alone re-renders (~20/s while zooming, throttled)
 * so the shutter, lens switcher and top controls stay still. Any other zoom change (lens preset,
 * camera flip, committed state) flows through `zoomShared` too and is applied immediately, and the
 * final value of a gesture is always delivered when it ends.
 */
function ZoomedCameraView({
  cameraRef,
  initialZoom,
  zoomShared,
  zoomGestureActive,
  ...cameraProps
}: ZoomedCameraViewProps) {
  const [zoom, setZoom] = useState(initialZoom);
  const lastSentZoom = useSharedValue(initialZoom);
  const frameTick = useSharedValue(0);

  useAnimatedReaction(
    () => ({ nextZoom: zoomShared.get(), gestureActive: zoomGestureActive.get() }),
    ({ nextZoom, gestureActive }) => {
      if (nextZoom === lastSentZoom.get()) return;
      if (gestureActive) {
        const tick = frameTick.get() + 1;
        frameTick.set(tick);
        if (tick % LIVE_ZOOM_FRAME_STRIDE !== 0) return;
      } else {
        frameTick.set(0);
      }
      lastSentZoom.set(nextZoom);
      scheduleOnRN(setZoom, nextZoom);
    }
  );

  return <CameraView ref={cameraRef} {...cameraProps} zoom={zoom} />;
}

function CameraPreview({ vm }: Props) {
  const {
    styles,
    facing,
    flash,
    stillFlashArmed,
    videoTorchRequested,
    recordAudioMuted,
    videoPreparing,
    recordingVideo,
    cameraReady,
    cameraActive,
    zoom,
    selectedLens,
    cameraInstanceKey,
    captureMode,
    cameraRef,
    zoomShared,
    zoomGestureActive,
    previewGesture,
    previewViewRef,
    onPreviewLayout,
    focusSupported,
    focusLocked,
    focusAtCenter,
    toggleFocusLockAtCenter,
    onCameraReady,
    onAvailableLensesChanged,
    onResponsiveOrientationChanged,
  } = vm;
  const cameraLightProps = getCameraLightProps({
    captureMode,
    facing,
    flash,
    stillFlashArmed,
    videoTorchRequested,
    videoPreparing,
    recordingVideo,
  });
  const cameraViewKey = `${facing}:${cameraInstanceKey}`;
  const cameraViewMode = captureMode;
  const previousCameraPropsLogKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;

    const logKey = JSON.stringify({
      facing,
      captureMode,
      flash,
      stillFlashArmed,
      videoTorchRequested,
      videoPreparing,
      recordingVideo,
      cameraReady,
      cameraActive,
      selectedLens,
      propFlash: cameraLightProps.flash,
      propEnableTorch: cameraLightProps.enableTorch,
      cameraViewMode,
    });

    if (previousCameraPropsLogKeyRef.current === logKey) return;
    previousCameraPropsLogKeyRef.current = logKey;

    console.info('[CameraViewProps]', {
      wallTimeMs: Date.now(),
      key: cameraViewKey,
      facing,
      captureMode,
      cameraViewMode,
      userFlash: flash,
      stillFlashArmed,
      videoTorchRequested,
      videoPreparing,
      recordingVideo,
      cameraReady,
      cameraActive,
      selectedLens,
      propFlash: cameraLightProps.flash,
      propEnableTorch: cameraLightProps.enableTorch,
      recordAudioMuted,
      zoom,
    });
  }, [
    cameraActive,
    cameraInstanceKey,
    cameraViewKey,
    cameraViewMode,
    cameraLightProps.enableTorch,
    cameraLightProps.flash,
    cameraReady,
    captureMode,
    facing,
    flash,
    recordAudioMuted,
    recordingVideo,
    selectedLens,
    stillFlashArmed,
    videoPreparing,
    videoTorchRequested,
    zoom,
  ]);

  const { t } = useTranslation();
  const focusActions = focusSupported
    ? [
        { name: 'focusCenter', label: t('camera.focusCenterAction') },
        {
          name: 'toggleFocusLock',
          label: t(focusLocked ? 'camera.unlockFocusAction' : 'camera.lockFocusAction'),
        },
      ]
    : [];

  return (
    <GestureDetector gesture={previewGesture}>
      {/* Tap = focus + exposure, hold = AE/AF lock, pinch = zoom; VoiceOver gets actions. */}
      <View
        ref={previewViewRef}
        style={styles.previewTouchArea}
        onLayout={onPreviewLayout}
        accessible
        accessibilityLabel={t('camera.previewA11y')}
        accessibilityActions={focusActions}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'focusCenter') focusAtCenter();
          else if (event.nativeEvent.actionName === 'toggleFocusLock') toggleFocusLockAtCenter();
        }}>
      <ZoomedCameraView
        key={cameraViewKey}
        cameraRef={cameraRef}
        initialZoom={zoom}
        zoomShared={zoomShared}
        zoomGestureActive={zoomGestureActive}
        style={styles.camera}
        facing={facing}
        mirror={facing === 'front'}
        mode={cameraViewMode}
        mute={recordAudioMuted}
        flash={cameraLightProps.flash}
        enableTorch={cameraLightProps.enableTorch}
        onCameraReady={onCameraReady}
        onAvailableLensesChanged={onAvailableLensesChanged}
        responsiveOrientationWhenOrientationLocked
        onResponsiveOrientationChanged={onResponsiveOrientationChanged}
        selectedLens={selectedLens ?? undefined}
        active={cameraActive}
        pictureSize={CAMERA_CAPTURE_PROFILE.pictureSize}
        videoQuality={CAMERA_CAPTURE_PROFILE.videoQuality}
        videoBitrate={VIDEO_RECORDING_BITRATE}
        videoStabilizationMode={CAMERA_CAPTURE_PROFILE.videoStabilizationMode}
      />
      </View>
    </GestureDetector>
  );
}

const FOCUS_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** How long an unlocked focus square stays before it fades (Camera app ~1 s). */
const FOCUS_INDICATOR_HOLD_MS = 1100;

/** Focus square at the tap; stays while AE/AF is locked. Reduce Motion: fade only, no shrink. */
function FocusIndicatorSquare({
  indicator,
  style,
}: {
  indicator: CameraFocusIndicator;
  style: CameraScreenViewModel['styles']['focusIndicator'];
}) {
  const motionEnabled = useMotionEnabled();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.set(
      motionEnabled
        ? withSequence(
            withTiming(1.35, { duration: 0 }),
            withTiming(1, { duration: 250, easing: FOCUS_EASE_OUT })
          )
        : 1
    );
    opacity.set(
      indicator.locked
        ? withTiming(1, { duration: 120 })
        : withSequence(
            withTiming(1, { duration: 120 }),
            withDelay(FOCUS_INDICATOR_HOLD_MS, withTiming(0, { duration: 300 }))
          )
    );
  }, [indicator.key, indicator.locked, motionEnabled, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));
  // A locked square cleared by a lens change, flip or leaving fades from where it is (an
  // already faded one stays invisible) instead of vanishing.
  const exiting = () => {
    'worklet';
    return {
      initialValues: { opacity: opacity.get() },
      animations: { opacity: withTiming(0, { duration: 150 }) },
    };
  };

  return (
    <Animated.View
      pointerEvents="none"
      exiting={exiting}
      style={[style, { left: indicator.left, top: indicator.top }, animatedStyle]}
    />
  );
}

const RING_SIZE = 76;
const RING_STROKE = 4;

/** Red arc around the shutter filling up over the 180 s limit; driven on the UI thread. */
function RecordingProgressRing({
  elapsedMs,
  color,
  style,
}: {
  elapsedMs: SharedValue<number>;
  color: string;
  style: CameraScreenViewModel['styles']['recordingRing'];
}) {
  const progress = useDerivedValue(() =>
    recordingProgress(elapsedMs.get(), VIDEO_TOTAL_MAX_DURATION_MS)
  );
  const circle = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(RING_SIZE / 2, RING_SIZE / 2, (RING_SIZE - RING_STROKE) / 2);
    return path;
  }, []);

  return (
    <View style={style} pointerEvents="none">
      <Canvas style={{ width: RING_SIZE, height: RING_SIZE }}>
        {/* Start at 12 o'clock. */}
        <Group origin={vec(RING_SIZE / 2, RING_SIZE / 2)} transform={[{ rotate: -Math.PI / 2 }]}>
          <Path
            path={circle}
            style="stroke"
            strokeWidth={RING_STROKE}
            strokeCap="round"
            color={color}
            start={0}
            end={progress}
          />
        </Group>
      </Canvas>
    </View>
  );
}

function RecipientChip({ vm }: Props) {
  const { t } = useTranslation();
  const { colors, presetRecipient, clearPresetRecipient, recordingVideo, videoPreparing } = vm;
  if (!presetRecipient) return null;
  const username = presetRecipient.username;
  return (
    <NativeGlassPill
      label={t('camera.recipientChip', { username })}
      accessibilityLabel={t('camera.recipientChipA11y', { username })}
      tintColor={colors.cameraControlTint}
      fill={colors.cameraControlBackground}
      maxWidth={RECIPIENT_CHIP_MAX_WIDTH}
      trailingAction={
        recordingVideo || videoPreparing
          ? null
          : { icon: 'close', accessibilityLabel: t('camera.clearRecipient'), onPress: clearPresetRecipient }
      }
    />
  );
}

function CameraTopControls({ vm }: Props) {
  const { t } = useTranslation();
  const {
    styles,
    colors,
    recordingVideo,
    recordingElapsedSec,
    recordAudioMuted,
    toggleRecordingMicMuted,
    flash,
    toggleFlash,
    videoPreparing,
  } = vm;
  const maxSeconds = VIDEO_TOTAL_MAX_DURATION_MS / 1000;
  return (
    <View style={styles.topControls} pointerEvents="box-none">
      {recordingVideo ? (
        <View style={styles.recordingTimerTopLeft} pointerEvents="none">
          <NativeGlassPill
            label={t('camera.recordingClock', {
              elapsed: formatRecordingClock(recordingElapsedSec * 1000),
              max: formatRecordingClock(VIDEO_TOTAL_MAX_DURATION_MS),
            })}
            accessibilityLabel={t('camera.recordingTimer', {
              seconds: recordingElapsedSec,
              max: maxSeconds,
            })}
            leadingIcon="circleFill"
            leadingIconColor={colors.destructive}
            leadingIconSize={RECORDING_DOT_SIZE}
            tintColor={colors.cameraControlTint}
            fill={colors.cameraControlBackground}
            textStyle="callout"
            weight="bold"
            monospacedDigits
          />
        </View>
      ) : (
        <View style={styles.topLeadingCluster}>
          {vm.canExitToChat ? (
            <NativeChromeIconButton
              name="close"
              onPress={vm.exitToChat}
              accessibilityLabel={t('camera.backToChat')}
              disabled={videoPreparing}
              backgroundColor={colors.cameraControlBackground}
              tintColor={colors.cameraControlTint}
            />
          ) : null}
          <NativeChromeIconButton
            name={recordAudioMuted ? 'micOff' : 'mic'}
            onPress={toggleRecordingMicMuted}
            accessibilityLabel={t('camera.microphoneLabel')}
            accessibilityValue={t(recordAudioMuted ? 'camera.stateOff' : 'camera.stateOn')}
            disabled={videoPreparing}
            backgroundColor={colors.cameraControlBackground}
            tintColor={colors.cameraControlTint}
          />
          {/* On the front camera the flash is the app's white screen at full brightness. */}
          <NativeChromeIconButton
            name={flash === 'on' ? 'flash' : 'flashOff'}
            onPress={toggleFlash}
            accessibilityLabel={t('camera.flashLabel')}
            accessibilityValue={t(flash === 'on' ? 'camera.stateOn' : 'camera.stateOff')}
            disabled={videoPreparing}
            backgroundColor={colors.cameraControlBackground}
            tintColor={colors.cameraControlTint}
          />
        </View>
      )}
      {vm.presetRecipient ? (
        <RecipientChip vm={vm} />
      ) : (
        <View style={styles.topControlTrailingSpacer} pointerEvents="none" />
      )}
    </View>
  );
}

function CameraLensSlot({ vm }: Props) {
  const { i18n } = useTranslation();
  const {
    styles,
    colors,
    showLensSwitcher,
    lensSwitcherEpoch,
    lensOptions,
    lensOptionId,
    selectLens,
    takingPicture,
    videoPreparing,
    isSwitchingCamera,
    recordingVideo,
    zoom,
  } = vm;
  if (!showLensSwitcher) return null;
  const lensSwitcherDisabled =
    takingPicture || videoPreparing || isSwitchingCamera || recordingVideo;
  const activeLensId = lensOptionId ?? lensOptions.find((option) => option.id === '1x')?.id ?? null;
  const activeOption = lensOptions.find((option) => option.id === activeLensId) ?? null;
  // After a pinch the active chip shows the live factor (e.g. "1,6×"), like the Camera app.
  const activeLabelOverride =
    activeOption && isZoomedAwayFromPreset(activeOption, zoom, lensOptions)
      ? formatZoomFactorLabel(effectiveZoomFactor(activeOption, zoom, lensOptions), i18n.language)
      : null;
  return (
    <View style={styles.lensSwitcherSlot} pointerEvents="box-none">
      <NativeLensSwitcher
        key={lensSwitcherEpoch}
        options={lensOptions}
        activeLensId={activeLensId}
        activeLabelOverride={activeLabelOverride}
        onSelect={selectLens}
        disabled={lensSwitcherDisabled}
        colors={colors}
      />
    </View>
  );
}

/** Error / notice pill (hides itself after ~3 s) or the one-time "Hold to record" hint. */
function CameraStatusSlot({ vm }: Props) {
  const { t } = useTranslation();
  const { styles, colors, captureError, holdHintVisible, dismissHoldHint, recordingVideo, videoPreparing } =
    vm;
  if (captureError) {
    return (
      <View style={styles.captureStatusSlot} pointerEvents="none">
        <NativeGlassPill
          label={captureError}
          tintColor={colors.cameraControlTint}
          fill={colors.cameraControlBackground}
          weight="regular"
          numberOfLines={0}
          cornerRadius={14}
          maxWidth={CAPTURE_ERROR_MAX_WIDTH}
          size="compact"
        />
      </View>
    );
  }
  if (!holdHintVisible || recordingVideo || videoPreparing) return null;
  return (
    <View style={styles.captureStatusSlot} pointerEvents="box-none">
      <NativeGlassPill
        label={t('camera.holdToRecordHint')}
        onPress={dismissHoldHint}
        trailingIcon="close"
        accessibilityLabel={t('camera.holdToRecordHintA11y')}
        accessibilityHint={t('camera.dismissHint')}
        tintColor={colors.cameraControlTint}
        fill={colors.cameraControlBackground}
      />
    </View>
  );
}

function isCameraShutterDisabled(vm: CameraScreenViewModel) {
  return (
    vm.takingPicture ||
    vm.isSwitchingCamera ||
    (!vm.isNativeSimulator && !vm.cameraReady && !vm.videoPreparing && !vm.recordingVideo)
  );
}

function CameraShutter({ vm }: Props) {
  const { t } = useTranslation();
  const {
    styles,
    colors,
    recordingVideo,
    videoPreparing,
    takingPicture,
    shutterGesture,
    animatedShutterStyle,
    animatedShutterInnerStyle,
    recordingElapsedMs,
  } = vm;
  const shutterDisabled = isCameraShutterDisabled(vm);
  const accessibleShutterAction = (action: string) =>
    performCameraAccessibleAction(
      action,
      { recording: vm.recordingVideo, preparing: vm.videoPreparing, disabled: shutterDisabled },
      {
        photo: vm.takeAccessiblePhoto,
        startVideo: vm.startAccessibleVideo,
        stopVideo: vm.stopAccessibleVideo,
      },
    );
  const videoActive = recordingVideo || videoPreparing;
  return (
    <GestureDetector gesture={shutterGesture}>
      <Animated.View
        accessible
        accessibilityLabel={t(videoActive ? 'camera.stopVideo' : 'camera.takePhoto')}
        accessibilityHint={videoActive ? undefined : t('camera.shutterHint')}
        accessibilityRole="button"
        onAccessibilityTap={() => accessibleShutterAction('activate')}
        accessibilityActions={[
          { name: 'activate', label: t(videoActive ? 'camera.stopVideo' : 'camera.takePhoto') },
          {
            name: videoActive ? 'stopVideo' : 'startVideo',
            label: t(videoActive ? 'camera.stopVideo' : 'camera.startVideo'),
          },
        ]}
        onAccessibilityAction={(event) => accessibleShutterAction(event.nativeEvent.actionName)}
        accessibilityState={{
          disabled: shutterDisabled,
        }}
        style={[styles.shutterHitArea, takingPicture && styles.shutterDisabled]}>
        <Animated.View
          style={[styles.shutterOuter, recordingVideo && styles.shutterRecording, animatedShutterStyle]}>
          <Animated.View style={[styles.shutterInner, animatedShutterInnerStyle]} />
          {recordingVideo ? (
            <RecordingProgressRing
              elapsedMs={recordingElapsedMs}
              color={colors.destructive}
              style={styles.recordingRing}
            />
          ) : null}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

export function CameraCaptureSurface({ vm }: Props) {
  const { t } = useTranslation();
  const {
    styles,
    colors,
    insets,
    videoPreparing,
    recordingVideo,
    isSwitchingCamera,
    takingPicture,
    animatedFlashStyle,
    previewCoverStyle,
    pickFromGallery,
    toggleFacing,
    frontScreenFlashLit,
    frontRingLightActive,
    focusIndicator,
    focusLocked,
  } = vm;

  return (
    <View style={styles.container}>
      {/* The preview is always dark, in light mode too. */}
      <StatusBar style="light" hidden={false} />
      <OfflineStatusBanner
        compact
        style={{ position: 'absolute', top: insets.top + 8, zIndex: 30 }}
      />
      <CameraPreview vm={vm} />
      <Animated.View style={[styles.previewCover, previewCoverStyle]} pointerEvents="none" />
      {focusIndicator ? (
        <FocusIndicatorSquare indicator={focusIndicator} style={styles.focusIndicator} />
      ) : null}
      {frontRingLightActive ? (
        <>
          <View style={styles.frontRecordingWash} pointerEvents="none" />
          <View style={styles.frontRingLight} pointerEvents="none" />
        </>
      ) : null}
      {/* box-none: empty areas fall through to the preview (tap to focus, pinch). */}
      <View style={styles.cameraOverlay} pointerEvents="box-none">
        <Animated.View style={[styles.flashOverlay, animatedFlashStyle]} pointerEvents="none" />

        <View
          pointerEvents="box-none"
          style={[
            styles.controlsContainer,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottomContentInset },
          ]}>
          <CameraTopControls vm={vm} />

          <View style={styles.bottomControls} pointerEvents="box-none">
            <View style={styles.sideButtonContainer}>
              <NativeChromeIconButton
                name="photoLibrary"
                onPress={() => void pickFromGallery()}
                accessibilityLabel={t('camera.pickGallery')}
                disabled={videoPreparing || recordingVideo || isSwitchingCamera || takingPicture}
                backgroundColor={colors.cameraControlBackground}
                tintColor={colors.cameraControlTint}
              />
            </View>

            <View style={styles.shutterStack} pointerEvents="box-none">
              <CameraStatusSlot vm={vm} />
              <CameraLensSlot vm={vm} />
              <CameraShutter vm={vm} />
            </View>

            <View style={styles.sideButtonContainer}>
              <NativeChromeIconButton
                name="cameraRotate"
                onPress={toggleFacing}
                accessibilityLabel={t('camera.switchCamera')}
                disabled={videoPreparing || recordingVideo || isSwitchingCamera}
                backgroundColor={colors.cameraControlBackground}
                tintColor={colors.cameraControlTint}
              />
            </View>
          </View>
        </View>
        {focusLocked ? (
          <View
            style={[styles.focusLockBadgeSlot, { top: insets.top + 72 }]}
            pointerEvents="none">
            <Text style={styles.focusLockBadge}>{t('camera.focusLocked')}</Text>
          </View>
        ) : null}
      </View>
      {/* Above every control, like the Camera app's front flash. */}
      {frontScreenFlashLit ? <View style={styles.frontScreenFlash} pointerEvents="none" /> : null}
    </View>
  );
}
