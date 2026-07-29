import { describe, expect, it } from 'vitest';
import { filterInboxRows, normalizeInboxSearch } from './inboxSearch';
import type { InboxRowModel } from './inboxPresentation';

function row(username: string, displayName: string | null): InboxRowModel {
  return {
    id: username,
    peerId: username,
    kind: 'text',
    username,
    display_name: displayName,
    direction: 'received',
    unread: false,
    status: 'opened',
    createdAt: '2026-07-29T00:00:00Z',
    timestampLabel: '',
    avatarStoragePath: null,
    avatarEmoji: null,
    mediaType: null,
    upload: null,
    openParams: null,
  };
}

describe('inbox search', () => {
  it('normalizes @, case and Polish diacritics', () => {
    expect(normalizeInboxSearch('  @ŻÓŁW_7 ')).toBe('zolw_7');
  });

  it('filters by username and display name', () => {
    const rows = [row('janek', 'Jan Żółty'), row('anna', 'Anna Nowak')];
    expect(filterInboxRows(rows, '@JANEK')).toHaveLength(1);
    expect(filterInboxRows(rows, 'zolty')).toHaveLength(1);
    expect(filterInboxRows(rows, 'missing')).toEqual([]);
  });
});
