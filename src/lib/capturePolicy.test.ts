import { describe, expect, it } from 'vitest';
import { resolveCapturePolicyForFriend, shouldBlockCapture } from './capturePolicy';

describe('capturePolicy', () => {
  it('defaults to deny when friend has no explicit preference', () => {
    const policy = resolveCapturePolicyForFriend({}, 'friend-1');
    expect(policy).toBe('deny');
    expect(shouldBlockCapture(policy)).toBe(true);
  });

  it('uses allow override for a specific friend', () => {
    const policy = resolveCapturePolicyForFriend({ 'friend-1': 'allow' }, 'friend-1');
    expect(policy).toBe('allow');
    expect(shouldBlockCapture(policy)).toBe(false);
  });
});
