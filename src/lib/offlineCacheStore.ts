import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import {
  describeOfflineCacheQuery,
  sanitizeOfflineQueryData,
  type OfflineCacheCategory,
} from './offlineCachePolicy';

const DATABASE_NAME = 'nix-offline-cache.db';
const KEY_PREFIX = 'nix.offline-cache.key.v1';
const PAYLOAD_VERSION = 1;
const MAX_CHAT_PEERS = 20;
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export type OfflineCacheEntry = {
  queryKey: readonly unknown[];
  data: unknown;
  category: OfflineCacheCategory;
  scopeId: string | null;
  dataUpdatedAt: number;
  cachedAt: number;
};

type StoredRow = {
  owner_id: string;
  query_key: string;
  category: OfflineCacheCategory;
  scope_id: string | null;
  encrypted_payload: string;
  data_updated_at: number;
  cached_at: number;
};

type StoredEnvelope = { version: 1; data: unknown };

export type OfflineCacheBackend = {
  upsert(row: StoredRow): Promise<void>;
  list(ownerId: string): Promise<StoredRow[]>;
  deleteOwner(ownerId: string): Promise<void>;
  deleteScope(ownerId: string, category: OfflineCacheCategory, scopeId: string): Promise<void>;
};

export type OfflineCacheCodec = {
  encrypt(ownerId: string, plaintext: string): Promise<string>;
  decrypt(ownerId: string, ciphertext: string): Promise<string>;
  clear(ownerId: string): Promise<void>;
};

function parseQueryKey(raw: string): readonly unknown[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Invalid offline query key');
  return parsed;
}

