import { describe, expect, it } from 'vitest';
import {
  filterFriendProfiles,
  filterInboxRows,
  filterInviteRequests,
  normalizeInboxSearch,
} from './inboxSearch';
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
    messageStatus: 'received',
    messageKind: 'text',
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

describe('filterInviteRequests', () => {
  const invites = [
    { id: '1', requester: { username: 'ala', display_name: 'Ala Kowalska' } },
    { id: '2', requester: { username: 'zenek', display_name: null } },
  ];

  it('narrows invites with the inbox search rules', () => {
    expect(filterInviteRequests(invites, '@kowal').map((invite) => invite.id)).toEqual(['1']);
    expect(filterInviteRequests(invites, 'ZEN').map((invite) => invite.id)).toEqual(['2']);
  });

  it('returns the same array without a query', () => {
    expect(filterInviteRequests(invites, '  ')).toBe(invites);
  });
});

describe('filterFriendProfiles', () => {
  const friends = [
    { id: 'a', username: 'lukasz', display_name: 'Łukasz Nowak' },
    { id: 'b', username: 'ola', display_name: null },
  ];

  it('matches display name without diacritics and the @username', () => {
    expect(filterFriendProfiles(friends, 'luk').map((friend) => friend.id)).toEqual(['a']);
    expect(filterFriendProfiles(friends, '@ola').map((friend) => friend.id)).toEqual(['b']);
    expect(filterFriendProfiles(friends, '')).toBe(friends);
  });
});
