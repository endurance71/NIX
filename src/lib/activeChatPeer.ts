/**
 * Module-level ref tracking the peer ID of the currently active chat screen.
 *
 * Used by the foreground notification handler to suppress banners
 * when the user is already viewing the conversation with the sender.
 *
 * Set by useChatScreen on mount, cleared on unmount.
 */
export const activeChatPeerRef: { current: string | null } = { current: null };
