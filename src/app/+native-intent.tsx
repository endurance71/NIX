import { isAuthEmailLinkPath } from '../lib/authDeepLink';

// Auth email links are verified by DeepLinkHandler; keep the router on the
// root instead of resolving them to a missing screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return isAuthEmailLinkPath(path) ? '/' : path;
}
