import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOfflineCacheStore,
  type OfflineCacheBackend,
  type OfflineCacheCodec,
} from './offlineCacheStore';

vi.mock('expo-crypto', () => ({
  AESEncryptionKey: { import: vi.fn(), generate: vi.fn() },
  AESKeySize: { AES256: 256 },
  AESSealedData: { fromCombined: vi.fn() },
  aesDecryptAsync: vi.fn(),
  aesEncryptAsync: vi.fn(),
}));
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn() }));

type Row = Parameters<OfflineCacheBackend['upsert']>[0];
const rows: Row[] = [];

const backend: OfflineCacheBackend = {
  async upsert(row) {
    const index = rows.findIndex((item) => item.owner_id === row.owner_id && item.query_key === row.query_key);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  },
  async list(ownerId) { return rows.filter((row) => row.owner_id === ownerId); },
  async deleteOwner(ownerId) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index].owner_id === ownerId) rows.splice(index, 1);
    }
  },
  async deleteScope(ownerId, category, scopeId) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row.owner_id === ownerId && row.category === category && row.scope_id === scopeId) rows.splice(index, 1);
    }
  },
};

let corrupt = false;
const codec: OfflineCacheCodec = {
  async encrypt(ownerId, plaintext) { return `cipher:${ownerId}:${Buffer.from(plaintext).toString('base64')}`; },
  async decrypt(ownerId, ciphertext) {
    if (corrupt || !ciphertext.startsWith(`cipher:${ownerId}:`)) throw new Error('decrypt failed');
    return Buffer.from(ciphertext.split(':').slice(2).join(':'), 'base64').toString();
  },
  async clear() {},
};

describe('offline cache store', () => {
  beforeEach(() => { rows.length = 0; corrupt = false; });

  it('keeps encrypted values strictly separated by account', async () => {
    const store = createOfflineCacheStore(backend, codec, () => 100);
    await store.write('user-a', ['currentUserProfile', 'user-a'], { username: 'secret-a' }, 90);
    await store.write('user-b', ['currentUserProfile', 'user-b'], { username: 'secret-b' }, 91);
    expect(JSON.stringify(rows)).not.toContain('secret-a');
    expect((await store.read('user-a'))[0].data).toEqual({ username: 'secret-a' });
    expect(JSON.stringify(await store.read('user-a'))).not.toContain('secret-b');
  });

  it('clears the account cache after decryption corruption', async () => {
    const store = createOfflineCacheStore(backend, codec);
    await store.write('user-a', ['acceptedFriends'], [{ id: 'friend' }], 1);
    corrupt = true;
    await expect(store.read('user-a')).rejects.toThrow('decrypt failed');
    expect(await backend.list('user-a')).toEqual([]);
  });

  it('retains only the 20 most recently written chat scopes', async () => {
    let clock = 0;
    const store = createOfflineCacheStore(backend, codec, () => ++clock);
    for (let index = 0; index < 22; index += 1) {
      await store.write('user-a', ['textMessagesWithPeer', `peer-${index}`], [], index);
    }
    const scopes = new Set((await backend.list('user-a')).map((row) => row.scope_id));
    expect(scopes.size).toBe(20);
    expect(scopes.has('peer-0')).toBe(false);
    expect(scopes.has('peer-21')).toBe(true);
  });
});
