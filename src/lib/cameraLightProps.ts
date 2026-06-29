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
  stillFlashArmed,
  videoTorchRequested,
  videoPreparing,
  recordingVideo,
}: CameraLightState): { flash: CameraFlashMode; enableTorch: boolean } {
  const videoLightActive = videoTorchRequested || videoPreparing || recordingVideo;

  return {
    flash: stillFlashArmed && captureMode === 'picture' ? flash : 'off',
    enableTorch: flash === 'on' && facing === 'back' && videoLightActive,
  };
}
