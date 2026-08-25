import type { CurrentUserProfileRow } from '../services/profileService';
import type { AuthStatus } from './authBootstrap';

export type BootstrapResolution =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'readyOnline' }
  | { status: 'readyFromSnapshot' }
  | { status: 'needsOnboarding' }
  | { status: 'offlineNeedsVerification' }
  | { status: 'recoverableError' };

export function resolveBootstrapState(input: {
  authStatus: AuthStatus;
  hasSession: boolean;
  profile: CurrentUserProfileRow | null | undefined;
  profilePending: boolean;
  profileError: boolean;
  ageAttested: boolean | undefined;
  agePending: boolean;
  ageError: boolean;
  snapshotPending: boolean;
  snapshotError: boolean;
  hasValidSnapshot: boolean;
}): BootstrapResolution {
  if (input.authStatus === 'initializing') return { status: 'loading' };
  if (input.authStatus === 'recoverableError') return { status: 'recoverableError' };
  if (input.authStatus === 'anonymous' || !input.hasSession) return { status: 'anonymous' };
  if (input.snapshotPending) return { status: 'loading' };
  if (input.snapshotError) return { status: 'recoverableError' };
  if (input.authStatus === 'authenticatedOffline') {
    return { status: input.hasValidSnapshot ? 'readyFromSnapshot' : 'offlineNeedsVerification' };
  }
  if (input.profilePending || input.agePending) return { status: 'loading' };
  if (input.profileError || input.ageError) {
    return { status: input.hasValidSnapshot ? 'readyFromSnapshot' : 'recoverableError' };
  }
  if (!input.profile?.username || input.ageAttested !== true) return { status: 'needsOnboarding' };
  return { status: 'readyOnline' };
}
