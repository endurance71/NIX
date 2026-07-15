import { describe, expect, it } from 'vitest';
import { resolveNeedsOnboarding } from './profileGate';

describe('resolveNeedsOnboarding', () => {
  it('zwraca false bez sesji', () => {
    expect(resolveNeedsOnboarding(false, null, false, false)).toBe(false);
    expect(resolveNeedsOnboarding(false, { id: '1', username: null, avatar_storage_path: null, avatar_emoji: null }, true, false)).toBe(
      false
    );
  });

  it('zwraca true gdy sesja jest, ale brak username', () => {
    expect(
      resolveNeedsOnboarding(true, { id: '1', username: null, avatar_storage_path: null, avatar_emoji: null }, false, true)
    ).toBe(true);
    expect(resolveNeedsOnboarding(true, null, false, true)).toBe(true);
  });

  it('zwraca false gdy sesja jest i username ustawiony', () => {
    expect(
      resolveNeedsOnboarding(
        true,
        { id: '1', username: 'nix_user', avatar_storage_path: null, avatar_emoji: null },
        false,
        true
      )
    ).toBe(false);
  });

  it('zwraca true przy błędzie pobierania profilu', () => {
    expect(resolveNeedsOnboarding(true, undefined, true, true)).toBe(true);
  });

  it('zwraca true, gdy brakuje aktualnego potwierdzenia wieku', () => {
    expect(
      resolveNeedsOnboarding(
        true,
        { id: '1', username: 'nix_user', avatar_storage_path: null, avatar_emoji: null },
        false,
        false
      )
    ).toBe(true);
  });
});
