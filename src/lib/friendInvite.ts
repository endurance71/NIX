const FRIEND_INVITE_PATH = 'friend-invite';

export function buildProfileQrLink(profileId: string) {
  return `nix://${FRIEND_INVITE_PATH}?profileId=${encodeURIComponent(profileId)}`;
}

export function extractFriendInvitePayload(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.includes('://')) {
    return { profileId: trimmed, token: null };
  }

  try {
    const parsed = new URL(trimmed);
    const isInvitePath =
      parsed.hostname === FRIEND_INVITE_PATH || parsed.pathname.replace('/', '') === FRIEND_INVITE_PATH;
    if (!isInvitePath) return null;

    const token = parsed.searchParams.get('token')?.trim() || null;
    const profileId = parsed.searchParams.get('profileId')?.trim() || null;
    return { profileId, token };
  } catch {
    return null;
  }
}

export function extractProfileQrProfileId(value: string) {
  return extractFriendInvitePayload(value)?.profileId ?? null;
}
