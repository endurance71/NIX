import type { ChatNixEvent } from '../services/nixService';
import type { ChatTimelineItem } from './chatTimeline';
import { messageKindForMedia } from './messageStatus';

/**
 * Quoted „reply to a NiX” header of a text bubble (migration 20261013100000). A text can only
 * answer a NiX its sender received from the other person, so the perspective follows the sender:
 * my reply answers the peer's NiX, the peer's reply answers mine.
 */
export type ChatNixReplyContext = {
  nixId: string;
  kind: 'photo' | 'video';
  /** `peer`: I replied to the peer's NiX; `mine`: the peer replied to my NiX. */
  nixOwner: 'peer' | 'mine';
  /** The NiX is in the loaded chat timeline, so the header can scroll to it. */
  inTimeline: boolean;
};

export function chatNixReplyContext(
  message: {
    sender_id: string;
    reply_to_nix_id?: string | null;
    reply_to_nix_media_type?: string | null;
  },
  currentUserId: string,
  nixesById: ReadonlyMap<string, Pick<ChatNixEvent, 'media_type'>>,
): ChatNixReplyContext | null {
  const nixId = message.reply_to_nix_id;
  if (!nixId) return null;
  const nix = nixesById.get(nixId);
  const kind = messageKindForMedia(nix?.media_type ?? message.reply_to_nix_media_type);
  return {
    nixId,
    kind: kind === 'video' ? 'video' : 'photo',
    nixOwner: message.sender_id === currentUserId ? 'peer' : 'mine',
    inTimeline: nix !== undefined,
  };
}

/** Index of the NiX's cell in the timeline (a received chip or a delivered upload), or -1. */
export function chatTimelineNixIndex(
  timeline: readonly ChatTimelineItem[],
  nixId: string,
): number {
  return timeline.findIndex(
    (item) =>
      (item.type === 'nix' && item.nix.id === nixId)
      || (item.type === 'media' && item.nix?.id === nixId),
  );
}
