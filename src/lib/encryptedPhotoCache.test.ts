import { describe, expect, it, vi } from 'vitest';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createEncryptedPhotoCache, photoCacheAdditionalData, PHOTO_CACHE_FIRST_VIEW_TTL_MS, type PhotoCacheBackend, type PhotoCacheCodec, type PhotoCacheRow } from './encryptedPhotoCache';

vi.mock('expo-crypto', () => ({ AESEncryptionKey: {}, AESKeySize: { AES256: 256 } }));
vi.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only' }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn() }));

function fixture(maxBytes?: number) {
  const rows = new Map<string, PhotoCacheRow>();
  const keys = new Map<string, Buffer>();
  let clock = 1_000;
  const backend: PhotoCacheBackend = {
    list: async (owner) => [...rows.values()].filter((row) => owner === undefined || row.ownerId === owner),
    get: async (owner, id) => rows.get(`${owner}:${id}`) ?? null,
    put: async (row) => { rows.set(`${row.ownerId}:${row.nixId}`, row); },
    delete: async (owner, id) => { rows.delete(`${owner}:${id}`); },
    deleteOwner: async (owner) => { for (const [key, row] of rows) if (row.ownerId === owner) rows.delete(key); },
  };
  const key = (owner: string) => { let k = keys.get(owner); if (!k) { k = randomBytes(32); keys.set(owner, k); } return k; };
  const codec: PhotoCacheCodec = {
    async encrypt(owner, plaintext, metadata) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(owner), iv);
      cipher.setAAD(photoCacheAdditionalData(metadata));
      return Buffer.concat([iv, cipher.update(Buffer.from(plaintext, 'base64')), cipher.final(), cipher.getAuthTag()]).toString('base64');
    },
    async decrypt(owner, ciphertext, metadata) {
      const data = Buffer.from(ciphertext, 'base64');
      const cipher = createDecipheriv('aes-256-gcm', key(owner), data.subarray(0, 12));
      cipher.setAAD(photoCacheAdditionalData(metadata)); cipher.setAuthTag(data.subarray(-16));
      return Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString('base64');
    },
    async clear(owner) { keys.delete(owner); },
  };
  const cache = createEncryptedPhotoCache(backend, codec, () => clock, maxBytes);
  const write = (id: string, ownerId = 'a') => cache.write({ ownerId, nixId: id, mediaPath: `${ownerId}/${id}`, base64: 'c2VjcmV0', contentType: 'image/jpeg' });
  return { rows, keys, backend, codec, cache, write, setClock: (now: number) => { clock = now; } };
}

