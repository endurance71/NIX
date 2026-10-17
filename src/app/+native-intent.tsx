import { isAuthEmailLinkPath } from '../lib/authDeepLink';
import { isFriendInviteLinkPath } from '../lib/friendInvite';

// Auth email links and invite links are handled by DeepLinkHandler; keep the router on the
// root instead of resolving them itself (a missing screen, or a second invite screen).
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return isAuthEmailLinkPath(path) || isFriendInviteLinkPath(path) ? '/' : path;
}
