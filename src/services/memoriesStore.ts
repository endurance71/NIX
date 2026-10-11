import AsyncStorage from '@react-native-async-storage/async-storage';
import { AESSealedData, aesDecryptAsync, aesEncryptAsync, randomUUID } from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { accountEncryptionKeys, AccountStorageCancelledError } from '../lib/accountEncryptionKeys';
import { createOwnerOperations } from '../lib/ownerOperations';
import { generateVideoThumbnailAtTime } from '../lib/videoThumbnails';
import {
  MEMORIES_MAX_BYTES,
  MEMORY_THUMBNAIL_MAX_EDGE,
  memoriesIndexAdditionalData,
  memoryChunkCount,
  memoryCipherBytes,
  memoryContentType,
  memoryFileExtension,
  parseMemoriesIndex,
  parseMemoriesPreference,
  planMemoriesPrune,
  type MemoriesIndex,
  type MemoriesPreference,
  type MemoryEntry,
  type MemoryMediaType,
} from '../lib/memories';
import { decryptMemoryChunks, encryptMemoryChunks, type MemoryByteReader } from '../lib/memoriesCrypto';

/*
 * Storage layout (per signed-in owner, never shared between accounts):
 *   Documents/nix-memories/<ownerId>/index.bin      AES-GCM sealed JSON index
 *   Documents/nix-memories/<ownerId>/<id>.media     chunked AES-GCM media (photo or video)
 *   Documents/nix-memories/<ownerId>/<id>.thumb     sealed JPEG thumbnail for the grid
 * The key lives in the Keychain (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), so a device backup only
 * carries ciphertext that cannot be opened on another device. Plaintext exists only transiently:
 * photos are decrypted into memory (data URI); a video is decrypted into Caches/nix-memories-tmp for
 * playback / „Send again” / „Save to Photos” and deleted afterwards (plus a sweep on screen open).
 */

const KEY_PREFIX = 'nix.memories.key.v1';
const PREFERENCE_PREFIX = 'nix.memories.preference.v1';
const OWNER_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const TEMP_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const rootDirectory = () => new Directory(Paths.document, 'nix-memories');
const tempDirectory = () => new Directory(Paths.cache, 'nix-memories-tmp');

function ownerDirectory(ownerId: string) {
  if (!OWNER_ID_PATTERN.test(ownerId)) throw new Error('Invalid memories owner');
  return new Directory(rootDirectory(), ownerId);
}

function ensureDirectory(directory: Directory) {
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
}

function deleteQuietly(target: File | Directory) {
  try {
    if (target.exists) target.delete();
  } catch {
    // Best effort: a leftover file is swept on the next open.
  }
}

const operations = createOwnerOperations();
const listeners = new Set<(ownerId: string) => void>();

