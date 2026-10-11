/**
 * What an emoji tap in the viewer's quick-reply row does.
 * - `reaction`: sets/toggles a NiX reaction (backend has `nix_reactions`).
 * - `text`: sends the emoji as a quick text reply (backend without the migration, or before the
 *   reaction query answered) — the behaviour the viewer had before reactions existed.
 * - `none`: no reply UI at all (own NiX, signed out, no sender).
 */
export type ViewerEmojiMode = 'reaction' | 'text' | 'none';

export function viewerEmojiMode(params: {
  canReply: boolean;
  reactionsAvailable: boolean;
  nixId: string | null | undefined;
}): ViewerEmojiMode {
  if (!params.canReply) return 'none';
  return params.reactionsAvailable && params.nixId ? 'reaction' : 'text';
}

/**
 * "Reply with a NiX": back to the camera tab with the sender preselected. `dismissTo` pops the
 * viewer (and any chat under it) back to the existing `(tabs)` route; `navigate` from the root
 * stack would push a second `(tabs)` on top of the modal.
 */
export function replyWithNixHref(senderId: string) {
  return { pathname: '/(tabs)', params: { recipientId: senderId } } as const;
}

/** How long the reaction confirmation stays on screen before fading out. */
export const VIEWER_REACTION_POP_MS = 900;
