import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function subscribe(onStoreChange: () => void) {
  const sub = AppState.addEventListener('change', onStoreChange);
  return () => sub.remove();
}

function getSnapshot(): AppStateStatus {
  return AppState.currentState;
}

/** Aktualny stan AppState bez useEffect — zgodne z react-doctor (brak .remove() w cleanup useEffect). */
export function useAppStateSnapshot(): AppStateStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