/** Notifies mounted Memories screens that the album of `ownerId` changed. */
export function subscribeMemories(listener: (ownerId: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(ownerId: string) {
  for (const listener of listeners) listener(ownerId);
}

async function encryptionKey(ownerId: string) {
  return accountEncryptionKeys.get(`${KEY_PREFIX}.${ownerId}`);
}

async function sealBytes(ownerId: string, plain: Uint8Array, additionalData: Uint8Array) {
  const key = await encryptionKey(ownerId);
  return (await aesEncryptAsync(plain, key, { additionalData })).combined('bytes');
}

async function openBytes(ownerId: string, sealed: Uint8Array, additionalData: Uint8Array) {
  const key = await encryptionKey(ownerId);
  return aesDecryptAsync(AESSealedData.fromCombined(sealed), key, { additionalData });
}

async function openBase64(ownerId: string, sealed: Uint8Array, additionalData: Uint8Array) {
  const key = await encryptionKey(ownerId);
  return aesDecryptAsync(AESSealedData.fromCombined(sealed), key, { additionalData, output: 'base64' });
}

function fileReader(file: File): MemoryByteReader & { close(): void } {
  const handle = file.open(FileMode.ReadOnly);
  return {
    read: (length) => (length === 0 ? new Uint8Array(0) : handle.readBytes(length)),
    close: () => handle.close(),
  };
}

function bytesReader(bytes: Uint8Array): MemoryByteReader {
  let offset = 0;
  return {
    read(length) {
      const slice = bytes.subarray(offset, offset + length);
      offset += length;
      return slice;
    },
  };
}

async function readIndexUnlocked(ownerId: string): Promise<MemoriesIndex> {
  const file = new File(ownerDirectory(ownerId), 'index.bin');
  if (!file.exists) return { version: 1, ownerId, entries: [] };
  try {
    const plain = await openBytes(ownerId, await file.bytes(), memoriesIndexAdditionalData(ownerId));
    return parseMemoriesIndex(new TextDecoder().decode(plain), ownerId);
  } catch (error) {
    if (error instanceof AccountStorageCancelledError) throw error;
    // Unreadable (e.g. restored from a backup onto another device: the key is device-only). The
    // ciphertext can never be opened again, so drop the whole album instead of keeping dead bytes.
    deleteQuietly(ownerDirectory(ownerId));
    return { version: 1, ownerId, entries: [] };
  }
}

async function writeIndexUnlocked(index: MemoriesIndex) {
  const directory = ownerDirectory(index.ownerId);
  ensureDirectory(directory);
  const sealed = await sealBytes(index.ownerId, new TextEncoder().encode(JSON.stringify(index)), memoriesIndexAdditionalData(index.ownerId));
  const temporary = new File(directory, 'index.tmp');
  temporary.create({ overwrite: true });
  temporary.write(sealed);
  temporary.move(new File(directory, 'index.bin'), { overwrite: true });
}

function deleteEntryFiles(ownerId: string, id: string) {
  const directory = ownerDirectory(ownerId);
  deleteQuietly(new File(directory, `${id}.media`));
  deleteQuietly(new File(directory, `${id}.thumb`));
  deleteQuietly(new File(directory, `${id}.media.tmp`));
}

/** Files that no index row points to (crash between write and index update). */
function sweepOrphansUnlocked(index: MemoriesIndex) {
  const directory = ownerDirectory(index.ownerId);
  if (!directory.exists) return;
  const known = new Set(index.entries.map((entry) => entry.id));
  for (const item of directory.list()) {
    if (!(item instanceof File)) continue;
    const name = item.name;
    if (name === 'index.bin') continue;
    const id = name.replace(/\.(media|thumb|media\.tmp)$/, '');
    if (name === 'index.tmp' || !known.has(id)) deleteQuietly(item);
  }
}

export async function listMemories(ownerId: string): Promise<MemoryEntry[]> {
  return operations.run(ownerId, async () => {
    const index = await readIndexUnlocked(ownerId);
    return [...index.entries].sort((a, b) => b.createdAt - a.createdAt);
  });
}

// ─── capture ──────────────────────────────────────────────────────────────────

export type MemoryCaptureItem = {
  uri: string;
  mediaType: MemoryMediaType;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
};

export type StagedMemoryItem = MemoryCaptureItem & { stagedUri: string };

/**
 * Copies the delivery files right away (the draft may delete them once the preview closes);
 * encryption then works from the private copies.
 */
export async function stageMemoryItems(items: readonly MemoryCaptureItem[]): Promise<StagedMemoryItem[]> {
  const directory = new Directory(tempDirectory(), 'staging');
  ensureDirectory(directory);
  const copies = await Promise.all(items.map(async (item): Promise<StagedMemoryItem | null> => {
    const source = new File(item.uri);
    if (!source.exists) return null;
    const destination = new File(directory, `${randomUUID()}.${memoryFileExtension(item.uri, item.mediaType)}`);
    await source.copy(destination);
    return { ...item, stagedUri: destination.uri };
  }));
  return copies.filter((item): item is StagedMemoryItem => item !== null);
}

export function discardStagedMemoryItems(items: readonly StagedMemoryItem[]) {
  for (const item of items) deleteQuietly(new File(item.stagedUri));
}

async function thumbnailBase64(item: StagedMemoryItem): Promise<string | null> {
  try {
    const source = item.mediaType === 'video'
      ? await generateVideoThumbnailAtTime(item.stagedUri, 0, { maxWidth: MEMORY_THUMBNAIL_MAX_EDGE * 2 })
      : item.stagedUri;
    if (!source) {
      console.warn('[Memories] no video frame for the thumbnail');
      return null;
    }
    const context = ImageManipulator.manipulate(source);
    try {
      const rendered = await context.renderAsync();
      try {
        const longEdge = Math.max(rendered.width, rendered.height);
        const resizeContext = ImageManipulator.manipulate(rendered);
        try {
          if (longEdge > MEMORY_THUMBNAIL_MAX_EDGE) {
            if (rendered.height > rendered.width) resizeContext.resize({ height: MEMORY_THUMBNAIL_MAX_EDGE });
            else resizeContext.resize({ width: MEMORY_THUMBNAIL_MAX_EDGE });
          }
          const resized = await resizeContext.renderAsync();
          try {
            const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
            // The manipulator always writes a plaintext file too; keep only the in-memory base64.
            deleteQuietly(new File(saved.uri));
            return saved.base64 ?? null;
          } finally {
            resized.release();
          }
        } finally {
          resizeContext.release();
        }
      } finally {
        rendered.release();
      }
    } finally {
      context.release();
    }
  } catch (error) {
    // The memory is still saved, only without a grid thumbnail.
    console.warn('[Memories] thumbnail failed', item.mediaType, error);
    return null;
  }
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Encrypts sent media into the album (oldest memories are pruned to stay under the cap). Always
 * deletes the staged plaintext copies, also on failure. Never throws.
 */
export async function saveStagedMemories(ownerId: string, items: readonly StagedMemoryItem[], recipientNames: readonly string[]) {
  try {
    await operations.run(ownerId, async (assertActive) => {
      const directory = ownerDirectory(ownerId);
      ensureDirectory(directory);
      for (const item of items) {
        const source = new File(item.stagedUri);
        if (!source.exists) continue;
        const plainBytes = source.size;
        const id = randomUUID();
        // One item at a time inside the owner queue: index updates and the cap check must not race.
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const thumbnail = await thumbnailBase64(item);
        const thumbnailBytes = thumbnail ? base64ToBytes(thumbnail) : null;
        const storedBytes = memoryCipherBytes(plainBytes) + (thumbnailBytes ? memoryCipherBytes(thumbnailBytes.byteLength) : 0);
        if (storedBytes > MEMORIES_MAX_BYTES) continue;
        assertActive();

        const index = await readIndexUnlocked(ownerId);
        const prune = new Set(planMemoriesPrune(index.entries, storedBytes));
        for (const prunedId of prune) deleteEntryFiles(ownerId, prunedId);
        index.entries = index.entries.filter((entry) => !prune.has(entry.id));
        if (prune.size > 0) await writeIndexUnlocked(index);

        const temporary = new File(directory, `${id}.media.tmp`);
        temporary.create({ overwrite: true });
        const writer = temporary.open(FileMode.WriteOnly);
        const reader = fileReader(source);
        try {
          await encryptMemoryChunks({
            target: { ownerId, memoryId: id, kind: 'media' },
            plainBytes,
            reader,
            writer: { write: (bytes) => writer.writeBytes(bytes) },
            seal: (plain, additionalData) => sealBytes(ownerId, plain, additionalData),
            assertActive,
          });
        } finally {
          reader.close();
          writer.close();
        }
        temporary.move(new File(directory, `${id}.media`), { overwrite: true });
        if (thumbnailBytes) {
          const chunks: Uint8Array[] = [];
          await encryptMemoryChunks({
            target: { ownerId, memoryId: id, kind: 'thumb' },
            plainBytes: thumbnailBytes.byteLength,
            reader: bytesReader(thumbnailBytes),
            writer: { write: (bytes) => { chunks.push(bytes); } },
            seal: (plain, additionalData) => sealBytes(ownerId, plain, additionalData),
            assertActive,
          });
          const thumbFile = new File(directory, `${id}.thumb`);
          thumbFile.create({ overwrite: true });
          const handle = thumbFile.open(FileMode.WriteOnly);
          try {
            for (const chunk of chunks) handle.writeBytes(chunk);
          } finally {
            handle.close();
          }
        }
        assertActive();
        const entry: MemoryEntry = {
          version: 1,
          id,
          ownerId,
          mediaType: item.mediaType,
          createdAt: Date.now(),
          recipientNames: [...recipientNames],
          extension: memoryFileExtension(item.uri, item.mediaType),
          durationMs: item.durationMs ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          plainBytes,
          chunkCount: memoryChunkCount(plainBytes),
          storedBytes,
          thumbnailBytes: thumbnailBytes ? thumbnailBytes.byteLength : null,
        };
        const latest = await readIndexUnlocked(ownerId);
        latest.entries.push(entry);
        await writeIndexUnlocked(latest);
      }
    });
    emit(ownerId);
  } catch (error) {
    if (!(error instanceof AccountStorageCancelledError)) console.warn('[memories] save failed', error);
  } finally {
    discardStagedMemoryItems(items);
  }
}

// ─── reading ──────────────────────────────────────────────────────────────────

const thumbnailCache = new Map<string, string>();
const THUMBNAIL_CACHE_LIMIT = 240;

/** Grid thumbnail as a data URI (kept in memory only), or null when there is none. */
export async function loadMemoryThumbnail(entry: MemoryEntry): Promise<string | null> {
  if (!entry.thumbnailBytes) return null;
  const thumbnailBytes = entry.thumbnailBytes;
  const cacheKey = `${entry.ownerId}:${entry.id}`;
  const cached = thumbnailCache.get(cacheKey);
  if (cached) return cached;
  return operations.run(entry.ownerId, async () => {
    const file = new File(ownerDirectory(entry.ownerId), `${entry.id}.thumb`);
    if (!file.exists) return null;
    const sealed = await file.bytes();
    const parts: string[] = [];
    try {
      await decryptMemoryChunks({
        target: { ownerId: entry.ownerId, memoryId: entry.id, kind: 'thumb' },
        plainBytes: thumbnailBytes,
        reader: bytesReader(sealed),
        open: (chunk, additionalData) => openBase64(entry.ownerId, chunk, additionalData),
        onChunk: (part) => { parts.push(part); },
      });
    } catch {
      return null;
    }
    const uri = `data:image/jpeg;base64,${parts.join('')}`;
    if (thumbnailCache.size >= THUMBNAIL_CACHE_LIMIT) {
      const oldest = thumbnailCache.keys().next().value;
      if (oldest !== undefined) thumbnailCache.delete(oldest);
    }
    thumbnailCache.set(cacheKey, uri);
    return uri;
  });
}

/** Full photo as a data URI: decrypted straight into memory, never written to disk. */
export async function loadMemoryPhotoDataUri(entry: MemoryEntry): Promise<string> {
  if (entry.mediaType !== 'image') throw new Error('Not a photo memory');
  return operations.run(entry.ownerId, async (assertActive) => {
    const file = new File(ownerDirectory(entry.ownerId), `${entry.id}.media`);
    const reader = fileReader(file);
    const parts: string[] = [];
    try {
      await decryptMemoryChunks({
        target: { ownerId: entry.ownerId, memoryId: entry.id, kind: 'media' },
        plainBytes: entry.plainBytes,
        reader,
        open: (chunk, additionalData) => openBase64(entry.ownerId, chunk, additionalData),
        onChunk: (part) => { parts.push(part); },
        assertActive,
      });
    } finally {
      reader.close();
    }
    return `data:${memoryContentType(entry)};base64,${parts.join('')}`;
  });
}

export type MemoryExportPurpose = 'play' | 'resend' | 'save';

/**
 * Decrypts a memory into a plaintext file in Caches (video playback, „Send again”, „Save to
 * Photos”). The caller deletes it with `releaseMemoryFile` when done; leftovers are swept.
 */
export async function exportMemoryToFile(entry: MemoryEntry, purpose: MemoryExportPurpose): Promise<string> {
  return operations.run(entry.ownerId, async (assertActive) => {
    const directory = new Directory(tempDirectory(), purpose);
    ensureDirectory(directory);
    const destination = new File(directory, `${entry.id}-${randomUUID().slice(0, 8)}.${entry.extension}`);
    destination.create({ overwrite: true });
    const writer = destination.open(FileMode.WriteOnly);
    const reader = fileReader(new File(ownerDirectory(entry.ownerId), `${entry.id}.media`));
    try {
      await decryptMemoryChunks({
        target: { ownerId: entry.ownerId, memoryId: entry.id, kind: 'media' },
        plainBytes: entry.plainBytes,
        reader,
        open: (chunk, additionalData) => openBytes(entry.ownerId, chunk, additionalData),
        onChunk: (plain) => writer.writeBytes(plain),
        assertActive,
      });
    } catch (error) {
      writer.close();
      reader.close();
      deleteQuietly(destination);
      throw error;
    }
    writer.close();
    reader.close();
    return destination.uri;
  });
}

export function releaseMemoryFile(uri: string | null | undefined) {
  if (!uri) return;
  deleteQuietly(new File(uri));
}

/**
 * Deletes decrypted leftovers. `resend` copies feed the preview draft, so only old ones go;
 * `play` and `save` copies are always transient.
 */
export function sweepMemoryTempFiles(now = Date.now()) {
  const root = tempDirectory();
  if (!root.exists) return;
  for (const purpose of ['play', 'save', 'resend', 'staging'] as const) {
    const directory = new Directory(root, purpose);
    if (!directory.exists) continue;
    for (const item of directory.list()) {
      if (!(item instanceof File)) continue;
      const modified = item.modificationTime ?? 0;
      const transient = purpose === 'play' || purpose === 'save';
      if (transient || now - modified > TEMP_MAX_AGE_MS) deleteQuietly(item);
    }
  }
}

// ─── deletion ─────────────────────────────────────────────────────────────────

export async function deleteMemory(ownerId: string, id: string) {
  await operations.run(ownerId, async () => {
    const index = await readIndexUnlocked(ownerId);
    index.entries = index.entries.filter((entry) => entry.id !== id);
    await writeIndexUnlocked(index);
    deleteEntryFiles(ownerId, id);
    thumbnailCache.delete(`${ownerId}:${id}`);
  });
  emit(ownerId);
}

/** „Delete all” in the album: removes media and index but keeps the saving preference. */
export async function deleteAllMemories(ownerId: string) {
  await operations.run(ownerId, async () => {
    deleteQuietly(ownerDirectory(ownerId));
    for (const key of thumbnailCache.keys()) if (key.startsWith(`${ownerId}:`)) thumbnailCache.delete(key);
  });
  emit(ownerId);
}

/** Sign-out / account deletion: album, key and preference of this account. */
export async function clearMemories(ownerId: string) {
  if (!OWNER_ID_PATTERN.test(ownerId)) return;
  for (const key of thumbnailCache.keys()) if (key.startsWith(`${ownerId}:`)) thumbnailCache.delete(key);
  await operations.clear(ownerId, async () => {
    try {
      deleteQuietly(ownerDirectory(ownerId));
      sweepMemoryTempFiles(Number.POSITIVE_INFINITY);
      await AsyncStorage.removeItem(`${PREFERENCE_PREFIX}.${ownerId}`);
    } finally {
      await accountEncryptionKeys.clear(`${KEY_PREFIX}.${ownerId}`);
    }
  });
  emit(ownerId);
}

/** Runs index/orphan housekeeping; called when the album screen opens. */
export async function tidyMemories(ownerId: string) {
  sweepMemoryTempFiles();
  await operations.run(ownerId, async () => {
    const index = await readIndexUnlocked(ownerId);
    sweepOrphansUnlocked(index);
  });
}

// ─── preference ───────────────────────────────────────────────────────────────

export async function getMemoriesPreference(ownerId: string): Promise<MemoriesPreference> {
  try {
    return parseMemoriesPreference(await AsyncStorage.getItem(`${PREFERENCE_PREFIX}.${ownerId}`));
  } catch {
    return 'unset';
  }
}

export async function setMemoriesPreference(ownerId: string, enabled: boolean) {
  await AsyncStorage.setItem(`${PREFERENCE_PREFIX}.${ownerId}`, enabled ? 'on' : 'off');
  emit(ownerId);
}
