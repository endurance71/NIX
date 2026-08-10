import type { InboxNix } from '../services/nixService';

/** Nieobejrzane, odtwarzalne nixy od jednego nadawcy — oldest → newest (FIFO). */
export function filterUnreadInboxNixesFromSender(
  nixes: readonly InboxNix[],
  senderId: string
): InboxNix[] {
  return nixes
    .filter(
      (s) =>
        s.sender_id === senderId &&
        s.is_viewed !== true &&
        s.status !== 'cleaned' &&
        s.status !== 'cleanup_failed' &&
        typeof s.media_path === 'string' &&
        s.media_path.length > 0
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
