import { describe, expect, it } from 'vitest';
import {
  MEMORY_CHUNK_BYTES,
  MEMORY_CHUNK_OVERHEAD_BYTES,
  formatMemoriesMegabytes,
  formatMemoriesMonth,
  formatMemoryDuration,
  groupMemoriesByMonth,
  memoryCaptureDecision,
  memoryChunkAdditionalData,
  memoryChunkCount,
  memoryCipherBytes,
  memoryContentType,
  memoryFileExtension,
  memoryRecipientNames,
  parseMemoriesIndex,
  parseMemoriesPreference,
  planMemoriesPrune,
  type MemoryEntry,
} from './memories';

const OWNER = '11111111-2222-3333-4444-555555555555';

function entry(id: string, createdAt: number, storedBytes = 10, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    version: 1,
    id,
    ownerId: OWNER,
    mediaType: 'image',
    createdAt,
    recipientNames: ['Ania'],
    extension: 'jpg',
    durationMs: null,
    width: 1080,
    height: 1920,
    plainBytes: 100,
    chunkCount: 1,
    storedBytes,
    thumbnailBytes: 20,
    ...overrides,
  };
}

describe('memories chunk math', () => {
  it('uses a base64-friendly chunk size', () => {
    expect(MEMORY_CHUNK_BYTES % 3).toBe(0);
  });

  it('counts at least one chunk and adds the GCM overhead per chunk', () => {
    expect(memoryChunkCount(0)).toBe(1);
    expect(memoryChunkCount(MEMORY_CHUNK_BYTES)).toBe(1);
    expect(memoryChunkCount(MEMORY_CHUNK_BYTES + 1)).toBe(2);
    expect(memoryCipherBytes(MEMORY_CHUNK_BYTES + 1)).toBe(MEMORY_CHUNK_BYTES + 1 + 2 * MEMORY_CHUNK_OVERHEAD_BYTES);
  });

  it('binds chunk additional data to owner, memory, kind, position and the last flag', () => {
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    const base = decode(memoryChunkAdditionalData(OWNER, 'm1', 'media', 0, false));
    expect(decode(memoryChunkAdditionalData(OWNER, 'm1', 'media', 0, true))).not.toBe(base);
    expect(decode(memoryChunkAdditionalData(OWNER, 'm1', 'media', 1, false))).not.toBe(base);
    expect(decode(memoryChunkAdditionalData(OWNER, 'm2', 'media', 0, false))).not.toBe(base);
    expect(decode(memoryChunkAdditionalData(OWNER, 'm1', 'thumb', 0, false))).not.toBe(base);
  });
});

describe('parseMemoriesIndex', () => {
  it('keeps valid rows of the same owner and drops invalid or duplicate ones', () => {
    const valid = entry('aaaaaaaa-1', 1);
    const json = JSON.stringify({
      version: 1,
      ownerId: OWNER,
      entries: [
        valid,
        valid,
        { ...entry('bbbbbbbb-2', 2), ownerId: 'someone-else-0000' },
        { ...entry('cccccccc-3', 3), extension: '../x' },
        { ...entry('dddddddd-4', 4), chunkCount: 7 },
        { ...entry('eeeeeeee-5', 5), width: -1 },
      ],
    });
    const index = parseMemoriesIndex(json, OWNER);
    expect(index.entries.map((item) => item.id)).toEqual(['aaaaaaaa-1', 'eeeeeeee-5']);
    expect(index.entries[1].width).toBeNull();
  });

  it('returns an empty index for garbage or another owner', () => {
    expect(parseMemoriesIndex('not json', OWNER).entries).toEqual([]);
    expect(parseMemoriesIndex(JSON.stringify({ version: 1, ownerId: 'x', entries: [] }), OWNER).entries).toEqual([]);
  });
});

describe('planMemoriesPrune', () => {
  it('removes the oldest memories until the incoming one fits', () => {
    const entries = [entry('new-00001', 30, 40), entry('old-00001', 10, 40), entry('mid-00001', 20, 40)];
    expect(planMemoriesPrune(entries, 30, 100)).toEqual(['old-00001', 'mid-00001']);
    expect(planMemoriesPrune(entries, 0, 120)).toEqual([]);
  });
});

describe('groupMemoriesByMonth', () => {
  it('groups newest month first and newest memory first', () => {
    const october = new Date(2026, 9, 5).getTime();
    const octoberLater = new Date(2026, 9, 20).getTime();
    const september = new Date(2026, 8, 30).getTime();
    const sections = groupMemoriesByMonth([entry('sep-00001', september), entry('oct-00001', october), entry('oct-00002', octoberLater)]);
    expect(sections.map((section) => section.key)).toEqual(['2026-10', '2026-09']);
    expect(sections[0].entries.map((item) => item.id)).toEqual(['oct-00002', 'oct-00001']);
  });

  it('formats a capitalised month header', () => {
    expect(formatMemoriesMonth(2026, 9, 'en')).toBe('October 2026');
    expect(formatMemoriesMonth(2026, 9, 'pl').startsWith('P')).toBe(true);
  });
});

describe('memoryCaptureDecision', () => {
  it('saves only after an explicit opt-in', () => {
    expect(memoryCaptureDecision('on', true, true)).toBe('save');
    expect(memoryCaptureDecision('off', false, false)).toBe('skip');
  });

  it('asks while undecided unless another prompt may be on screen', () => {
    expect(memoryCaptureDecision('unset', false, false)).toBe('ask');
    expect(memoryCaptureDecision('unset', true, false)).toBe('skip');
    expect(memoryCaptureDecision('unset', false, true)).toBe('skip');
  });

  it('parses the stored preference defensively', () => {
    expect(parseMemoriesPreference('on')).toBe('on');
    expect(parseMemoriesPreference('off')).toBe('off');
    expect(parseMemoriesPreference('yes')).toBe('unset');
    expect(parseMemoriesPreference(null)).toBe('unset');
  });
});

describe('memory helpers', () => {
  it('resolves recipient names in send order with fallbacks', () => {
    expect(memoryRecipientNames(['b', 'x', 'a'], [
      { id: 'a', username: 'ania', display_name: ' Ania ' },
      { id: 'b', username: 'bartek', display_name: null },
    ])).toEqual(['@bartek', 'Ania']);
  });

  it('derives the file extension and content type', () => {
    expect(memoryFileExtension('file:///tmp/a.MOV', 'video')).toBe('mov');
    expect(memoryFileExtension('file:///tmp/noext', 'video')).toBe('mp4');
    expect(memoryFileExtension('file:///tmp/noext', 'image')).toBe('jpg');
    expect(memoryContentType({ mediaType: 'video', extension: 'mov' })).toBe('video/quicktime');
    expect(memoryContentType({ mediaType: 'image', extension: 'heic' })).toBe('image/heic');
  });

  it('formats sizes and durations', () => {
    expect(formatMemoriesMegabytes(500 * 1024 * 1024)).toBe('500');
    expect(formatMemoriesMegabytes(1.5 * 1024 * 1024)).toBe('1.5');
    expect(formatMemoriesMegabytes(10)).toBe('0.1');
    expect(formatMemoryDuration(7_400)).toBe('0:07');
    expect(formatMemoryDuration(65_000)).toBe('1:05');
    expect(formatMemoryDuration(null)).toBeNull();
  });
});
