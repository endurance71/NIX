import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';

let lifecycleBound = false;

/** Jednorazowa konfiguracja — RN nie ma domyślnie window focus jak przeglądarka. */
export function bindReactQueryAppLifecycle(): () => void {
  if (lifecycleBound) return () => {};
  lifecycleBound = true;

  const onAppStateChange = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };

  const sub = AppState.addEventListener('change', onAppStateChange);
  if (process.env.EXPO_OS !== 'web') {
    focusManager.setFocused(AppState.currentState === 'active');
  }

  return () => sub.remove();
}
