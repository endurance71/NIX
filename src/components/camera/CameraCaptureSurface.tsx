import { View, Text, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView } from 'expo-camera';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import type { CameraScreenViewModel } from '../../hooks/useCameraScreen';
import { VIDEO_RECORDING_BITRATE } from '../../hooks/useCameraScreen';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { VIDEO_TOTAL_MAX_DURATION_MS } from '../../lib/videoRecordingLimits';
import { getCameraLightProps } from '../../lib/cameraLightProps';

type Props = {
  vm: CameraScreenViewModel;
};

export function CameraCaptureSurface({ vm }: Props) {
  const {
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

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} hidden />
      <GestureDetector gesture={pinchGesture}>
        <CameraView
          key={`${facing}:${captureMode}:${cameraInstanceKey}`}
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          mode={captureMode}
          mute={recordAudioMuted}
          flash={cameraLightProps.flash}
          enableTorch={cameraLightProps.enableTorch}
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

        <View
          style={[
            styles.controlsContainer,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottomContentInset },
          ]}>
          <View style={styles.topControls}>
            {recordingVideo ? (
              <>
                <View style={styles.recordingTimerTopLeft} pointerEvents="none" accessibilityLiveRegion="polite">
                  <View style={styles.recordingPill}>
                    <View style={styles.recordingDot} />
                    <Text
                      style={styles.recordingHudText}
                      accessibilityLabel={`Nagrywanie ${recordingElapsedSec} sekund z ${VIDEO_TOTAL_MAX_DURATION_MS / 1000}`}>
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
                    accessibilityLabel={
                      recordAudioMuted ? 'Włącz nagrywanie dźwięku' : 'Wycisz nagrywanie dźwięku'
                    }
                    disabled={videoPreparing}
                    backgroundColor={colors.cameraControlBackground}
                    tintColor={colors.cameraControlTint}
                  />
                  {facing === 'back' ? (
                    <NativeChromeIconButton
                      name={flash === 'on' ? 'flash' : 'flashOff'}
                      onPress={toggleFlash}
                      accessibilityLabel={
                        flash === 'on' ? 'Wyłącz lampę błyskową' : 'Włącz lampę błyskową'
                      }
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

          <View style={styles.bottomControls}>
            <View style={styles.sideButtonContainer}>
              <NativeChromeIconButton
                name="photoLibrary"
                onPress={() => void pickFromGallery()}
                accessibilityLabel="Wybierz z galerii"
                disabled={videoPreparing || recordingVideo || isSwitchingCamera || takingPicture}
                backgroundColor={colors.cameraControlBackground}
                tintColor={colors.cameraControlTint}
              />
            </View>

            <View style={styles.shutterStack}>
              {captureError ? (
                <View style={styles.captureStatusSlot} pointerEvents="none">
                  <Text style={styles.captureError}>{captureError}</Text>
                </View>
              ) : null}
              <Pressable
                onPressIn={onShutterPressIn}
                onPressOut={onShutterPressOut}
                accessibilityLabel="Dotknij dla zdjęcia; przytrzymaj, aby nagrywać wideo, puść, aby zakończyć"
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    takingPicture ||
                    isSwitchingCamera ||
                    (!isNativeSimulator && !cameraReady && !videoPreparing && !recordingVideo),
                }}
                disabled={
                  takingPicture ||
                  isSwitchingCamera ||
                  (!isNativeSimulator && !cameraReady && !videoPreparing && !recordingVideo)
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
              <NativeChromeIconButton
                name="cameraRotate"
                onPress={toggleFacing}
                accessibilityLabel="Zmień kamerę"
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
