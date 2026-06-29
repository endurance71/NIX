type CameraFacing = 'back' | 'front';
type CameraFlashMode = 'off' | 'on';
type CameraCaptureMode = 'picture' | 'video';

type CameraLightState = {
  captureMode: CameraCaptureMode;
  facing: CameraFacing;
  flash: CameraFlashMode;
  videoPreparing: boolean;
  recordingVideo: boolean;
};

export function getCameraLightProps({
  captureMode,
  facing,
  flash,
  videoPreparing,
  recordingVideo,
}: CameraLightState): { flash: CameraFlashMode; enableTorch: boolean } {
  const videoLightActive = videoPreparing || recordingVideo;

  return {
    flash: captureMode === 'picture' ? flash : 'off',
    enableTorch: flash === 'on' && facing === 'back' && videoLightActive,
  };
}
