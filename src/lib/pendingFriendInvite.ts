import * as SecureStore from 'expo-secure-store';

const PENDING_INVITE_TOKEN_KEY = 'nix.friend-invite.pending.v1';

export async function savePendingFriendInviteToken(token: string) {
  if (!token.trim()) return;
  await SecureStore.setItemAsync(PENDING_INVITE_TOKEN_KEY, token.trim());
}

export function getPendingFriendInviteToken() {
  return SecureStore.getItemAsync(PENDING_INVITE_TOKEN_KEY);
}

export function clearPendingFriendInviteToken() {
  return SecureStore.deleteItemAsync(PENDING_INVITE_TOKEN_KEY);
}
