import { AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { accountEncryptionKeys, AccountStorageCancelledError } from './accountEncryptionKeys';
import { createOwnerOperations } from './ownerOperations';

export const PHOTO_CACHE_FIRST_VIEW_TTL_MS = 10 * 60_000;
export const PHOTO_CACHE_MAX_BYTES = 500 * 1024 * 1024;
// Reserve space for SQLite pages, indexes and its bounded journal below the disk cap.
const PHOTO_CACHE_PAYLOAD_BUDGET_BYTES = PHOTO_CACHE_MAX_BYTES - 20 * 1024 * 1024;
export const PHOTO_CACHE_MAX_ROW_BYTES = 6 * 1024 * 1024;
const KEY_PREFIX = 'nix.photo-cache.key.v1';

export type PhotoCacheMetadata = {
  version: 1;
  ownerId: string;
  nixId: string;
  mediaPath: string;
  contentType: string;
  createdAt: number;
  expiresAt: number;
  phase: 'unviewed' | 'replay';
};
export type PhotoCacheRow = { ownerId: string; nixId: string; metadata: string; ciphertext: string; byteSize: number };
export type PhotoCacheIndexRow = Omit<PhotoCacheRow, 'ciphertext'>;
export type PhotoCacheBackend = {
  list(ownerId?: string): Promise<PhotoCacheIndexRow[]>;
  get(ownerId: string, nixId: string): Promise<PhotoCacheRow | null>;
  put(row: PhotoCacheRow): Promise<void>;
  delete(ownerId: string, nixId: string): Promise<void>;
  deleteOwner(ownerId: string): Promise<void>;
};
export type PhotoCacheCodec = {
  encrypt(ownerId: string, base64: string, metadata: PhotoCacheMetadata): Promise<string>;
  decrypt(ownerId: string, ciphertext: string, metadata: PhotoCacheMetadata): Promise<string>;
  clear(ownerId: string): Promise<void>;
};

export function photoCacheAdditionalData(metadata: PhotoCacheMetadata) {
  return new TextEncoder().encode(JSON.stringify([
    metadata.version, metadata.ownerId, metadata.nixId, metadata.mediaPath,
    metadata.contentType, metadata.createdAt, metadata.expiresAt, metadata.phase,
  ]));
}

function parseMetadata(row: PhotoCacheIndexRow): PhotoCacheMetadata {
  const value: PhotoCacheMetadata = JSON.parse(row.metadata);
  if (value.version !== 1 || value.ownerId !== row.ownerId || value.nixId !== row.nixId
    || typeof value.mediaPath !== 'string' || !/^image\/(jpeg|png|webp|heic|heif)$/.test(value.contentType)
    || !Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt)
    || value.expiresAt <= value.createdAt || !['unviewed', 'replay'].includes(value.phase)
    || (value.phase === 'unviewed' && value.expiresAt > value.createdAt + PHOTO_CACHE_FIRST_VIEW_TTL_MS)) {
    throw new Error('Invalid photo cache metadata');
  }
  return value;
}

