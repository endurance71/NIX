import {
  setTorchEnabledAsync,
  type NixCameraTorchStatus,
} from '../../modules/nix-camera-torch';

type CameraFacing = 'back' | 'front';
type CameraFlashMode = 'off' | 'on';

export type VideoTorchSessionState = {
  facing: CameraFacing;
  flash: CameraFlashMode;
  platform?: string;
};

export type VideoTorchController = {
  setTorchEnabledAsync(enabled: boolean): Promise<NixCameraTorchStatus>;
};

const defaultController: VideoTorchController = {
  setTorchEnabledAsync,
};

function shouldUseNativeVideoTorch({
  facing,
  flash,
  platform = process.env.EXPO_OS,
}: VideoTorchSessionState): boolean {
  return platform === 'ios' && facing === 'back' && flash === 'on';
}

export async function setNativeVideoTorchForRecording(
  state: VideoTorchSessionState,
  enabled: boolean,
  controller: VideoTorchController = defaultController
): Promise<NixCameraTorchStatus | null> {
  if (enabled && !shouldUseNativeVideoTorch(state)) {
    return null;
  }

  try {
    return await controller.setTorchEnabledAsync(enabled);
  } catch (error) {
    console.warn('[NixCameraTorch] Could not update native video torch', error);
    return { available: false, enabled: false };
  }
}
