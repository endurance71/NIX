import * as SecureStore from 'expo-secure-store';

const PENDING_INVITE_TOKEN_KEY = 'nix.friend-invite.pending.v1';

/**
 * An opened invite link is only saved here; the root layout opens the invite screen from the
 * saved token once the app can show it (signed in, online, past onboarding). One path, so the
 * screen is never pushed twice (once by the link handler, once by the pending redirect).
 */
const listeners = new Set<() => void>();

export async function savePendingFriendInviteToken(token: string) {
  if (!token.trim()) return;
  await SecureStore.setItemAsync(PENDING_INVITE_TOKEN_KEY, token.trim());
  for (const listener of listeners) listener();
}

/** Called after an invite link was saved: a new chance to open it, even for the same token. */
export function subscribePendingFriendInvite(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingFriendInviteToken() {
  return SecureStore.getItemAsync(PENDING_INVITE_TOKEN_KEY);
}

export function clearPendingFriendInviteToken() {
  return SecureStore.deleteItemAsync(PENDING_INVITE_TOKEN_KEY);
}