describe('encrypted private photo cache', () => {
  it('binds owner, NiX, path and retention metadata with AES-256-GCM AAD', async () => {
    const { cache, write, rows } = fixture();
    await write('one'); await write('two');
    expect(JSON.stringify([...rows.values()])).not.toContain('c2VjcmV0');
    expect((await cache.read('a', 'one', 'a/one'))?.base64).toBe('c2VjcmV0');
    const row = rows.get('a:one')!;
    row.metadata = JSON.stringify({ ...JSON.parse(row.metadata), mediaPath: 'a/forged' });
    expect(await cache.read('a', 'one', 'a/forged')).toBeNull();
    expect(rows.has('a:two')).toBe(true);
    expect(await cache.read('b', 'two', 'a/two')).toBeNull();
  });

  it('reads never extend the ten-minute first-view TTL and sweep deletes expired entries', async () => {
    const { cache, write, rows, setClock } = fixture();
    const first = await write('one');
    setClock(1_000 + PHOTO_CACHE_FIRST_VIEW_TTL_MS - 1);
    expect((await cache.read('a', 'one', 'a/one'))?.metadata.expiresAt).toBe(first.expiresAt);
    setClock(first.expiresAt); await cache.sweep();
    expect(rows.size).toBe(0);
  });

  it('replaces first-view TTL only with the acknowledged server replay deadline', async () => {
    const { cache, write, setClock, rows } = fixture();
    await write('one');
    const authoritativeDeadline = 2_000_000;
    await cache.retainForReplay('a', 'one', 'a/one', authoritativeDeadline);
    setClock(1_000 + PHOTO_CACHE_FIRST_VIEW_TTL_MS + 1);
    expect((await cache.read('a', 'one', 'a/one'))?.metadata).toMatchObject({ phase: 'replay', expiresAt: authoritativeDeadline });
    setClock(authoritativeDeadline); await cache.sweep(); expect(rows.size).toBe(0);
  });

  it('replay removal invalidates a downloader started before removal', async () => {
    const { cache, rows } = fixture();
    const assertTicket = cache.ticket('a', 'one');
    await cache.remove('a', 'one');
    await expect(cache.write({ ownerId: 'a', nixId: 'one', mediaPath: 'a/one', base64: 'c2VjcmV0', contentType: 'image/jpeg', assertTicket })).rejects.toMatchObject({ name: 'AbortError' });
    expect(rows.size).toBe(0);
  });

  it('logout during encryption cancels the pending write and destroys only that owner key', async () => {
    const { cache, codec, write, rows, keys } = fixture();
    await write('other', 'b');
    const original = codec.encrypt;
    let release!: () => void;
    codec.encrypt = async (...args) => { await new Promise<void>((resolve) => { release = resolve; }); return original(...args); };
    const pending = write('one'); const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(release).toBeDefined());
    const clear = cache.clear('a'); release(); await cancelled; await clear;
    expect(rows.has('a:one')).toBe(false); expect(keys.has('a')).toBe(false);
    expect((await cache.read('b', 'other', 'b/other'))?.base64).toBe('c2VjcmV0');
  });

  it('evicts oldest ciphertext to honor the global encrypted disk budget', async () => {
    const { cache, write, rows, setClock } = fixture(300);
    await write('old'); setClock(2_000); await write('new', 'b');
    expect([...rows.values()].reduce((sum, row) => sum + row.byteSize, 0)).toBeLessThanOrEqual(300);
    expect(rows.has('a:old')).toBe(false);
    expect((await cache.read('b', 'new', 'b/new'))?.base64).toBe('c2VjcmV0');
  });

  it('does not return plaintext when TTL expires during decrypt', async () => {
    const { cache, codec, write, rows, setClock } = fixture();
    const metadata = await write('one');
    const decrypt = codec.decrypt;
    let release!: () => void;
    codec.decrypt = async (...args) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return decrypt(...args);
    };
    const pending = cache.read('a', 'one', 'a/one');
    await vi.waitFor(() => expect(release).toBeDefined());
    setClock(metadata.expiresAt); release();
    expect(await pending).toBeNull();
    expect(rows.size).toBe(0);
  });

  it('never persists a photo whose TTL expires during encryption', async () => {
    const { codec, write, rows, setClock } = fixture();
    const encrypt = codec.encrypt;
    let release!: () => void;
    codec.encrypt = async (...args) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return encrypt(...args);
    };
    const pending = write('one');
    const expired = expect(pending).rejects.toThrow('Photo availability expired');
    await vi.waitFor(() => expect(release).toBeDefined());
    setClock(1_000 + PHOTO_CACHE_FIRST_VIEW_TTL_MS); release();
    await expired; expect(rows.size).toBe(0);
  });

  it('deletes ciphertext if TTL expires while SQLite writes it', async () => {
    const { backend, write, rows, setClock } = fixture();
    const put = backend.put;
    backend.put = async (row) => {
      await put(row);
      setClock(JSON.parse(row.metadata).expiresAt);
    };
    await expect(write('one')).rejects.toThrow('Photo availability expired');
    expect(rows.size).toBe(0);
  });

  it('serializes capacity checks for concurrent writes from different owners', async () => {
    const { codec, write, rows } = fixture(300);
    const encrypt = codec.encrypt;
    let release!: () => void;
    let encryptions = 0;
    codec.encrypt = async (...args) => {
      encryptions++;
      if (encryptions === 1) await new Promise<void>((resolve) => { release = resolve; });
      return encrypt(...args);
    };
    const first = write('one', 'a');
    // The first write may be evicted by the second before its final sweep.
    const checkedFirst = first.catch((error) => { expect(error.name).toBe('AbortError'); });
    await vi.waitFor(() => expect(release).toBeDefined());
    const second = write('two', 'b');
    await Promise.resolve(); expect(encryptions).toBe(1);
    release(); await Promise.all([checkedFirst, second]);
    expect([...rows.values()].reduce((sum, row) => sum + row.byteSize, 0)).toBeLessThanOrEqual(300);
    expect(rows.has('b:two')).toBe(true);
  });
});
