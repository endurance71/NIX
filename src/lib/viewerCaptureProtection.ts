import * as ScreenCapture from 'expo-screen-capture';

const VIEWER_CAPTURE_GUARD_KEY = 'viewer-capture-guard';
const APP_SWITCHER_BLUR_INTENSITY = 0.72;

let transitionQueue: Promise<void> = Promise.resolve();

async function disableNativeProtection() {
  let firstError: unknown;

  try {
    await ScreenCapture.allowScreenCaptureAsync(VIEWER_CAPTURE_GUARD_KEY);
  } catch (error) {
    firstError = error;
  }

  try {
    await ScreenCapture.disableAppSwitcherProtectionAsync();
  } catch (error) {
    firstError ??= error;
  }

  if (firstError) throw firstError;
}

async function enableNativeProtection() {
  try {
    await ScreenCapture.preventScreenCaptureAsync(VIEWER_CAPTURE_GUARD_KEY);
    await ScreenCapture.enableAppSwitcherProtectionAsync(APP_SWITCHER_BLUR_INTENSITY);
  } catch (error) {
    // `preventScreenCaptureAsync` may have completed before the second call failed.
    // Always roll both native mechanisms back before exposing the failure.
    await disableNativeProtection().catch(() => {});
    throw error;
  }
}

function enqueueTransition(operation: () => Promise<void>) {
  const result = transitionQueue.catch(() => {}).then(operation);
  transitionQueue = result.catch(() => {});
  return result;
}

export function enableViewerCaptureProtection() {
  return enqueueTransition(enableNativeProtection);
}

export function disableViewerCaptureProtection() {
  return enqueueTransition(disableNativeProtection);
}

export function __resetViewerCaptureProtectionForTests() {
  transitionQueue = Promise.resolve();
}
