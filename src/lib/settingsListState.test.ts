import { describe, expect, it } from 'vitest';
import { resolveSettingsListState } from './settingsListState';

describe('resolveSettingsListState', () => {
  const base = { itemCount: 0, hasData: true, isError: false, canUseNetworkSession: true };

  it('shows items whenever there are any, even after a failed refetch', () => {
    expect(resolveSettingsListState({ ...base, itemCount: 2, isError: true })).toBe('items');
  });

  it('reports a failed load instead of an empty list', () => {
    expect(resolveSettingsListState({ ...base, hasData: false, isError: true })).toBe('error');
  });

  it('reports offline without cached data instead of an empty list', () => {
    expect(resolveSettingsListState({ ...base, hasData: false, canUseNetworkSession: false })).toBe('offline');
  });

  it('keeps a cached empty list as empty while offline', () => {
    expect(resolveSettingsListState({ ...base, canUseNetworkSession: false })).toBe('empty');
  });
});
