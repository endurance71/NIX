import { AppState } from 'react-native';
import { trackEvent } from '../lib/telemetry';

let initialized = false;

export function initBackgroundTaskService(onResume: () => void) {
  if (initialized) return () => {};
  initialized = true;

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      trackEvent('upload_queue_resume_foreground');
      onResume();
    }
  });

  return () => {
    subscription.remove();
    initialized = false;
  };
}
