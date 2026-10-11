import { describe, expect, it, vi } from 'vitest';
import { createAccountEncryptionKeyStore } from './accountEncryptionKeys';

vi.mock('expo-crypto', () => ({ AESEncryptionKey: {}, AESKeySize: { AES256: 256 } }));
vi.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only' }));

function fixture() {
  const stored = new Map<string, string>();
  const storage = {
    getItemAsync: vi.fn(async (name: string) => stored.get(name) ?? null),
    setItemAsync: vi.fn(async (name: string, value: string) => { stored.set(name, value); }),
    deleteItemAsync: vi.fn(async (name: string) => { stored.delete(name); }),
  };
  const key = { size: 256, encoded: async () => 'key-a', bytes: async () => new Uint8Array(32) };
  const crypto = { generate: vi.fn(async () => key), import: vi.fn(async () => key) };
  return { stored, storage, crypto, store: createAccountEncryptionKeyStore(storage, crypto) };
}

describe('per-account AES keys', () => {
  it('shares a single AES-256 creation across simultaneous callers', async () => {
    const { store, crypto, storage } = fixture();
    const [a, b, c] = await Promise.all([store.get('a'), store.get('a'), store.get('a')]);
    expect(a).toBe(b); expect(b).toBe(c);
    expect(crypto.generate).toHaveBeenCalledExactlyOnceWith(256);
    expect(storage.setItemAsync).toHaveBeenCalledTimes(1);
    expect(storage.setItemAsync).toHaveBeenCalledWith('a', 'key-a', { keychainAccessible: 'device-only' });
  });

  it('cancels key creation queued before clear and never resurrects its key', async () => {
    const { store, stored, storage } = fixture();
    let release!: (value: string | null) => void;
    storage.getItemAsync.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = store.get('a');
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(release).toBeDefined());
    const clear = store.clear('a');
    release(null);
    await cancelled; await clear;
    expect(stored.has('a')).toBe(false);
    expect(storage.setItemAsync).not.toHaveBeenCalled();
    await store.get('a');
    expect(stored.get('a')).toBe('key-a');
  });

  it('serializes clear after an already started SecureStore write', async () => {
    const { store, stored, storage } = fixture();
    let release!: () => void;
    storage.setItemAsync.mockImplementationOnce(async (name, value) => {
      await new Promise<void>((resolve) => { release = resolve; }); stored.set(name, value);
    });
    const pending = store.get('a');
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(release).toBeDefined());
    const clear = store.clear('a'); release();
    await cancelled; await clear;
    expect(stored.has('a')).toBe(false);
  });
});
