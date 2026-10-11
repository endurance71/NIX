type CameraFacing = 'back' | 'front';
type CameraFlashMode = 'off' | 'on';
type CameraCaptureMode = 'picture' | 'video';

type CameraLightState = {
  captureMode: CameraCaptureMode;
  facing: CameraFacing;
  flash: CameraFlashMode;
  stillFlashArmed: boolean;
  videoTorchRequested: boolean;
  videoPreparing: boolean;
  recordingVideo: boolean;
};

export function getCameraLightProps({
  captureMode,
  facing,
  flash,
  videoTorchRequested,
  videoPreparing,
  recordingVideo,
}: CameraLightState): { flash: CameraFlashMode; enableTorch: boolean } {
  const videoLightActive = captureMode === 'video' && (videoTorchRequested || videoPreparing || recordingVideo);

  return {
    // The rear flash follows the toggle right away, so the native side can prepare the flash
    // shot before the shutter (arming it only at capture cost ~1-3 s per photo). The front
    // camera has no LED; its "flash" is the app's white screen (see useCameraScreen).
    flash: captureMode === 'picture' && facing === 'back' ? flash : 'off',
    enableTorch: flash === 'on' && facing === 'back' && videoLightActive,
  };
}
