import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const maybeSingle = vi.fn();
const select = vi.fn(() => ({ maybeSingle }));
const from = vi.fn(() => ({ select }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

vi.mock('./pushNotificationService', () => ({
  getInstallationId: vi.fn(async () => 'install-1'),
}));

vi.mock('../lib/i18n', () => ({
  getCurrentLocale: () => 'en',
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.11' } },
}));

describe('productAnalyticsService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('refuses to record events when analytics roadmap flag is off', async () => {
    vi.stubEnv('EXPO_PUBLIC_INTERNAL_TESTFLIGHT_ROADMAP_ENABLED', 'true');
    vi.stubEnv('EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED', 'false');
    const { recordProductEvent } = await import('./productAnalyticsService');
    const recorded = await recordProductEvent('onboarding_completed');
    expect(recorded).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('records only when analytics flag is enabled', async () => {
    vi.stubEnv('EXPO_PUBLIC_INTERNAL_TESTFLIGHT_ROADMAP_ENABLED', 'false');
    vi.stubEnv('EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED', 'true');
    rpc.mockResolvedValue({ data: true, error: null });
    const { recordProductEvent } = await import('./productAnalyticsService');
    const recorded = await recordProductEvent('onboarding_completed', { source: 'test' });
    expect(recorded).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'record_product_analytics_event',
      expect.objectContaining({
        p_installation_id: 'install-1',
        p_event_name: 'onboarding_completed',
      }),
    );
  });

  it('setProductAnalyticsConsent forwards revoke to RPC', async () => {
    vi.stubEnv('EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED', 'true');
    rpc.mockResolvedValue({ data: null, error: null });
    const { setProductAnalyticsConsent } = await import('./productAnalyticsService');
    await setProductAnalyticsConsent(false);
    expect(rpc).toHaveBeenCalledWith('set_product_analytics_consent', { p_enabled: false });
  });
});
