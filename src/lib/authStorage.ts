import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';

const MANIFEST_VERSION = 1;
const CHUNK_CODEPOINTS = 400;
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

type ChunkManifest = {
  version: typeof MANIFEST_VERSION;
  generation: string;
  chunks: number;
};

const manifestKey = (key: string) => `${key}.nix.manifest`;
const chunkKey = (key: string, generation: string, index: number) =>
  `${key}.nix.${generation}.${index}`;

function splitIntoChunks(value: string): string[] {
  const codepoints = Array.from(value);
  const chunks: string[] = [];
  for (let index = 0; index < codepoints.length; index += CHUNK_CODEPOINTS) {
    chunks.push(codepoints.slice(index, index + CHUNK_CODEPOINTS).join(''));
  }
  return chunks.length > 0 ? chunks : [''];
}

function parseManifest(raw: string | null): ChunkManifest | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ChunkManifest>;
    if (
      value.version !== MANIFEST_VERSION ||
      typeof value.generation !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(value.generation) ||
      !Number.isInteger(value.chunks) ||
      (value.chunks ?? 0) < 1 ||
      (value.chunks ?? 0) > 128
    ) {
      throw new Error('Invalid auth storage manifest');
    }
    return value as ChunkManifest;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid auth storage manifest') throw error;
    throw new Error('Invalid auth storage manifest', { cause: error });
  }
}

async function deleteGeneration(key: string, manifest: ChunkManifest | null) {
  if (!manifest) return;
  await Promise.allSettled(
    Array.from({ length: manifest.chunks }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, manifest.generation, index), SECURE_OPTIONS)
    )
  );
}

function generationDeleteOperations(key: string, manifest: ChunkManifest | null) {
  if (!manifest) return [];
  return Array.from({ length: manifest.chunks }, (_, index) =>
    SecureStore.deleteItemAsync(chunkKey(key, manifest.generation, index), SECURE_OPTIONS)
  );
}

async function readChunkedValue(key: string): Promise<string | null> {
  const manifest = parseManifest(
    await SecureStore.getItemAsync(manifestKey(key), SECURE_OPTIONS)
  );
  if (!manifest) return null;
  const chunks = await Promise.all(
    Array.from({ length: manifest.chunks }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(key, manifest.generation, index), SECURE_OPTIONS)
    )
  );
  if (chunks.some((chunk) => chunk === null)) {
    throw new Error('Incomplete auth storage generation');
  }
  return chunks.join('');
}

function nextGeneration() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const chunked = await readChunkedValue(key);
    if (chunked !== null) return chunked;

    const legacySecure = await SecureStore.getItemAsync(key);
    if (legacySecure !== null) {
      try {
        await authStorage.setItem(key, legacySecure);
        await SecureStore.deleteItemAsync(key);
      } catch {
        // The readable legacy value remains the source of truth until migration succeeds.
      }
      return legacySecure;
    }

    const legacyAsync = await AsyncStorage.getItem(key);
    if (legacyAsync === null) return null;
    try {
      await authStorage.setItem(key, legacyAsync);
      await AsyncStorage.removeItem(key);
    } catch {
      // Preserve the readable fallback and retry migration on the next access.
    }
    return legacyAsync;
  },

  async setItem(key: string, value: string): Promise<void> {
    const previousManifest = parseManifest(
      await SecureStore.getItemAsync(manifestKey(key), SECURE_OPTIONS)
    );
    const generation = nextGeneration();
    const chunks = splitIntoChunks(value);
    const nextManifest: ChunkManifest = {
      version: MANIFEST_VERSION,
      generation,
      chunks: chunks.length,
    };

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        await SecureStore.setItemAsync(
          chunkKey(key, generation, index),
          chunks[index],
          SECURE_OPTIONS
        );
      }
      await SecureStore.setItemAsync(
        manifestKey(key),
        JSON.stringify(nextManifest),
        SECURE_OPTIONS
      );
    } catch (error) {
      await deleteGeneration(key, nextManifest);
      throw error;
    }

    await deleteGeneration(key, previousManifest);
    await Promise.allSettled([
      SecureStore.deleteItemAsync(key),
      AsyncStorage.removeItem(key),
    ]);
  },

  async removeItem(key: string): Promise<void> {
    let manifest: ChunkManifest | null = null;
    try {
      manifest = parseManifest(
        await SecureStore.getItemAsync(manifestKey(key), SECURE_OPTIONS)
      );
    } catch {
      // Continue deleting every independently addressable auth value.
    }
    const results = await Promise.allSettled([
      ...generationDeleteOperations(key, manifest),
      SecureStore.deleteItemAsync(manifestKey(key), SECURE_OPTIONS),
      SecureStore.deleteItemAsync(key),
      AsyncStorage.removeItem(key),
    ]);
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) throw failed.reason;
  },
};

export async function readPersistedSessionCandidate(storageKey: string): Promise<Session | null> {
  const raw = await authStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Session>;
    if (
      typeof value.access_token !== 'string' ||
      typeof value.refresh_token !== 'string' ||
      typeof value.expires_at !== 'number' ||
      !value.user ||
      typeof value.user.id !== 'string'
    ) {
      return null;
    }
    return value as Session;
  } catch {
    return null;
  }
}

export function isSessionAccessTokenExpired(session: Session, now = Date.now()) {
  return (session.expires_at ?? 0) * 1000 <= now;
}
