import { describe, expect, it } from 'vitest';
import { MEMORY_CHUNK_BYTES, memoryCipherBytes } from './memories';
import { decryptMemoryChunks, encryptMemoryChunks, type MemoryByteReader } from './memoriesCrypto';

const OWNER = 'owner-0000-1111';
const TARGET = { ownerId: OWNER, memoryId: 'memory-0001', kind: 'media' as const };

/** Fake AEAD with the real 28-byte overhead: 12-byte "IV" + payload + 16-byte AAD digest "tag". */
function digest(additionalData: Uint8Array) {
  const tag = new Uint8Array(16);
  additionalData.forEach((byte, index) => {
    tag[index % 16] = (tag[index % 16] * 31 + byte) & 0xff;
  });
  return tag;
}

async function seal(plain: Uint8Array, additionalData: Uint8Array) {
  const sealed = new Uint8Array(12 + plain.byteLength + 16);
  plain.forEach((byte, index) => {
    sealed[12 + index] = byte ^ 0x5a;
  });
  sealed.set(digest(additionalData), 12 + plain.byteLength);
  return sealed;
}

async function open(sealed: Uint8Array, additionalData: Uint8Array) {
  const body = sealed.subarray(12, sealed.byteLength - 16);
  const tag = sealed.subarray(sealed.byteLength - 16);
  if (digest(additionalData).some((byte, index) => byte !== tag[index])) throw new Error('auth failed');
  return Uint8Array.from(body, (byte) => byte ^ 0x5a);
}

function reader(bytes: Uint8Array): MemoryByteReader {
  let offset = 0;
  return {
    read(length) {
      const slice = bytes.subarray(offset, offset + length);
      offset += length;
      return slice;
    },
  };
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

async function encrypt(plain: Uint8Array) {
  const chunks: Uint8Array[] = [];
  const written = await encryptMemoryChunks({
    target: TARGET,
    plainBytes: plain.byteLength,
    reader: reader(plain),
    writer: { write: (bytes) => { chunks.push(bytes); } },
    seal,
  });
  return { sealed: concat(chunks), written, chunkCount: chunks.length };
}

describe('memory chunk encryption', () => {
  it('round-trips multi-chunk payloads and reports the ciphertext size', async () => {
    const plain = Uint8Array.from({ length: MEMORY_CHUNK_BYTES * 2 + 123 }, (_, index) => index % 251);
    const { sealed, written, chunkCount } = await encrypt(plain);
    expect(chunkCount).toBe(3);
    expect(written).toBe(memoryCipherBytes(plain.byteLength));
    const parts: Uint8Array[] = [];
    await decryptMemoryChunks({
      target: TARGET,
      plainBytes: plain.byteLength,
      reader: reader(sealed),
      open,
      onChunk: (part) => { parts.push(part); },
    });
    expect(concat(parts)).toEqual(plain);
  });

  it('handles an empty payload as one sealed chunk', async () => {
    const { sealed, chunkCount } = await encrypt(new Uint8Array(0));
    expect(chunkCount).toBe(1);
    expect(sealed.byteLength).toBe(28);
  });

  it('rejects a ciphertext opened as another memory', async () => {
    const { sealed } = await encrypt(new Uint8Array([1, 2, 3]));
    await expect(decryptMemoryChunks({
      target: { ...TARGET, memoryId: 'memory-0002' },
      plainBytes: 3,
      reader: reader(sealed),
      open,
      onChunk: () => {},
    })).rejects.toThrow('auth failed');
  });

  it('detects a truncated file', async () => {
    const plain = new Uint8Array(MEMORY_CHUNK_BYTES + 10);
    const { sealed } = await encrypt(plain);
    await expect(decryptMemoryChunks({
      target: TARGET,
      plainBytes: plain.byteLength,
      reader: reader(sealed.subarray(0, sealed.byteLength - 5)),
      open,
      onChunk: () => {},
    })).rejects.toThrow('truncated');
  });

  it('fails when the source is shorter than announced', async () => {
    await expect(encryptMemoryChunks({
      target: TARGET,
      plainBytes: 10,
      reader: reader(new Uint8Array(4)),
      writer: { write: () => {} },
      seal,
    })).rejects.toThrow('ended early');
  });
});
