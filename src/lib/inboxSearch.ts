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
): InboxRowModel[] {
  const query = normalizeInboxSearch(searchQuery);
  if (!query) return [...rows];
  return rows.filter((row) => {
    const username = normalizeInboxSearch(row.username);
    const displayName = normalizeInboxSearch(row.display_name ?? '');
    return username.includes(query) || displayName.includes(query);
  });
}
