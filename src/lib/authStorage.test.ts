import { beforeEach, describe, expect, it, vi } from 'vitest';

const { secureValues, asyncValues, secureMockState } = vi.hoisted(() => ({
  secureValues: new Map<string, string>(),
  asyncValues: new Map<string, string>(),
  secureMockState: { failNextChunkWrite: false, failNextDelete: false },
}));

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(async (key: string) => secureValues.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (secureMockState.failNextChunkWrite && key.includes('.nix.') && !key.endsWith('.manifest')) {
      secureMockState.failNextChunkWrite = false;
      throw new Error('simulated keychain write failure');
    }
    secureValues.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    if (secureMockState.failNextDelete) {
      secureMockState.failNextDelete = false;
      throw new Error('simulated keychain delete failure');
    }
    secureValues.delete(key);
  }),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncValues.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { asyncValues.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { asyncValues.delete(key); }),
  },
}));

// eslint-disable-next-line import/first
import * as SecureStore from 'expo-secure-store';
// eslint-disable-next-line import/first
import {
  authStorage,
  isSessionAccessTokenExpired,
  readPersistedSessionCandidate,
  resetAuthStorageCacheForTests,
} from './authStorage';

const storageKey = 'sb-project-auth-token';

function sessionJson(expiresAt: number) {
  return JSON.stringify({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'user-a', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' },
  });
}

describe('chunked auth storage', () => {
  beforeEach(() => {
    secureValues.clear();
    asyncValues.clear();
    secureMockState.failNextChunkWrite = false;
    secureMockState.failNextDelete = false;
    resetAuthStorageCacheForTests();
    vi.mocked(SecureStore.getItemAsync).mockClear();
  });

  it('round-trips a payload larger than a single keychain value', async () => {
    const value = sessionJson(2_000_000_000) + 'ą'.repeat(3_000);
    await authStorage.setItem(storageKey, value);
    expect(await authStorage.getItem(storageKey)).toBe(value);
    expect([...secureValues.keys()].filter((key) => key.includes('.nix.') && !key.endsWith('.manifest')).length).toBeGreaterThan(1);
  });

  it('migrates legacy SecureStore and AsyncStorage values only after a successful write', async () => {
    secureValues.set(storageKey, 'legacy-secure');
    expect(await authStorage.getItem(storageKey)).toBe('legacy-secure');
    expect(secureValues.has(storageKey)).toBe(false);
    expect(secureValues.has(`${storageKey}.nix.manifest`)).toBe(true);

    await authStorage.removeItem(storageKey);
    asyncValues.set(storageKey, 'legacy-async');
    expect(await authStorage.getItem(storageKey)).toBe('legacy-async');
    expect(asyncValues.has(storageKey)).toBe(false);
  });

  it('keeps the previous committed generation when a replacement write fails', async () => {
    await authStorage.setItem(storageKey, 'previous-session');
    secureMockState.failNextChunkWrite = true;
    await expect(authStorage.setItem(storageKey, 'replacement-session')).rejects.toThrow('simulated');
    expect(await authStorage.getItem(storageKey)).toBe('previous-session');
  });

  it('returns a validated local session candidate and evaluates real expiry', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 1;
    await authStorage.setItem(storageKey, sessionJson(expiresAt));
    const session = await readPersistedSessionCandidate(storageKey);
    expect(session?.user.id).toBe('user-a');
    expect(session && isSessionAccessTokenExpired(session)).toBe(true);
  });

  it('reports a keychain deletion failure after attempting all cleanup targets', async () => {
    await authStorage.setItem(storageKey, 'session');
    secureMockState.failNextDelete = true;
    await expect(authStorage.removeItem(storageKey)).rejects.toThrow('delete failure');
    expect(secureValues.has(`${storageKey}.nix.manifest`)).toBe(false);
  });

  it('serves repeated reads from memory instead of the Keychain (PERF-3)', async () => {
    await authStorage.setItem(storageKey, sessionJson(2_000_000_000));
    vi.mocked(SecureStore.getItemAsync).mockClear();
    await authStorage.getItem(storageKey);
    await authStorage.getItem(storageKey);
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  it('shares one Keychain read between concurrent cold reads', async () => {
    await authStorage.setItem(storageKey, 'session');
    resetAuthStorageCacheForTests();
    vi.mocked(SecureStore.getItemAsync).mockClear();
    const values = await Promise.all([authStorage.getItem(storageKey), authStorage.getItem(storageKey)]);
    expect(values).toEqual(['session', 'session']);
    // Manifest + one chunk, once.
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(2);
  });

  it('returns the new value right after a write and nothing after removal', async () => {
    await authStorage.setItem(storageKey, 'first');
    expect(await authStorage.getItem(storageKey)).toBe('first');
    await authStorage.setItem(storageKey, 'second');
    expect(await authStorage.getItem(storageKey)).toBe('second');
    await authStorage.removeItem(storageKey);
    expect(await authStorage.getItem(storageKey)).toBeNull();
  });

  it('does not cache a read that raced with a write', async () => {
    await authStorage.setItem(storageKey, 'old');
    resetAuthStorageCacheForTests();
    const staleRead = authStorage.getItem(storageKey);
    await authStorage.setItem(storageKey, 'new');
    await staleRead;
    expect(await authStorage.getItem(storageKey)).toBe('new');
  });

  it('falls back to the Keychain after a failed write', async () => {
    await authStorage.setItem(storageKey, 'previous-session');
    secureMockState.failNextChunkWrite = true;
    await expect(authStorage.setItem(storageKey, 'replacement-session')).rejects.toThrow('simulated');
    vi.mocked(SecureStore.getItemAsync).mockClear();
    expect(await authStorage.getItem(storageKey)).toBe('previous-session');
    expect(SecureStore.getItemAsync).toHaveBeenCalled();
  });
});
