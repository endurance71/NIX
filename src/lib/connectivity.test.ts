import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyNetInfoState,
  getConnectivity,
  resetConnectivityForTests,
  subscribeToReconnect,
} from './connectivity';

vi.mock('@react-native-community/netinfo', () => ({
  default: { addEventListener: vi.fn(() => () => {}), fetch: vi.fn(async () => ({ isConnected: true, isInternetReachable: true })) },
}));

const ONLINE = { isConnected: true, isInternetReachable: true };
const OFFLINE = { isConnected: false, isInternetReachable: false };

describe('connectivity store', () => {
  beforeEach(() => { vi.useFakeTimers(); resetConnectivityForTests(); });
  afterEach(() => { resetConnectivityForTests(); vi.useRealTimers(); });

  it('applies the first report immediately, including offline at cold start', () => {
    applyNetInfoState(OFFLINE);
    expect(getConnectivity()).toEqual({ online: false, known: true });
  });

  it('ignores a reachability blip shorter than the offline debounce', () => {
    applyNetInfoState(ONLINE);
    applyNetInfoState({ isConnected: true, isInternetReachable: false });
    vi.advanceTimersByTime(1_500);
    applyNetInfoState(ONLINE);
    vi.advanceTimersByTime(5_000);
    expect(getConnectivity().online).toBe(true);
  });

  it('goes offline after a sustained loss and back online immediately', () => {
    applyNetInfoState(ONLINE);
    const onReconnect = vi.fn();
    subscribeToReconnect(onReconnect);
    applyNetInfoState(OFFLINE);
    vi.advanceTimersByTime(2_000);
    expect(getConnectivity().online).toBe(false);
    applyNetInfoState(ONLINE);
    expect(getConnectivity().online).toBe(true);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('treats an unknown reachability (null) as online', () => {
    applyNetInfoState({ isConnected: true, isInternetReachable: null });
    expect(getConnectivity().online).toBe(true);
  });
});