export function createOfflineCacheStore(
  backend: OfflineCacheBackend,
  codec: OfflineCacheCodec,
  now: () => number = Date.now
) {
  const write = async (
    ownerId: string,
    queryKey: readonly unknown[],
    data: unknown,
    dataUpdatedAt: number
  ) => {
    const descriptor = describeOfflineCacheQuery(queryKey);
    if (!descriptor) return false;
    const sanitized = sanitizeOfflineQueryData(queryKey, data, now());
    const encrypted = await codec.encrypt(ownerId, JSON.stringify({
      version: PAYLOAD_VERSION,
      data: sanitized,
    } satisfies StoredEnvelope));
    const cachedAt = now();
    await backend.upsert({
      owner_id: ownerId,
      query_key: JSON.stringify(queryKey),
      category: descriptor.category,
      scope_id: descriptor.scopeId,
      encrypted_payload: encrypted,
      data_updated_at: dataUpdatedAt,
      cached_at: cachedAt,
    });

    if (descriptor.category === 'chat') {
      const rows = await backend.list(ownerId);
      const latestByScope = new Map<string, number>();
      for (const row of rows) {
        if (row.category !== 'chat' || !row.scope_id) continue;
        latestByScope.set(row.scope_id, Math.max(latestByScope.get(row.scope_id) ?? 0, row.cached_at));
      }
      const staleScopes = [...latestByScope.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(MAX_CHAT_PEERS)
        .map(([scopeId]) => scopeId);
      await Promise.all(staleScopes.map((scopeId) => backend.deleteScope(ownerId, 'chat', scopeId)));
    }
    return true;
  };

  const clear = async (ownerId: string) => {
    await backend.deleteOwner(ownerId);
    await codec.clear(ownerId);
  };

  const read = async (ownerId: string): Promise<OfflineCacheEntry[]> => {
    const rows = await backend.list(ownerId);
    try {
      return await Promise.all(rows.map(async (row) => {
        const queryKey = parseQueryKey(row.query_key);
        const envelope = JSON.parse(
          await codec.decrypt(ownerId, row.encrypted_payload)
        ) as Partial<StoredEnvelope>;
        if (envelope.version !== PAYLOAD_VERSION || !('data' in envelope)) {
          throw new Error('Unsupported offline cache payload');
        }
        const sanitized = sanitizeOfflineQueryData(queryKey, envelope.data, now());
        if (JSON.stringify(sanitized) !== JSON.stringify(envelope.data)) {
          const encryptedPayload = await codec.encrypt(ownerId, JSON.stringify({
            version: PAYLOAD_VERSION,
            data: sanitized,
          } satisfies StoredEnvelope));
          await backend.upsert({ ...row, encrypted_payload: encryptedPayload });
        }
        return {
          queryKey,
          data: sanitized,
          category: row.category,
          scopeId: row.scope_id,
          dataUpdatedAt: row.data_updated_at,
          cachedAt: row.cached_at,
        };
      }));
    } catch (error) {
      await clear(ownerId);
      throw error;
    }
  };

  return { write, read, clear };
}

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function database() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS offline_query_cache (
          owner_id TEXT NOT NULL,
          query_key TEXT NOT NULL,
          category TEXT NOT NULL,
          scope_id TEXT,
          encrypted_payload TEXT NOT NULL,
          data_updated_at INTEGER NOT NULL,
          cached_at INTEGER NOT NULL,
          PRIMARY KEY(owner_id, query_key)
        );
        CREATE INDEX IF NOT EXISTS offline_query_cache_owner_category
          ON offline_query_cache(owner_id, category, cached_at);
      `);
      return db;
    });
  }
  return databasePromise;
}

const sqliteBackend: OfflineCacheBackend = {
  async upsert(row) {
    const db = await database();
    await db.runAsync(
      `INSERT INTO offline_query_cache(
        owner_id, query_key, category, scope_id, encrypted_payload, data_updated_at, cached_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, query_key) DO UPDATE SET
        category = excluded.category,
        scope_id = excluded.scope_id,
        encrypted_payload = excluded.encrypted_payload,
        data_updated_at = excluded.data_updated_at,
        cached_at = excluded.cached_at`,
      row.owner_id,
      row.query_key,
      row.category,
      row.scope_id,
      row.encrypted_payload,
      row.data_updated_at,
      row.cached_at
    );
  },
  async list(ownerId) {
    const db = await database();
    return db.getAllAsync<StoredRow>(
      'SELECT * FROM offline_query_cache WHERE owner_id = ? ORDER BY cached_at DESC',
      ownerId
    );
  },
  async deleteOwner(ownerId) {
    const db = await database();
    await db.runAsync('DELETE FROM offline_query_cache WHERE owner_id = ?', ownerId);
  },
  async deleteScope(ownerId, category, scopeId) {
    const db = await database();
    await db.runAsync(
      'DELETE FROM offline_query_cache WHERE owner_id = ? AND category = ? AND scope_id = ?',
      ownerId,
      category,
      scopeId
    );
  },
};

function keyName(ownerId: string) {
  return `${KEY_PREFIX}.${ownerId}`;
}

async function encryptionKey(ownerId: string) {
  const stored = await SecureStore.getItemAsync(keyName(ownerId), SECURE_OPTIONS);
  if (stored) return AESEncryptionKey.import(stored, 'base64');
  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  await SecureStore.setItemAsync(keyName(ownerId), await key.encoded('base64'), SECURE_OPTIONS);
  return key;
}

const nativeCodec: OfflineCacheCodec = {
  async encrypt(ownerId, plaintext) {
    const key = await encryptionKey(ownerId);
    return (await aesEncryptAsync(new TextEncoder().encode(plaintext), key)).combined('base64');
  },
  async decrypt(ownerId, ciphertext) {
    const key = await encryptionKey(ownerId);
    const decrypted = await aesDecryptAsync(AESSealedData.fromCombined(ciphertext), key);
    const bytes = typeof decrypted === 'string'
      ? Uint8Array.from(atob(decrypted), (character) => character.charCodeAt(0))
      : decrypted;
    return new TextDecoder().decode(bytes);
  },
  async clear(ownerId) {
    await SecureStore.deleteItemAsync(keyName(ownerId), SECURE_OPTIONS);
  },
};

export const offlineCacheStore = createOfflineCacheStore(sqliteBackend, nativeCodec);

export function clearOfflineCache(ownerId: string) {
  return offlineCacheStore.clear(ownerId);
}
