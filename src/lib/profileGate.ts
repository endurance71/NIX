import type { CurrentUserProfileRow } from '../services/profileService';

export type BootstrapResolution =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'readyOnline' }
  | { status: 'readyFromSnapshot' }
  | { status: 'needsOnboarding' }
  | { status: 'recoverableError' };

export function resolveBootstrapState(input: {
  authLoading: boolean;
  authError: boolean;
  hasSession: boolean;
  profile: CurrentUserProfileRow | null | undefined;
  profilePending: boolean;
  profileError: boolean;
  ageAttested: boolean | undefined;
  agePending: boolean;
  ageError: boolean;
  snapshotPending: boolean;
  hasValidSnapshot: boolean;
}): BootstrapResolution {
  if (input.authLoading) return { status: 'loading' };
  if (input.authError) return { status: 'recoverableError' };
  if (!input.hasSession) return { status: 'anonymous' };
  if (input.snapshotPending || input.profilePending || input.agePending) return { status: 'loading' };
  if (input.profileError || input.ageError) {
    return { status: input.hasValidSnapshot ? 'readyFromSnapshot' : 'recoverableError' };
  }
  if (!input.profile?.username || input.ageAttested !== true) return { status: 'needsOnboarding' };
  return { status: 'readyOnline' };
}
