import { requireNativeModule } from 'expo';

export type NixCameraTorchStatus = {
  available: boolean;
  enabled: boolean;
};

type NixCameraTorchNativeModule = {
  setTorchEnabledAsync(enabled: boolean): Promise<NixCameraTorchStatus>;
  getTorchStatusAsync(): Promise<NixCameraTorchStatus>;
};

let NixCameraTorch: NixCameraTorchNativeModule | null = null;

try {
  NixCameraTorch = requireNativeModule<NixCameraTorchNativeModule>('NixCameraTorch');
} catch (error) {
  console.warn(
    '[NixCameraTorch] Native module not found. Torch control will be disabled until the app is natively rebuilt.',
    error
  );
}

const unavailableStatus: NixCameraTorchStatus = { available: false, enabled: false };

export async function setTorchEnabledAsync(enabled: boolean): Promise<NixCameraTorchStatus> {
  if (!NixCameraTorch) return unavailableStatus;
  return NixCameraTorch.setTorchEnabledAsync(enabled);
}

export async function getTorchStatusAsync(): Promise<NixCameraTorchStatus> {
  if (!NixCameraTorch) return unavailableStatus;
  return NixCameraTorch.getTorchStatusAsync();
}
