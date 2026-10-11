export const AUTH_CONFIRM_WEB_ORIGIN = 'https://nix.damianmotylinski.pl';

export type AuthConfirmLink = {
  tokenHash: string;
  type: 'signup' | 'recovery';
};

const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

function isAuthConfirmLocation(url: URL) {
  if (url.protocol === 'nix:') {
    return url.hostname === 'auth' && url.pathname.replace(/\/+$/, '') === '/confirm';
  }
  return (
    url.origin === AUTH_CONFIRM_WEB_ORIGIN &&
    url.pathname.replace(/\/+$/, '') === '/auth/confirm'
  );
}

/**
 * Accepts only the email confirmation/recovery link shape. Session tokens in a
 * URL are never accepted, so a crafted link cannot install a session directly.
 */
export function parseAuthConfirmLink(rawUrl: string): AuthConfirmLink | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!isAuthConfirmLocation(url)) return null;
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (!tokenHash || !TOKEN_HASH_PATTERN.test(tokenHash)) return null;
  if (type !== 'signup' && type !== 'recovery') return null;
  return { tokenHash, type };
}

/** True for auth email links, which DeepLinkHandler handles outside the router. */
export function isAuthEmailLinkPath(path: string): boolean {
  try {
    const url = new URL(path, 'nix://');
    if (url.protocol === 'nix:' && url.hostname === 'auth') return true;
    return url.pathname.replace(/\/+$/, '').startsWith('/auth/');
  } catch {
    return false;
  }
}
