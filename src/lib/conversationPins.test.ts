import { describe, expect, it } from 'vitest';
import {
  MAX_CONVERSATION_PINS,
  applyConversationPin,
  canAddConversationPin,
  isMissingTableError,
  localPinsMissingOnServer,
  normalizeConversationPins,
  orderRowsWithPins,
  parseStoredConversationPins,
  splitPinnedRows,
} from './conversationPins';

const pin = (peerId: string, pinnedAt: string) => ({ peerId, pinnedAt });

describe('normalizeConversationPins', () => {
  it('dedupes by peer and sorts by pin time', () => {
    expect(
      normalizeConversationPins([
        pin('b', '2026-10-02T00:00:00Z'),
        pin('a', '2026-10-01T00:00:00Z'),
        pin('b', '2026-10-03T00:00:00Z'),
      ]),
    ).toEqual([pin('a', '2026-10-01T00:00:00Z'), pin('b', '2026-10-03T00:00:00Z')]);
  });
});

describe('parseStoredConversationPins', () => {
  it('reads a valid mirror and ignores garbage', () => {
    expect(parseStoredConversationPins(JSON.stringify([pin('a', '2026-10-01T00:00:00Z'), { x: 1 }]))).toEqual([
      pin('a', '2026-10-01T00:00:00Z'),
    ]);
    expect(parseStoredConversationPins('{not json')).toEqual([]);
    expect(parseStoredConversationPins(null)).toEqual([]);
    expect(parseStoredConversationPins('{"a":1}')).toEqual([]);
  });
});

describe('applyConversationPin', () => {
  it('appends a new pin at the end and keeps the original time of an existing one', () => {
    const pins = [pin('a', '2026-10-01T00:00:00Z')];
    expect(applyConversationPin(pins, 'b', true, '2026-10-05T00:00:00Z')).toEqual([
      pin('a', '2026-10-01T00:00:00Z'),
      pin('b', '2026-10-05T00:00:00Z'),
    ]);
    expect(applyConversationPin(pins, 'a', true, '2026-10-05T00:00:00Z')).toEqual(pins);
  });

  it('unpins', () => {
    expect(applyConversationPin([pin('a', '2026-10-01T00:00:00Z')], 'a', false, 'x')).toEqual([]);
  });
});

describe('canAddConversationPin', () => {
  it('caps the number of pins but always allows re-pinning', () => {
    const full = Array.from({ length: MAX_CONVERSATION_PINS }, (_, index) =>
      pin(`p${index}`, `2026-10-0${(index % 9) + 1}T00:00:00Z`),
    );
    expect(canAddConversationPin(full, 'new')).toBe(false);
    expect(canAddConversationPin(full, 'p0')).toBe(true);
    expect(canAddConversationPin([], 'new')).toBe(true);
  });
});

describe('orderRowsWithPins', () => {
  const rows = [{ peerId: 'a' }, { peerId: 'b' }, { peerId: 'c' }, { peerId: 'd' }];

  it('moves pinned rows to the top in pin order and keeps the rest in recency order', () => {
    const ordered = orderRowsWithPins(rows, [pin('d', '2026-10-01T00:00:00Z'), pin('b', '2026-10-02T00:00:00Z')]);
    expect(ordered.map((row) => row.peerId)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('returns the same array when no visible row is pinned', () => {
    expect(orderRowsWithPins(rows, [])).toBe(rows);
    expect(orderRowsWithPins(rows, [pin('zzz', '2026-10-01T00:00:00Z')])).toBe(rows);
  });
});

describe('splitPinnedRows', () => {
  const rows = [{ peerId: 'a' }, { peerId: 'b' }, { peerId: 'c' }, { peerId: 'd' }];

  it('takes the pinned rows out in pin order and keeps the rest in recency order', () => {
    const { pinned, rest } = splitPinnedRows(rows, [
      pin('d', '2026-10-01T00:00:00Z'),
      pin('gone', '2026-10-01T12:00:00Z'),
      pin('b', '2026-10-02T00:00:00Z'),
    ]);
    expect(pinned.map((row) => row.peerId)).toEqual(['d', 'b']);
    expect(rest.map((row) => row.peerId)).toEqual(['a', 'c']);
  });

  it('keeps the same rows array when no visible row is pinned', () => {
    expect(splitPinnedRows(rows, []).rest).toBe(rows);
    expect(splitPinnedRows(rows, [pin('zzz', '2026-10-01T00:00:00Z')])).toEqual({ pinned: [], rest: rows });
    expect(splitPinnedRows(rows, [pin('zzz', '2026-10-01T00:00:00Z')]).rest).toBe(rows);
  });

  it('can pin every conversation', () => {
    const { pinned, rest } = splitPinnedRows(rows.slice(0, 2), [
      pin('b', '2026-10-01T00:00:00Z'),
      pin('a', '2026-10-02T00:00:00Z'),
    ]);
    expect(pinned.map((row) => row.peerId)).toEqual(['b', 'a']);
    expect(rest).toEqual([]);
  });
});

describe('localPinsMissingOnServer', () => {
  it('returns device-only pins for the one-time upload', () => {
    expect(
      localPinsMissingOnServer(
        [pin('a', '2026-10-01T00:00:00Z')],
        [pin('a', '2026-10-01T00:00:00Z'), pin('b', '2026-10-02T00:00:00Z')],
      ),
    ).toEqual([pin('b', '2026-10-02T00:00:00Z')]);
  });
});

describe('isMissingTableError', () => {
  it('detects a table that is not deployed', () => {
    expect(isMissingTableError({ code: 'PGRST205', message: '' }, 'conversation_pins')).toBe(true);
    expect(isMissingTableError({ code: '42P01', message: '' }, 'conversation_pins')).toBe(true);
    expect(
      isMissingTableError(
        { message: "Could not find the table 'public.conversation_pins' in the schema cache" },
        'conversation_pins',
      ),
    ).toBe(true);
  });

  it('does not treat other failures as a missing table', () => {
    expect(isMissingTableError({ code: '42501', message: 'permission denied' }, 'conversation_pins')).toBe(false);
    expect(isMissingTableError(new TypeError('Network request failed'), 'conversation_pins')).toBe(false);
    expect(isMissingTableError(null, 'conversation_pins')).toBe(false);
  });
});
