import { describe, expect, it } from 'vitest';
import { resolveBootstrapState } from './profileGate';

const completeProfile = {
  id: '1', username: 'nix_user', display_name: null, bio: null,
  is_private: false, avatar_storage_path: null, avatar_emoji: null,
};
const base = {
  authLoading: false, authError: false, hasSession: true, profile: completeProfile,
  profilePending: false, profileError: false, ageAttested: true,
  agePending: false, ageError: false, snapshotPending: false, hasValidSnapshot: false,
};

describe('resolveBootstrapState', () => {
  it('rozróżnia ładowanie i anonimową sesję', () => {
    expect(resolveBootstrapState({ ...base, authLoading: true }).status).toBe('loading');
    expect(resolveBootstrapState({ ...base, authError: true }).status).toBe('recoverableError');
    expect(resolveBootstrapState({ ...base, hasSession: false }).status).toBe('anonymous');
  });
  it('otwiera aplikację po pełnej weryfikacji online', () => {
    expect(resolveBootstrapState(base).status).toBe('readyOnline');
  });
  it('kieruje do onboardingu tylko po jawnej niekompletnej odpowiedzi', () => {
    expect(resolveBootstrapState({ ...base, profile: { ...completeProfile, username: null } }).status).toBe('needsOnboarding');
    expect(resolveBootstrapState({ ...base, ageAttested: false }).status).toBe('needsOnboarding');
  });
  it('nie traktuje błędu profilu ani wieku jak braku profilu', () => {
    expect(resolveBootstrapState({ ...base, profileError: true }).status).toBe('recoverableError');
    expect(resolveBootstrapState({ ...base, ageError: true }).status).toBe('recoverableError');
  });
  it('przy błędzie otwiera offline wyłącznie z prawidłowym snapshotem', () => {
    expect(resolveBootstrapState({ ...base, profileError: true, hasValidSnapshot: true }).status).toBe('readyFromSnapshot');
  });
});
