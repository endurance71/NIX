const FRIEND_INVITE_PATH = 'friend-invite';
export const FRIEND_INVITE_HTTPS_ORIGIN = 'https://nix.shipapp.pl';
/**
 * Hosts whose /invite/<token> links NiX accepts. The first is the current one (the links NiX
 * shares, the universal-link domain); the old host stays until every link shared from it has
 * expired, so a tester's pasted or scanned link keeps working.
 */
export const FRIEND_INVITE_HOSTS = ['nix.shipapp.pl', 'nix.damianmotylinski.pl'] as const;

export function buildFriendInviteTokenLink(token: string) {
  return `nix://${FRIEND_INVITE_PATH}?token=${encodeURIComponent(token)}`;
}

export function buildFriendInviteShareLink(token: string) {
  return `${FRIEND_INVITE_HTTPS_ORIGIN}/invite/${encodeURIComponent(token)}`;
}

/**
 * True for an invite link in any form the router may pass to `redirectSystemPath` (full
 * `nix://` / `https://` URL or a bare path). `DeepLinkHandler` opens these itself — over the
 * tabs, after sign-in, with the pending token saved — so the router must not open them too:
 * that stacked a second invite screen (or „not found” for `/invite/<token>`) under the first.
 */
export function isFriendInviteLinkPath(path: string) {
  let url: string;
  try {
    url = path.includes('://') ? path : new URL(path, FRIEND_INVITE_HTTPS_ORIGIN).href;
  } catch {
    return false;
  }
  const payload = extractFriendInvitePayload(url);
  return Boolean(payload?.token || payload?.profileId);
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
      (FRIEND_INVITE_HOSTS as readonly string[]).includes(parsed.hostname) &&
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
