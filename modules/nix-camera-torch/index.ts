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
  // Added after build 11; older binaries running a newer bundle do not have them.
  boostScreenBrightnessAsync?: () => Promise<boolean>;
  consumeLockedCapturesAsync?: () => Promise<string[]>;
  restoreScreenBrightnessAsync?: () => Promise<boolean>;
  // Added after build 11 (tap-to-focus, Camera Control / volume shutter).
  setFocusPointAsync?: (options: NativeFocusPointOptions) => Promise<NixFocusPointResult>;
  resetFocusAsync?: () => Promise<boolean>;
  setCaptureEventsEnabledAsync?: (enabled: boolean) => Promise<boolean>;
  addListener?: (
    eventName: 'onCaptureEvent',
    listener: (event: NixCaptureEvent) => void
  ) => { remove: () => void };
};

type NativeFocusPointOptions = {
  windowX: number;
  windowY: number;
  fallbackX: number;
  fallbackY: number;
  facing: 'back' | 'front';
  lensName: string | null;
  lock: boolean;
};

export type NixFocusPointRequest = NativeFocusPointOptions;

export type NixFocusPointResult = {
  applied: boolean;
  focusSupported: boolean;
  exposureSupported: boolean;
  convertedByPreview?: boolean;
  deviceX?: number;
  deviceY?: number;
};

/** A press of Camera Control (iPhone 16+) or a volume button while the camera is in use. */
export type NixCaptureEvent = { phase: 'began' | 'ended' | 'cancelled' };

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

/** Full screen brightness for the front "flash"; resolves false when the binary lacks it. */
export async function boostScreenBrightnessAsync(): Promise<boolean> {
  if (!NixCameraTorch?.boostScreenBrightnessAsync) return false;
  try {
    return await NixCameraTorch.boostScreenBrightnessAsync();
  } catch {
    return false;
  }
}

/** Puts back the brightness saved by the first boost; a no-op when nothing is boosted. */
export async function restoreScreenBrightnessAsync(): Promise<boolean> {
  if (!NixCameraTorch?.restoreScreenBrightnessAsync) return false;
  try {
    return await NixCameraTorch.restoreScreenBrightnessAsync();
  } catch {
    return false;
  }
}

const focusUnavailable: NixFocusPointResult = {
  applied: false,
  focusSupported: false,
  exposureSupported: false,
};

/** Whether this binary can set a focus / exposure point (tap-to-focus). */
export function isFocusPointSupported(): boolean {
  return Boolean(NixCameraTorch?.setFocusPointAsync);
}

/** Focus + exposure point on the running camera; resolves "not applied" on older binaries. */
export async function setFocusPointAsync(request: NixFocusPointRequest): Promise<NixFocusPointResult> {
  if (!NixCameraTorch?.setFocusPointAsync) return focusUnavailable;
  try {
    return await NixCameraTorch.setFocusPointAsync(request);
  } catch {
    return focusUnavailable;
  }
}

/** Continuous AF/AE at the centre again on every device a focus call touched. */
export async function resetFocusAsync(): Promise<boolean> {
  if (!NixCameraTorch?.resetFocusAsync) return false;
  try {
    return await NixCameraTorch.resetFocusAsync();
  } catch {
    return false;
  }
}

/** Whether this binary can use Camera Control / volume buttons as a shutter. */
export function isCaptureEventsSupported(): boolean {
  return Boolean(NixCameraTorch?.setCaptureEventsEnabledAsync && NixCameraTorch.addListener);
}

/**
 * Routes Camera Control / volume presses to the app (iOS 17.2+). While enabled the volume
 * buttons do not change the volume, so enable it only while the camera is on screen.
 * Resolves false on older iOS or binaries without the function.
 */
export async function setCaptureEventsEnabledAsync(enabled: boolean): Promise<boolean> {
  if (!NixCameraTorch?.setCaptureEventsEnabledAsync) return false;
  try {
    return await NixCameraTorch.setCaptureEventsEnabledAsync(enabled);
  } catch {
    return false;
  }
}

export function addCaptureEventListener(listener: (event: NixCaptureEvent) => void): {
  remove: () => void;
} {
  if (!NixCameraTorch?.addListener) return { remove: () => {} };
  try {
    return NixCameraTorch.addListener('onCaptureEvent', listener);
  } catch {
    return { remove: () => {} };
  }
}

/** Photos from the Lock Screen camera extension (oldest first); empty on older binaries. */
export async function consumeLockedCapturesAsync(): Promise<string[]> {
  if (!NixCameraTorch?.consumeLockedCapturesAsync) return [];
  try {
    return await NixCameraTorch.consumeLockedCapturesAsync();
  } catch {
    return [];
  }
}
