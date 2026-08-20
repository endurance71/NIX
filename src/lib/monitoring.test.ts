import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initMonitoring } from './monitoring';
import { trackEvent } from './telemetry';

const { sentryInit, sentryBreadcrumb } = vi.hoisted(() => ({
  sentryInit: vi.fn(),
  sentryBreadcrumb: vi.fn(),
}));

vi.mock('@sentry/react-native', () => ({
  init: sentryInit,
  addBreadcrumb: sentryBreadcrumb,
}));

describe('monitoring hard-off', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nie ładuje ani nie inicjalizuje Sentry w dev/hard-off', () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://public@example.invalid/1');
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    initMonitoring();
    trackEvent('test_event', { status: 'success' });

    expect(sentryInit).not.toHaveBeenCalled();
    expect(sentryBreadcrumb).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledWith('[telemetry] test_event', { status: 'success' });

    consoleInfo.mockRestore();
    vi.unstubAllEnvs();
  });
});