export function createEncryptedPhotoCache(backend: PhotoCacheBackend, codec: PhotoCacheCodec, now = Date.now, maxBytes = PHOTO_CACHE_PAYLOAD_BUDGET_BYTES) {
  const operations = createOwnerOperations();
  const epochs = new Map<string, number>();
  const ownerEpochs = new Map<string, number>();
  // Capacity checks, eviction and put form one global operation across owners.
  let mutationTail: Promise<unknown> = Promise.resolve();
  function mutate<T>(operation: () => Promise<T>): Promise<T> {
    const pending = mutationTail.catch(() => {}).then(operation);
    mutationTail = pending;
    return pending;
  }
  const key = (ownerId: string, nixId: string) => `${ownerId}:${nixId}`;
  function ticket(ownerId: string, nixId: string) {
    const entryKey = key(ownerId, nixId);
    const entryEpoch = epochs.get(entryKey) ?? 0;
    const ownerEpoch = ownerEpochs.get(ownerId) ?? 0;
    return () => {
      if ((epochs.get(entryKey) ?? 0) !== entryEpoch || (ownerEpochs.get(ownerId) ?? 0) !== ownerEpoch) {
        throw new AccountStorageCancelledError();
      }
    };
  }
  function invalidate(ownerId: string, nixId: string) {
    const entryKey = key(ownerId, nixId);
    epochs.set(entryKey, (epochs.get(entryKey) ?? 0) + 1);
  }
  function remove(ownerId: string, nixId: string) {
    invalidate(ownerId, nixId);
    return operations.run(ownerId, () => mutate(() => backend.delete(ownerId, nixId)));
  }
  function clear(ownerId: string) {
    ownerEpochs.set(ownerId, (ownerEpochs.get(ownerId) ?? 0) + 1);
    return operations.clear(ownerId, async () => {
      try { await mutate(() => backend.deleteOwner(ownerId)); }
      finally { await codec.clear(ownerId); }
    });
  }
  async function sweepWithinMutation(reservedBytes = 0, replacement?: { ownerId: string; nixId: string }) {
    const rows = await backend.list();
    const retained: { row: PhotoCacheIndexRow; metadata: PhotoCacheMetadata }[] = [];
    for (const row of rows) {
      if (row.ownerId === replacement?.ownerId && row.nixId === replacement.nixId) {
        await backend.delete(row.ownerId, row.nixId);
        continue;
      }
      let metadata: PhotoCacheMetadata | undefined;
      try {
        metadata = parseMetadata(row);
      } catch { /* An invalid row is deleted independently. */ }
      if (!metadata || metadata.expiresAt <= now()) {
        invalidate(row.ownerId, row.nixId);
        await backend.delete(row.ownerId, row.nixId);
      } else retained.push({ row, metadata });
    }
    let total = reservedBytes + retained.reduce((sum, item) => sum + item.row.byteSize, 0);
    for (const item of retained.sort((a, b) => a.metadata.createdAt - b.metadata.createdAt)) {
      if (total <= maxBytes) break;
      invalidate(item.row.ownerId, item.row.nixId);
      await backend.delete(item.row.ownerId, item.row.nixId);
      total -= item.row.byteSize;
    }
  }
  function sweep() { return mutate(() => sweepWithinMutation()); }
  async function entries(ownerId: string) {
    return operations.run(ownerId, async (assertActive) => {
      const rows = await backend.list(ownerId);
      assertActive();
      return rows.flatMap((row) => { try { return [parseMetadata(row)]; } catch { return []; } });
    });
  }
  async function read(ownerId: string, nixId: string, mediaPath: string) {
    const assertTicket = ticket(ownerId, nixId);
    return operations.run(ownerId, async (assertActive) => {
      const row = await backend.get(ownerId, nixId);
      assertActive(); assertTicket();
      if (!row) return null;
      try {
        const metadata = parseMetadata(row);
        if (metadata.mediaPath !== mediaPath || metadata.expiresAt <= now()) {
          await mutate(() => backend.delete(ownerId, nixId));
          return null;
        }
        const base64 = await codec.decrypt(ownerId, row.ciphertext, metadata);
        assertActive(); assertTicket();
        if (metadata.expiresAt <= now()) {
          await mutate(() => backend.delete(ownerId, nixId));
          return null;
        }
        return { base64, metadata };
      } catch (error) {
        if (error instanceof AccountStorageCancelledError) throw error;
        assertActive(); assertTicket();
        await mutate(() => backend.delete(ownerId, nixId));
        return null;
      }
    });
  }
  async function write(input: { ownerId: string; nixId: string; mediaPath: string; base64: string; contentType: string; replayExpiresAt?: number; assertTicket?: () => void }) {
    const assertTicket = input.assertTicket ?? ticket(input.ownerId, input.nixId);
    const result = await operations.run(input.ownerId, (assertActive) => mutate(async () => {
      assertTicket();
      const existing = (await backend.list(input.ownerId)).find((row) => row.nixId === input.nixId);
      assertActive(); assertTicket();
      let previous: PhotoCacheMetadata | undefined;
      try { if (existing) previous = parseMetadata(existing); } catch { /* Replace one corrupt row. */ }
      const createdAt = previous?.createdAt ?? now();
      const metadata: PhotoCacheMetadata = {
        version: 1, ownerId: input.ownerId, nixId: input.nixId, mediaPath: input.mediaPath,
        contentType: input.contentType, createdAt,
        expiresAt: input.replayExpiresAt ?? previous?.expiresAt ?? createdAt + PHOTO_CACHE_FIRST_VIEW_TTL_MS,
        phase: input.replayExpiresAt === undefined ? (previous?.phase ?? 'unviewed') : 'replay',
      };
      if (!Number.isFinite(metadata.expiresAt) || metadata.expiresAt <= now()) throw new Error('Photo availability expired');
      const ciphertext = await codec.encrypt(input.ownerId, input.base64, metadata);
      assertActive(); assertTicket();
      if (metadata.expiresAt <= now()) throw new Error('Photo availability expired');
      const encodedMetadata = JSON.stringify(metadata);
      const byteSize = ciphertext.length + new TextEncoder().encode(encodedMetadata).byteLength;
      if (byteSize > Math.min(maxBytes, PHOTO_CACHE_MAX_ROW_BYTES)) throw new Error('Encrypted photo exceeds cache size limit');
      await sweepWithinMutation(byteSize, input);
      assertActive(); assertTicket();
      if (metadata.expiresAt <= now()) throw new Error('Photo availability expired');
      await backend.put({ ownerId: input.ownerId, nixId: input.nixId, metadata: encodedMetadata, ciphertext,
        byteSize });
      assertActive(); assertTicket();
      if (metadata.expiresAt <= now()) {
        await backend.delete(input.ownerId, input.nixId);
        throw new Error('Photo availability expired');
      }
      return metadata;
    }));
    await sweep();
    assertTicket();
    if (result.expiresAt <= now()) {
      await remove(input.ownerId, input.nixId);
      throw new Error('Photo availability expired');
    }
    return result;
  }
  async function retainForReplay(ownerId: string, nixId: string, mediaPath: string, replayExpiresAt: number) {
    const assertTicket = ticket(ownerId, nixId);
    const existing = await read(ownerId, nixId, mediaPath);
    assertTicket();
    if (!existing) return;
    await write({ ownerId, nixId, mediaPath, base64: existing.base64, contentType: existing.metadata.contentType, replayExpiresAt, assertTicket });
  }
  return { ticket, read, write, remove, clear, sweep, entries, retainForReplay };
}

