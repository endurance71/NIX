import { describe, expect, it } from 'vitest';
import { resolveRoadmapFeature } from './iosRoadmapFeatures';

describe('resolveRoadmapFeature', () => {
  it('allows an explicit false value to override the internal roadmap bundle', () => {
    expect(resolveRoadmapFeature('false')).toBe(false);
  });

  it('enables an explicitly selected feature', () => {
    expect(resolveRoadmapFeature('true')).toBe(true);
  });
});
