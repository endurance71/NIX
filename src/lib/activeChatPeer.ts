/**
 * Module-level ref tracking the peer ID of the chat screen the user is looking at.
 *
 * Used by the foreground notification handler to suppress banners
 * when the user is already viewing the conversation with the sender.
 *
 * Follows screen focus (NOTIF-11), not mount/unmount: a chat covered by the viewer or by another
 * chat must not keep muting its peer. Use `claimActiveChatPeer` from `useFocusEffect`.
 */
export const activeChatPeerRef: { current: string | null } = { current: null };

/**
 * Marks `peerId` as the visible chat and returns the release for blur. The release clears only its
 * own claim, so chat A blurring after chat B gained focus does not unmute B (A → B → back).
 */
export function claimActiveChatPeer(peerId: string): () => void {
  activeChatPeerRef.current = peerId;
  return () => {
    if (activeChatPeerRef.current === peerId) activeChatPeerRef.current = null;
  };
}
