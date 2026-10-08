import { describe, expect, it } from 'vitest';
import { resolveBootstrapFailure, resolveBootstrapRedirect } from './bootstrapPresentation';

describe('bootstrap presentation decisions', () => {
  it('preserves failure priority when several checks fail', () => {
    const failures = {
      storageError: true,
      snapshotError: true,
      profileError: true,
      ageError: true,
      status: 'recoverableError' as const,
    };
    expect(resolveBootstrapFailure(failures).stage).toBe('auth_storage');
    expect(resolveBootstrapFailure({ ...failures, storageError: false }).stage).toBe(
      'profile_snapshot',
    );
    expect(
      resolveBootstrapFailure({ ...failures, storageError: false, snapshotError: false }).stage,
    ).toBe('profile');
    expect(
      resolveBootstrapFailure({
        ...failures,
        storageError: false,
        snapshotError: false,
        profileError: false,
      }).stage,
    ).toBe('age_attestation');
    expect(
      resolveBootstrapFailure({
        storageError: false,
        snapshotError: false,
        profileError: false,
        ageError: false,
        status: 'readyFromSnapshot',
      }).stage,
    ).toBeNull();
  });
  it('keeps loading and recoverable errors on the current screen', () => {
    const input = {
      appReady: false,
      status: 'loading' as const,
      hasSession: false,
      needsOnboarding: false,
      segments: ['(tabs)'],
    };
    expect(resolveBootstrapRedirect(input)).toBeNull();
    expect(
      resolveBootstrapRedirect({ ...input, appReady: true, status: 'recoverableError' }),
    ).toBeNull();
    expect(resolveBootstrapRedirect({ ...input, appReady: true, status: 'anonymous' })).toBe(
      '/(auth)/login',
    );
  });
  it('preserves password recovery, onboarding and a verified offline session', () => {
    const input = {
      appReady: true,
      status: 'readyFromSnapshot' as const,
      hasSession: true,
      needsOnboarding: false,
      segments: ['(auth)', 'login'],
    };
    expect(resolveBootstrapRedirect(input)).toBe('/(tabs)');
    expect(
      resolveBootstrapRedirect({ ...input, needsOnboarding: true, status: 'needsOnboarding' }),
    ).toBe('/(auth)/onboarding');
    expect(
      resolveBootstrapRedirect({
        ...input,
        needsOnboarding: true,
        segments: ['(auth)', 'onboarding'],
      }),
    ).toBeNull();
    for (const needsOnboarding of [false, true]) {
      expect(
        resolveBootstrapRedirect({
          ...input,
          needsOnboarding,
          segments: ['(auth)', 'reset-password'],
        }),
      ).toBeNull();
    }
    expect(resolveBootstrapRedirect({ ...input, segments: ['(tabs)', 'inbox'] })).toBeNull();
  });
});
