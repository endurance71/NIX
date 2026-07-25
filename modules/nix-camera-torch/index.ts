import { requireNativeModule } from 'expo';

export type NixCameraTorchStatus = {
  available: boolean;
  enabled: boolean;
};

export type NativeBackLensPreset = {
  id: string;
  kind: string;
  label: string;
  localizedName: string;
  zoom: number;
  displayFactor: number;
};

type NixCameraTorchNativeModule = {
  setTorchEnabledAsync(enabled: boolean): Promise<NixCameraTorchStatus>;
  getTorchStatusAsync(): Promise<NixCameraTorchStatus>;
  getBackLensPresetsAsync(): Promise<NativeBackLensPreset[]>;
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

export async function getBackLensPresetsAsync(): Promise<NativeBackLensPreset[] | null> {
  if (!NixCameraTorch?.getBackLensPresetsAsync) return null;
  try {
    return await NixCameraTorch.getBackLensPresetsAsync();
  } catch {
    return null;
  }
}
