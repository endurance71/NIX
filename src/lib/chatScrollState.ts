/**
 * Pure scroll bookkeeping for the chat list: when the „scroll to the newest” button shows, and how
 * many incoming messages arrived while the reader was looking at older history.
 */

/** The button appears once the reader is this far (pt) above the newest message… */
export const SCROLL_TO_BOTTOM_SHOW_DISTANCE = 160;
/** …and hides again only when they are back this close (hysteresis: no flicker at the edge). */
export const SCROLL_TO_BOTTOM_HIDE_DISTANCE = 80;

/** Distance (pt) between the current offset and the end of the list (its bottom-most offset). */
export function distanceFromListEnd(
  offset: number,
  contentHeight: number,
  viewportHeight: number,
  bottomInset: number
): number {
  'worklet';
  if (contentHeight <= 0 || viewportHeight <= 0) return 0;
  const endOffset = Math.max(0, contentHeight - viewportHeight + bottomInset);
  return Math.max(0, endOffset - offset);
}

export function nextScrolledUpState(previous: boolean, distance: number): boolean {
  'worklet';
  if (previous) return distance > SCROLL_TO_BOTTOM_HIDE_DISTANCE;
  return distance > SCROLL_TO_BOTTOM_SHOW_DISTANCE;
}

type TimelineItemLike =
  | { type: 'separator'; id: string }
  | { type: 'text'; id: string; message: { sender_id: string; is_system?: boolean | null } }
  | { type: 'nix'; id: string; nix: { direction: 'sent' | 'received' | string } }
  | { type: 'media'; id: string };

/** A message the peer sent: their text or a received NiX (system lines and own items excluded). */
export function isIncomingTimelineItem(item: TimelineItemLike, currentUserId: string): boolean {
  if (item.type === 'text') {
    return !item.message.is_system && item.message.sender_id !== currentUserId;
  }
  if (item.type === 'nix') return item.nix.direction === 'received';
  return false;
}

/**
 * Incoming items appended after the newest item the reader already had. Older history prepended
 * by pagination and state changes of existing items (stable ids) are not „new”.
 */
export function countAppendedIncomingItems(
  previousIds: ReadonlySet<string>,
  timeline: readonly TimelineItemLike[],
  currentUserId: string
): number {
  if (previousIds.size === 0) return 0;
  let lastKnownIndex = -1;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (previousIds.has(timeline[index].id)) {
      lastKnownIndex = index;
      break;
    }
  }
  if (lastKnownIndex === -1) return 0;
  let count = 0;
  for (let index = lastKnownIndex + 1; index < timeline.length; index += 1) {
    const item = timeline[index];
    if (!previousIds.has(item.id) && isIncomingTimelineItem(item, currentUserId)) count += 1;
  }
  return count;
}
