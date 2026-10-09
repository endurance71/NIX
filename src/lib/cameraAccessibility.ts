export type CameraAccessibleAction = 'activate' | 'startVideo' | 'stopVideo';

export function performCameraAccessibleAction(
  action: string,
  state: { recording: boolean; preparing: boolean; disabled: boolean },
  handlers: { photo: () => void; startVideo: () => void; stopVideo: () => void }
) {
  if (state.disabled) return;
  if ((action === 'stopVideo' || action === 'activate') && (state.recording || state.preparing)) {
    handlers.stopVideo();
  } else if (action === 'startVideo' && !state.recording && !state.preparing) {
    handlers.startVideo();
  } else if (action === 'activate' && !state.recording && !state.preparing) {
    handlers.photo();
  }
}

export function adjustTextSize(size: number, action: 'increment' | 'decrement', min: number, max: number) {
  return Math.max(min, Math.min(max, size + (action === 'increment' ? 1 : -1)));
}