let databasePromise: Promise<SQLiteDatabase> | null = null;
async function database() {
  databasePromise ??= openDatabaseAsync('nix-encrypted-photos.db').then(async (db) => {
    await db.execAsync(`PRAGMA page_size = 4096;
      PRAGMA max_page_count = ${PHOTO_CACHE_PAYLOAD_BUDGET_BYTES / 4096};
      PRAGMA auto_vacuum = FULL;
      PRAGMA journal_mode = DELETE;
      PRAGMA busy_timeout = 5000;
      PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS encrypted_photos (
        owner_id TEXT NOT NULL, nix_id TEXT NOT NULL, metadata TEXT NOT NULL,
        ciphertext TEXT NOT NULL, byte_size INTEGER NOT NULL, PRIMARY KEY(owner_id, nix_id));`);
    return db;
  });
  return databasePromise;
}
const backend: PhotoCacheBackend = {
  async list(ownerId) {
    const db = await database();
    return ownerId === undefined
      ? db.getAllAsync<PhotoCacheIndexRow>('SELECT owner_id AS ownerId, nix_id AS nixId, metadata, byte_size AS byteSize FROM encrypted_photos')
      : db.getAllAsync<PhotoCacheIndexRow>('SELECT owner_id AS ownerId, nix_id AS nixId, metadata, byte_size AS byteSize FROM encrypted_photos WHERE owner_id = ?', ownerId);
  },
  async get(ownerId, nixId) {
    return (await database()).getFirstAsync<PhotoCacheRow>('SELECT owner_id AS ownerId, nix_id AS nixId, metadata, ciphertext, byte_size AS byteSize FROM encrypted_photos WHERE owner_id = ? AND nix_id = ?', ownerId, nixId);
  },
  async put(row) {
    if (row.byteSize > PHOTO_CACHE_MAX_ROW_BYTES) throw new Error('Encrypted photo exceeds cache row limit');
    const db = await database();
    await db.runAsync('INSERT OR REPLACE INTO encrypted_photos(owner_id,nix_id,metadata,ciphertext,byte_size) VALUES (?,?,?,?,?)',
      row.ownerId, row.nixId, row.metadata, row.ciphertext, row.byteSize);
  },
  async delete(ownerId, nixId) { await (await database()).runAsync('DELETE FROM encrypted_photos WHERE owner_id = ? AND nix_id = ?', ownerId, nixId); },
  async deleteOwner(ownerId) {
    const db = await database();
    const ids = await db.getAllAsync<{ nixId: string }>('SELECT nix_id AS nixId FROM encrypted_photos WHERE owner_id = ?', ownerId);
    // Each autocommit touches one bounded row; never create a whole-account rollback journal.
    for (const { nixId } of ids) await db.runAsync('DELETE FROM encrypted_photos WHERE owner_id = ? AND nix_id = ?', ownerId, nixId);
  },
};
const codec: PhotoCacheCodec = {
  async encrypt(ownerId, base64, metadata) {
    const key = await accountEncryptionKeys.get(`${KEY_PREFIX}.${ownerId}`);
    return (await aesEncryptAsync(base64, key, { additionalData: photoCacheAdditionalData(metadata) })).combined('base64');
  },
  async decrypt(ownerId, ciphertext, metadata) {
    const key = await accountEncryptionKeys.get(`${KEY_PREFIX}.${ownerId}`);
    return aesDecryptAsync(AESSealedData.fromCombined(ciphertext), key, { output: 'base64', additionalData: photoCacheAdditionalData(metadata) });
  },
  clear: (ownerId) => accountEncryptionKeys.clear(`${KEY_PREFIX}.${ownerId}`),
};
export const encryptedPhotoCache = createEncryptedPhotoCache(backend, codec);
export const deletePhotoCacheForNix = (ownerId: string, nixId: string) => encryptedPhotoCache.remove(ownerId, nixId);
export const clearPhotoCache = (ownerId: string) => encryptedPhotoCache.clear(ownerId);
