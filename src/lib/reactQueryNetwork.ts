import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { getConnectivity, subscribeConnectivity } from './connectivity';

let lifecycleBound = false;
let authOnline = true;

function syncOnlineState() {
  // Physical connectivity comes from the shared store, so React Query pauses with the same
  // (debounced) signal as auth, realtime, the outbox and uploads.
  onlineManager.setOnline(getConnectivity().online && authOnline);
}

export function setReactQueryAuthOnline(online: boolean) {
  authOnline = online;
  syncOnlineState();
}

/** Jednorazowa konfiguracja — RN nie ma domyślnie window focus jak przeglądarka. */
export function bindReactQueryAppLifecycle(): () => void {
  if (lifecycleBound) return () => {};
  lifecycleBound = true;

  const onAppStateChange = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };

  const sub = AppState.addEventListener('change', onAppStateChange);
  const unsubscribeNetwork = subscribeConnectivity(syncOnlineState);
  syncOnlineState();
  if (process.env.EXPO_OS !== 'web') {
    focusManager.setFocused(AppState.currentState === 'active');
  }

  return () => {
    sub.remove();
    unsubscribeNetwork();
    lifecycleBound = false;
  };
}
