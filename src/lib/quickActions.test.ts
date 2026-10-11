import { describe, expect, it } from 'vitest';
import { buildQuickActions } from './quickActions';

describe('buildQuickActions', () => {
  it('lists the four shortcuts with SF Symbols and app routes', () => {
    const actions = buildQuickActions((key) => key);
    expect(actions.map((action) => action.params.href)).toEqual([
      '/(tabs)',
      '/(tabs)/inbox',
      '/friend-scan-qr',
      '/(tabs)/profile/my-code',
    ]);
    expect(actions.every((action) => action.icon?.startsWith('symbol:'))).toBe(true);
    expect(actions[0].title).toBe('quickActions.newNix');
  });
});
