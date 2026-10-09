import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRoadmapFeature } from './iosRoadmapFeatures';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('keeps analytics off despite local dotenv and internal roadmap overrides', async () => {
  vi.stubEnv('EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED', 'true');
  vi.stubEnv('EXPO_PUBLIC_INTERNAL_TESTFLIGHT_ROADMAP_ENABLED', 'true');
  vi.resetModules();
  const { iosRoadmapFeatures } = await import('./iosRoadmapFeatures');
  expect(iosRoadmapFeatures.analytics).toBe(false);
  expect(iosRoadmapFeatures.activation).toBe(true);
});

describe('resolveRoadmapFeature', () => {
  it('allows an explicit false value to override the internal roadmap bundle', () => {
    expect(resolveRoadmapFeature('false')).toBe(false);
  });

  it('enables an explicitly selected feature', () => {
    expect(resolveRoadmapFeature('true')).toBe(true);
  });
});
