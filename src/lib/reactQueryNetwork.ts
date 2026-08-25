import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

let lifecycleBound = false;
let physicalOnline = true;
let authOnline = true;

function syncOnlineState() {
  onlineManager.setOnline(physicalOnline && authOnline);
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
  const unsubscribeNetwork = NetInfo.addEventListener((state) => {
    physicalOnline = state.isConnected !== false && state.isInternetReachable !== false;
    syncOnlineState();
  });
  if (process.env.EXPO_OS !== 'web') {
    focusManager.setFocused(AppState.currentState === 'active');
  }

  return () => {
    sub.remove();
    unsubscribeNetwork();
    lifecycleBound = false;
  };
}
