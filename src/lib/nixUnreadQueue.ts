import type { InboxNix } from '../services/nixService';

/** A NiX nobody opened is deleted 30 days after sending (Terms, section 5). */
export const UNVIEWED_NIX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Oldest send time still inside the retention period. */
export function unviewedNixCutoff(now = Date.now()): string {
  return new Date(now - UNVIEWED_NIX_RETENTION_MS).toISOString();
}

/**
 * Nieobejrzane, odtwarzalne nixy od jednego nadawcy — oldest → newest (FIFO). Nixy po okresie
 * przechowywania pomija: ich plik mógł już zniknąć, a w czacie i tak ich nie widać.
 */
export function filterUnreadInboxNixesFromSender(
  nixes: readonly InboxNix[],
  senderId: string,
  now = Date.now()
): InboxNix[] {
  const cutoff = now - UNVIEWED_NIX_RETENTION_MS;
  return nixes
    .filter(
      (s) =>
        s.sender_id === senderId &&
        new Date(s.created_at).getTime() > cutoff &&
        s.is_viewed !== true &&
        s.status !== 'cleaned' &&
        s.status !== 'cleanup_failed' &&
        typeof s.media_path === 'string' &&
        s.media_path.length > 0
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
