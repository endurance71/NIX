const PASTE_DIR_NAME = 'nix-paste';

export function pasteCacheDirectory(cacheDirectory: string | null | undefined): string | null {
  if (!cacheDirectory || typeof cacheDirectory !== 'string') return null;
  const root = cacheDirectory.endsWith('/') ? cacheDirectory : `${cacheDirectory}/`;
  if (!root.startsWith('file://')) return null;
  return `${root}${PASTE_DIR_NAME}/`;
}

function decodeUriSafely(uri: string): string | null {
  try {
    return decodeURIComponent(uri);
  } catch {
    return null;
  }
}

/**
 * Only files created by chat paste import under the app cache `nix-paste/`
 * directory may be deleted. Camera, gallery, and arbitrary paths are rejected.
 */
export function isOwnedPasteTempUri(
  uri: string,
  cacheDirectory: string | null | undefined
): boolean {
  if (typeof uri !== 'string' || uri.length === 0) return false;
  if (!uri.startsWith('file://')) return false;
  if (uri.includes('\0')) return false;

  const decoded = decodeUriSafely(uri);
  if (!decoded) return false;
  if (decoded.includes('..') || uri.includes('..')) return false;

  const prefix = pasteCacheDirectory(cacheDirectory);
  if (!prefix) return false;
  if (!decoded.startsWith(prefix) && !uri.startsWith(prefix)) return false;

  const rest = decoded.startsWith(prefix) ? decoded.slice(prefix.length) : uri.slice(prefix.length);
  if (!rest || rest.includes('/') || rest.includes('\\')) return false;
  return true;
}

export function ownedUrisToCleanup(
  previousOwned: readonly string[] | undefined,
  nextOwned: readonly string[] | undefined
): string[] {
  const keep = new Set(nextOwned ?? []);
  return (previousOwned ?? []).filter((uri) => !keep.has(uri));
}

export async function cleanupOwnedTemporaryUris(
  uris: readonly string[],
  options?: {
    cacheDirectory?: string | null;
    deleteAsync?: (uri: string) => Promise<void>;
  }
): Promise<void> {
  const cacheDirectory = options?.cacheDirectory ?? null;
  const deleteAsync = options?.deleteAsync;
  const seen = new Set<string>();

  for (const uri of uris) {
    if (seen.has(uri)) continue;
    seen.add(uri);
    if (!isOwnedPasteTempUri(uri, cacheDirectory)) continue;
    if (!deleteAsync) continue;
    try {
      await deleteAsync(uri);
    } catch {
      // Best-effort and idempotent: missing files are success.
    }
  }
}
