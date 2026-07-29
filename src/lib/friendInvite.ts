const FRIEND_INVITE_PATH = 'friend-invite';
export const FRIEND_INVITE_HTTPS_ORIGIN = 'https://nix.damianmotylinski.pl';

export function buildFriendInviteTokenLink(token: string) {
  return `nix://${FRIEND_INVITE_PATH}?token=${encodeURIComponent(token)}`;
}

export function buildFriendInviteShareLink(token: string) {
  return `${FRIEND_INVITE_HTTPS_ORIGIN}/invite/${encodeURIComponent(token)}`;
}

export function extractFriendInvitePayload(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.includes('://')) {
    return { profileId: trimmed, token: null };
  }

  try {
    const parsed = new URL(trimmed);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const isCustomInvite =
      parsed.hostname === FRIEND_INVITE_PATH ||
      parsed.pathname.replace('/', '') === FRIEND_INVITE_PATH;
    const isHttpsInvite =
      parsed.protocol === 'https:' &&
      parsed.hostname === 'nix.damianmotylinski.pl' &&
      pathParts[0] === 'invite';
    const isInvitePath = isCustomInvite || isHttpsInvite;
    if (!isInvitePath) return null;

    const token =
      parsed.searchParams.get('token')?.trim() ||
      (isHttpsInvite ? pathParts[1]?.trim() : null) ||
      null;
    const profileId = parsed.searchParams.get('profileId')?.trim() || null;
    return { profileId, token };
  } catch {
    return null;
  }
}
