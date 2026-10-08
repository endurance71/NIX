import { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView } from 'expo-camera';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import type { CameraScreenViewModel } from '../../hooks/useCameraScreen';
import {
  CAMERA_CAPTURE_PROFILE,
  VIDEO_RECORDING_BITRATE,
} from '../../lib/cameraCaptureProfile';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { VIDEO_TOTAL_MAX_DURATION_MS } from '../../lib/videoRecordingLimits';
import { getCameraLightProps } from '../../lib/cameraLightProps';
import { NativeLensSwitcher } from './NativeLensSwitcher';
import { OfflineStatusBanner } from '../auth/OfflineStatusBanner';
import { useTranslation } from 'react-i18next';
import { performCameraAccessibleAction } from '../../lib/cameraAccessibility';

type Props = {
  vm: CameraScreenViewModel;
};

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
    pinchGesture,
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
  const cameraViewKey =
    process.env.EXPO_OS === 'ios'
      ? `${facing}:${cameraInstanceKey}`
      : `${facing}:${captureMode}:${cameraInstanceKey}`;
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

  return (
    <GestureDetector gesture={pinchGesture}>
      <CameraView
        key={cameraViewKey}
        ref={cameraRef}
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
        zoom={zoom}
        pictureSize={CAMERA_CAPTURE_PROFILE.pictureSize}
        videoQuality={CAMERA_CAPTURE_PROFILE.videoQuality}
        videoBitrate={VIDEO_RECORDING_BITRATE}
        videoStabilizationMode={CAMERA_CAPTURE_PROFILE.videoStabilizationMode}
      />
    </GestureDetector>
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
    facing,
    flash,
    toggleFlash,
    videoPreparing,
  } = vm;
  return (
    <View style={styles.topControls}>
      {recordingVideo ? (
        <>
          <View
            style={styles.recordingTimerTopLeft}
            pointerEvents="none"
            accessibilityLiveRegion="polite">
            <View style={styles.recordingPill}>
              <View style={styles.recordingDot} />
              <Text
                style={styles.recordingHudText}
                accessibilityLabel={t('camera.recordingTimer', {
                  seconds: recordingElapsedSec,
                  max: VIDEO_TOTAL_MAX_DURATION_MS / 1000,
                })}>
                {recordingElapsedSec}s / {VIDEO_TOTAL_MAX_DURATION_MS / 1000}s
              </Text>
            </View>
          </View>
          <View style={styles.topControlTrailingSpacer} />
        </>
      ) : (
        <>
          <View style={styles.topLeadingCluster}>
            <NativeChromeIconButton
              name={recordAudioMuted ? 'micOff' : 'mic'}
              onPress={toggleRecordingMicMuted}
              accessibilityLabel={t(recordAudioMuted ? 'camera.enableAudio' : 'camera.muteAudio')}
              disabled={videoPreparing}
              backgroundColor={colors.cameraControlBackground}
              tintColor={colors.cameraControlTint}
            />
            {facing === 'back' ? (
              <NativeChromeIconButton
                name={flash === 'on' ? 'flash' : 'flashOff'}
                onPress={toggleFlash}
                accessibilityLabel={t(
                  flash === 'on' ? 'camera.disableFlash' : 'camera.enableFlash',
                )}
                disabled={videoPreparing}
                backgroundColor={colors.cameraControlBackground}
                tintColor={colors.cameraControlTint}
              />
            ) : (
              <View style={styles.topControlTrailingSpacer} />
            )}
          </View>
        </>
      )}
    </View>
  );
}

function CameraLensSlot({ vm }: Props) {
  const {
    styles,
    colors,
    captureError,
    showLensSwitcher,
    lensSwitcherEpoch,
    lensOptions,
    lensOptionId,
    selectLens,
    takingPicture,
    videoPreparing,
    isSwitchingCamera,
    recordingVideo,
  } = vm;
  const lensSwitcherDisabled =
    takingPicture || videoPreparing || isSwitchingCamera || recordingVideo;
  const activeLensId = lensOptionId ?? lensOptions.find((option) => option.id === '1x')?.id ?? null;
  return captureError ? (
    <View style={styles.captureStatusSlot} pointerEvents="none">
      <Text style={styles.captureError}>{captureError}</Text>
    </View>
  ) : showLensSwitcher ? (
    <View style={styles.lensSwitcherSlot}>
      <NativeLensSwitcher
        key={lensSwitcherEpoch}
        options={lensOptions}
        activeLensId={activeLensId}
        onSelect={selectLens}
        disabled={lensSwitcherDisabled}
        colors={colors}
      />
    </View>
  ) : null;
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
    recordingVideo,
    videoPreparing,
    takingPicture,
    shutterGesture,
    animatedShutterStyle,
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
        accessibilityHint={t(videoActive ? 'camera.stopVideo' : 'camera.shutterHint')}
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
          style={[
            styles.shutterOuter,
            recordingVideo && styles.shutterRecording,
            takingPicture && styles.shutterDisabled,
            animatedShutterStyle,
          ]}>
          <View style={[styles.shutterInner, recordingVideo && styles.shutterInnerRecording]} />
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
    statusBarStyle,
    insets,
    videoPreparing,
    recordingVideo,
    isSwitchingCamera,
    takingPicture,
    animatedFlashStyle,
    pickFromGallery,
    toggleFacing,
  } = vm;

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} hidden={false} />
      <OfflineStatusBanner
        compact
        style={{ position: 'absolute', top: insets.top + 8, zIndex: 30 }}
      />
      <CameraPreview vm={vm} />
      <View style={styles.cameraOverlay}>
        <Animated.View style={[styles.flashOverlay, animatedFlashStyle]} pointerEvents="none" />

        <View
          style={[
            styles.controlsContainer,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottomContentInset },
          ]}>
          <CameraTopControls vm={vm} />

          <View style={styles.bottomControls}>
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

            <View style={styles.shutterStack}>
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
      </View>
    </View>
  );
}
