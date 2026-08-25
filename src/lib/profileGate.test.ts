import { describe, expect, it } from 'vitest';
import { resolveBootstrapState } from './profileGate';

const completeProfile = {
  id: '1', username: 'nix_user', display_name: null, bio: null,
  is_private: false, avatar_storage_path: null, avatar_emoji: null,
};
const base = {
  authStatus: 'authenticatedOnline' as const, hasSession: true, profile: completeProfile,
  profilePending: false, profileError: false, ageAttested: true,
  agePending: false, ageError: false, snapshotPending: false, snapshotError: false, hasValidSnapshot: false,
};

describe('resolveBootstrapState', () => {
  it('rozróżnia ładowanie i anonimową sesję', () => {
    expect(resolveBootstrapState({ ...base, authStatus: 'initializing' }).status).toBe('loading');
    expect(resolveBootstrapState({ ...base, authStatus: 'recoverableError' }).status).toBe('recoverableError');
    expect(resolveBootstrapState({ ...base, authStatus: 'anonymous', hasSession: false }).status).toBe('anonymous');
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
  it('przy offline wymaga przypisanego snapshotu zamiast pokazywać logowanie', () => {
    expect(resolveBootstrapState({ ...base, authStatus: 'authenticatedOffline', hasValidSnapshot: true }).status).toBe('readyFromSnapshot');
    expect(resolveBootstrapState({ ...base, authStatus: 'authenticatedOffline', hasValidSnapshot: false }).status).toBe('offlineNeedsVerification');
  });
  it('rozróżnia błąd odczytu snapshotu od jego braku', () => {
    expect(resolveBootstrapState({ ...base, authStatus: 'authenticatedOffline', snapshotError: true }).status).toBe('recoverableError');
  });
});
