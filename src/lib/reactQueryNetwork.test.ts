import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock('@react-native-community/netinfo', () => ({
  default: { addEventListener: vi.fn(() => () => {}), fetch: vi.fn() },
}));

// eslint-disable-next-line import/first
import { applyNetInfoState, resetConnectivityForTests } from './connectivity';
// eslint-disable-next-line import/first
import { bindReactQueryAppLifecycle, setReactQueryAuthOnline } from './reactQueryNetwork';

const ONLINE = { isConnected: true, isInternetReachable: true };
const OFFLINE = { isConnected: false, isInternetReachable: false };

describe('React Query online state', () => {
  let unbind: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    resetConnectivityForTests();
    setReactQueryAuthOnline(true);
    unbind = bindReactQueryAppLifecycle();
  });
  afterEach(() => {
    unbind();
    resetConnectivityForTests();
    vi.useRealTimers();
  });

  it('follows the shared connectivity store, including its offline debounce', () => {
    applyNetInfoState(ONLINE);
    expect(onlineManager.isOnline()).toBe(true);
    applyNetInfoState(OFFLINE);
    expect(onlineManager.isOnline()).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(onlineManager.isOnline()).toBe(false);
    applyNetInfoState(ONLINE);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('stays paused while the session is only usable offline', () => {
    applyNetInfoState(ONLINE);
    setReactQueryAuthOnline(false);
    expect(onlineManager.isOnline()).toBe(false);
    setReactQueryAuthOnline(true);
    expect(onlineManager.isOnline()).toBe(true);
  });
});
