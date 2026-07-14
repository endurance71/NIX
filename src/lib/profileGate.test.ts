import { describe, expect, it } from 'vitest';
import { resolveNeedsOnboarding } from './profileGate';

describe('resolveNeedsOnboarding', () => {
  it('zwraca false bez sesji', () => {
    expect(resolveNeedsOnboarding(false, null, false)).toBe(false);
    expect(resolveNeedsOnboarding(false, { id: '1', username: null, avatar_storage_path: null, avatar_emoji: null }, true)).toBe(
      false
    );
  });

  it('zwraca true gdy sesja jest, ale brak username', () => {
    expect(
      resolveNeedsOnboarding(true, { id: '1', username: null, avatar_storage_path: null, avatar_emoji: null }, false)
    ).toBe(true);
    expect(resolveNeedsOnboarding(true, null, false)).toBe(true);
  });

  it('zwraca false gdy sesja jest i username ustawiony', () => {
    expect(
      resolveNeedsOnboarding(
        true,
        { id: '1', username: 'nix_user', avatar_storage_path: null, avatar_emoji: null },
        false
      )
    ).toBe(false);
  });

  it('zwraca true przy błędzie pobierania profilu', () => {
    expect(resolveNeedsOnboarding(true, undefined, true)).toBe(true);
  });
});
