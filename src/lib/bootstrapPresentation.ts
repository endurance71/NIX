import type { BootstrapResolution } from './profileGate';

type BootstrapFailures = {
  storageError: boolean;
  snapshotError: boolean;
  profileError: boolean;
  ageError: boolean;
  status: BootstrapResolution['status'];
};
const failureCopy = {
  auth_storage: { title: 'root.sessionStorageFailed', hint: 'root.sessionStorageHint' },
  profile_snapshot: { title: 'root.snapshotReadFailed', hint: 'root.snapshotReadHint' },
  profile: { title: 'root.profileVerificationFailed', hint: 'root.profileVerificationHint' },
  age_attestation: { title: 'root.ageVerificationFailed', hint: 'root.ageVerificationHint' },
  auth_session: { title: 'root.accountVerificationFailed', hint: 'root.accountVerificationHint' },
};

export function resolveBootstrapFailure(input: BootstrapFailures) {
  if (input.storageError) return { stage: 'auth_storage', ...failureCopy.auth_storage };
  if (input.snapshotError) return { stage: 'profile_snapshot', ...failureCopy.profile_snapshot };
  if (input.profileError) return { stage: 'profile', ...failureCopy.profile };
  if (input.ageError) return { stage: 'age_attestation', ...failureCopy.age_attestation };
  return {
    stage: input.status === 'recoverableError' ? 'auth_session' : null,
    ...failureCopy.auth_session,
  };
}

export function resolveBootstrapRedirect(input: {
  appReady: boolean;
  status: BootstrapResolution['status'];
  hasSession: boolean;
  needsOnboarding: boolean;
  segments: string[];
}) {
  if (!input.appReady || input.status === 'recoverableError') return null;
  const inAuthGroup = input.segments[0] === '(auth)';
  if (!input.hasSession) return inAuthGroup ? null : '/(auth)/login';
  if (input.segments[1] === 'reset-password') return null;
  if (input.needsOnboarding)
    return input.segments[1] === 'onboarding' ? null : '/(auth)/onboarding';
  return inAuthGroup ? '/(tabs)' : null;
}
