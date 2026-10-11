import { useSyncExternalStore } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Single source of truth for physical connectivity. Before this, five modules each listened to
 * NetInfo with slightly different rules (`isConnected` vs `isInternetReachable`), so one flaky
 * reachability probe could unmount realtime, restart the auth bootstrap and requeue uploads.
 *
 * Going offline is debounced (a short blip is ignored); coming back online applies immediately.
 */
export type Connectivity = {
  online: boolean;
  /** False until NetInfo reported at least once; consumers should treat that as online. */
  known: boolean;
};

const OFFLINE_DEBOUNCE_MS = 2_000;

let current: Connectivity = { online: true, known: false };
let offlineTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeNetInfo: (() => void) | null = null;
const listeners = new Set<() => void>();

export function isNetInfoStateOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

function publish(next: Connectivity) {
  if (next.online === current.online && next.known === current.known) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function clearOfflineTimer() {
  if (offlineTimer) clearTimeout(offlineTimer);
  offlineTimer = null;
}

/** Exported for tests; production input comes from NetInfo. */
export function applyNetInfoState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) {
  const online = isNetInfoStateOnline(state);
  if (online) {
    clearOfflineTimer();
    publish({ online: true, known: true });
    return;
  }
  if (!current.known) {
    // First report at cold start: no previous state to protect, apply right away.
    publish({ online: false, known: true });
    return;
  }
  if (!current.online || offlineTimer) return;
  offlineTimer = setTimeout(() => {
    offlineTimer = null;
    publish({ online: false, known: true });
  }, OFFLINE_DEBOUNCE_MS);
}

function ensureMonitoring() {
  if (unsubscribeNetInfo) return;
  unsubscribeNetInfo = NetInfo.addEventListener(applyNetInfoState);
}

export function getConnectivity(): Connectivity {
  ensureMonitoring();
  return current;
}

/** Resolves the current state, asking NetInfo once if nothing was reported yet. */
export async function fetchConnectivity(): Promise<Connectivity> {
  ensureMonitoring();
  if (current.known) return current;
  const state = await NetInfo.fetch().catch(() => null);
  if (state) applyNetInfoState(state);
  return current;
}

export function subscribeConnectivity(listener: () => void): () => void {
  ensureMonitoring();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Calls `onOnline` on every offline → online transition (not on the initial state). */
export function subscribeToReconnect(onOnline: () => void): () => void {
  let wasOnline = getConnectivity().online;
  return subscribeConnectivity(() => {
    const { online } = getConnectivity();
    if (online && !wasOnline) onOnline();
    wasOnline = online;
  });
}

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(subscribeConnectivity, getConnectivity, getConnectivity);
}

/** Test helper: restores the initial state. */
export function resetConnectivityForTests() {
  clearOfflineTimer();
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = null;
  current = { online: true, known: false };
  listeners.clear();
}
