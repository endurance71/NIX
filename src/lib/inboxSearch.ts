import type { InboxRowModel } from './inboxPresentation';

export function normalizeInboxSearch(value: string): string {
  return value
    .trim()
    .replace(/^@/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l')
    .toLocaleLowerCase();
}

export function filterInboxRows(
  rows: readonly InboxRowModel[],
  searchQuery: string
): readonly InboxRowModel[] {
  const query = normalizeInboxSearch(searchQuery);
  // Same array when not searching, so memoized consumers don't re-render.
  if (!query) return rows;
  return rows.filter((row) => {
    const username = normalizeInboxSearch(row.username);
    const displayName = normalizeInboxSearch(row.display_name ?? '');
    return username.includes(query) || displayName.includes(query);
  });
}

type SearchableInvite = {
  requester: { username: string; display_name?: string | null };
};

/** The same search also narrows the invites section, so typing never leaves stale rows on top. */
export function filterInviteRequests<T extends SearchableInvite>(
  requests: readonly T[],
  searchQuery: string
): readonly T[] {
  const query = normalizeInboxSearch(searchQuery);
  if (!query) return requests;
  return requests.filter((request) => {
    const username = normalizeInboxSearch(request.requester.username);
    const displayName = normalizeInboxSearch(request.requester.display_name ?? '');
    return username.includes(query) || displayName.includes(query);
  });
}

/** "To:" field of the new-message sheet: friends matched by name or @username. */
export function filterFriendProfiles<T extends { username: string; display_name?: string | null }>(
  friends: readonly T[],
  searchQuery: string
): readonly T[] {
  const query = normalizeInboxSearch(searchQuery);
  if (!query) return friends;
  return friends.filter(
    (friend) =>
      normalizeInboxSearch(friend.username).includes(query) ||
      normalizeInboxSearch(friend.display_name ?? '').includes(query)
  );
}
