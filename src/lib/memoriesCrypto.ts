import {
  MEMORY_CHUNK_BYTES,
  MEMORY_CHUNK_OVERHEAD_BYTES,
  memoryChunkAdditionalData,
  memoryChunkCount,
  memoryCipherBytes,
} from './memories';

/** AES-GCM seal of one chunk; returns IV ‖ ciphertext ‖ tag. */
export type MemoryChunkSealer = (plain: Uint8Array, additionalData: Uint8Array) => Promise<Uint8Array>;
/** Opens one sealed chunk (throws on a wrong key, tampering or a wrong position). */
export type MemoryChunkOpener<T> = (sealed: Uint8Array, additionalData: Uint8Array) => Promise<T>;

export type MemoryByteReader = { read(length: number): Uint8Array | Promise<Uint8Array> };
export type MemoryByteWriter = { write(bytes: Uint8Array): void | Promise<void> };

type ChunkTarget = { ownerId: string; memoryId: string; kind: 'media' | 'thumb' };

/**
 * Streams `plainBytes` from `reader` into `writer` as independently sealed chunks, so a 100 MB
 * video never sits in JS memory as a whole. Returns the number of bytes written.
 */
export async function encryptMemoryChunks({
  target,
  plainBytes,
  reader,
  writer,
  seal,
  assertActive,
}: {
  target: ChunkTarget;
  plainBytes: number;
  reader: MemoryByteReader;
  writer: MemoryByteWriter;
  seal: MemoryChunkSealer;
  assertActive?: () => void;
}) {
  const count = memoryChunkCount(plainBytes);
  let written = 0;
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    const length = isLast ? plainBytes - index * MEMORY_CHUNK_BYTES : MEMORY_CHUNK_BYTES;
    // Chunks are streamed in order on purpose: parallel reads would hold the whole file in memory.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const plain = await reader.read(length);
    if (plain.byteLength !== length) throw new Error('Memory source ended early');
    const sealed = await seal(plain, memoryChunkAdditionalData(target.ownerId, target.memoryId, target.kind, index, isLast));
    assertActive?.();
    await writer.write(sealed);
    written += sealed.byteLength;
  }
  if (written !== memoryCipherBytes(plainBytes)) throw new Error('Unexpected memory ciphertext size');
  return written;
}

/** Reads and opens every chunk in order, handing each plaintext piece to `onChunk`. */
export async function decryptMemoryChunks<T>({
  target,
  plainBytes,
  reader,
  open,
  onChunk,
  assertActive,
}: {
  target: ChunkTarget;
  plainBytes: number;
  reader: MemoryByteReader;
  open: MemoryChunkOpener<T>;
  onChunk: (plain: T, index: number) => void | Promise<void>;
  assertActive?: () => void;
}) {
  const count = memoryChunkCount(plainBytes);
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    const plainLength = isLast ? plainBytes - index * MEMORY_CHUNK_BYTES : MEMORY_CHUNK_BYTES;
    const sealedLength = plainLength + MEMORY_CHUNK_OVERHEAD_BYTES;
    // Sequential by design (bounded memory, ordered output).
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const sealed = await reader.read(sealedLength);
    if (sealed.byteLength !== sealedLength) throw new Error('Memory ciphertext is truncated');
    const plain = await open(sealed, memoryChunkAdditionalData(target.ownerId, target.memoryId, target.kind, index, isLast));
    assertActive?.();
    await onChunk(plain, index);
  }
}
