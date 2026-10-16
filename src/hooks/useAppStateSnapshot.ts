import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function subscribe(onStoreChange: () => void) {
  const sub = AppState.addEventListener('change', onStoreChange);
  return () => sub.remove();
}

const APP_STATES: readonly string[] = ['active', 'background', 'inactive', 'extension', 'unknown'] satisfies AppStateStatus[];

/** RN 0.88 types `currentState` as `string | null | undefined`; anything else reads as 'unknown'. */
function getSnapshot(): AppStateStatus {
  const state = AppState.currentState;
  return state && APP_STATES.includes(state) ? (state as AppStateStatus) : 'unknown';
}

/** Aktualny stan AppState bez useEffect — zgodne z react-doctor (brak .remove() w cleanup useEffect). */
export function useAppStateSnapshot(): AppStateStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
