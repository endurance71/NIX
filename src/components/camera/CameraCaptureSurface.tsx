import { View, Text, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView } from 'expo-camera';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import type { CameraScreenViewModel } from '../../hooks/useCameraScreen';
import { VIDEO_RECORDING_BITRATE } from '../../hooks/useCameraScreen';
import { AppIcon } from '../ui/app-icon';
import { VIDEO_TOTAL_MAX_DURATION_MS } from '../../lib/videoRecordingLimits';

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
  } = vm;

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
                  <Pressable
                    onPress={toggleRecordingMicMuted}
                    style={styles.iconButton}
                    accessibilityLabel={
                      recordAudioMuted ? 'Włącz nagrywanie dźwięku' : 'Wycisz nagrywanie dźwięku'
                    }
                    hitSlop={15}>
                    <AppIcon
                      name={recordAudioMuted ? 'micOff' : 'mic'}
                      size={22}
                      color={colors.cameraControlTint}
                    />
                  </Pressable>
                  {facing === 'back' ? (
                    <Pressable
                      onPress={toggleFlash}
                      style={styles.iconButton}
                      accessibilityLabel={flash === 'on' ? 'Wyłącz latarkę' : 'Włącz latarkę'}
                      hitSlop={15}>
                      <AppIcon
                        name={flash === 'on' ? 'flash' : 'flashOff'}
                        size={22}
                        color={colors.cameraControlTint}
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
            <View style={styles.sideButtonContainer}>
              <Pressable
                onPress={() => void pickFromGallery()}
                style={styles.iconButton}
                accessibilityLabel="Wybierz z galerii"
                accessibilityRole="button"
                accessibilityState={{ disabled: recordingVideo || isSwitchingCamera || takingPicture }}
                hitSlop={15}
                disabled={recordingVideo || isSwitchingCamera || takingPicture}>
                <AppIcon name="photoLibrary" size={22} color={colors.cameraControlTint} />
              </Pressable>
            </View>

            <View style={styles.shutterStack}>
              {isSwitchingCamera ? (
                <Text style={styles.captureHint}>Przełączanie kamery…</Text>
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
                    takingPicture || isSwitchingCamera || (!isNativeSimulator && !cameraReady && !recordingVideo),
                }}
                disabled={
                  takingPicture || isSwitchingCamera || (!isNativeSimulator && !cameraReady && !recordingVideo)
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
                <AppIcon name="cameraRotate" size={22} color={colors.cameraControlTint} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
