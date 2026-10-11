import { useCallback, useMemo } from 'react';
import { queryOptions, useQueries, type QueryObserverResult } from '@tanstack/react-query';
import {
  AVATAR_SIGNED_URL_STALE_TIME_MS,
  AVATAR_SIGNED_URL_TTL_MS,
  createSignedAvatarUrls,
  isDirectAvatarUrl,
} from '../services/avatarService';
import { queryKeys } from '../lib/queryKeys';

/** A path that could not be signed (deleted object, transient storage error) is retried after this. */
export const UNSIGNED_AVATAR_RETRY_MS = 5 * 60_000;

export type AvatarUrlMap = Readonly<Record<string, string>>;
type SignAvatarPaths = (paths: string[]) => Promise<Record<string, string>>;
type SignAvatarPath = (path: string) => Promise<string | null>;

/**
 * Collects the per-path requests made in the same tick (every `useQueries` observer that mounts
 * or goes stale together) into one `createSignedAvatarUrls` call. Each caller gets only its own
 * URL, or `null` when the batch could not sign it.
 */
export function createAvatarUrlBatcher(
  sign: SignAvatarPaths,
  schedule: (flush: () => void) => void = (flush) => setTimeout(flush, 0),
): SignAvatarPath {
  type Waiter = { resolve: (url: string | null) => void; reject: (error: unknown) => void };
  let pending = new Map<string, Waiter[]>();

  const flush = async () => {
    const batch = pending;
    pending = new Map();
    try {
      const urls = await sign([...batch.keys()]);
      for (const [path, waiters] of batch) {
        for (const waiter of waiters) waiter.resolve(urls[path] ?? null);
      }
    } catch (error) {
      for (const waiters of batch.values()) {
        for (const waiter of waiters) waiter.reject(error);
      }
    }
  };

  return (path) =>
    new Promise<string | null>((resolve, reject) => {
      const waiters = pending.get(path);
      if (waiters) {
        waiters.push({ resolve, reject });
        return;
      }
      if (pending.size === 0) schedule(() => void flush());
      pending.set(path, [{ resolve, reject }]);
    });
}

const signAvatarUrl = createAvatarUrlBatcher(createSignedAvatarUrls);

/**
 * One cache entry per storage path (`['avatarUrl', path]`), shared by every screen:
 * - fresh for `AVATAR_SIGNED_URL_STALE_TIME_MS` (the URL is re-signed before its TTL ends);
 * - kept in memory for the URL's TTL after the last screen using it unmounts;
 * - a path that could not be signed is retried after `UNSIGNED_AVATAR_RETRY_MS`;
 * - never written to the offline disk cache (`offlineCachePolicy` does not describe the key).
 */
export function avatarUrlQueryOptions(
  path: string,
  { enabled, sign = signAvatarUrl }: { enabled: boolean; sign?: SignAvatarPath },
) {
  return queryOptions({
    queryKey: queryKeys.avatarUrl(path),
    queryFn: () => sign(path),
    enabled,
    staleTime: (query) =>
      query.state.data ? AVATAR_SIGNED_URL_STALE_TIME_MS : UNSIGNED_AVATAR_RETRY_MS,
    gcTime: AVATAR_SIGNED_URL_TTL_MS,
  });
}

/** Unique, sorted, non-blank paths: the order and duplicates of the input never matter. */
export function normalizeAvatarPaths(paths: readonly (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(paths.filter((path): path is string => typeof path === 'string' && path.trim() !== '')),
  ).sort();
}

/**
 * Builds the `{ rawPath: url }` map. Whatever is cached is returned, even an expired URL while
 * offline: `AvatarCircle` keys expo-image by storage path, so the disk cache still serves it.
 */
export function combineAvatarUrls(
  signedPaths: readonly string[],
  results: readonly Pick<QueryObserverResult<string | null>, 'data'>[],
  directPaths: readonly string[],
): AvatarUrlMap {
  const urls: Record<string, string> = {};
  for (const path of directPaths) urls[path] = path.trim();
  signedPaths.forEach((path, index) => {
    const url = results[index]?.data;
    if (url) urls[path] = url;
  });
  return urls;
}

/**
 * Signed avatar URLs for `paths`, keyed by the raw storage path (PERF-17, SEND-6).
 *
 * Only paths that are missing or about to expire are signed, all together in one batch call; a new
 * conversation or a search therefore never re-signs (or blanks) the avatars already on screen.
 * The returned map keeps its identity until a URL in it actually changes (TanStack structurally
 * shares the `combine` result), so it is safe as a memo dependency or `extraData`.
 * With `enabled: false` (offline) it only reads the cache.
 */
export function useSignedAvatarUrls(
  paths: readonly (string | null | undefined)[],
  { enabled }: { enabled: boolean },
): AvatarUrlMap {
  const pathsKey = JSON.stringify(normalizeAvatarPaths(paths));
  const { signedPaths, directPaths } = useMemo(() => {
    const unique = JSON.parse(pathsKey) as string[];
    return {
      signedPaths: unique.filter((path) => !isDirectAvatarUrl(path)),
      directPaths: unique.filter(isDirectAvatarUrl),
    };
  }, [pathsKey]);
  const combine = useCallback(
    (results: QueryObserverResult<string | null>[]) =>
      combineAvatarUrls(signedPaths, results, directPaths),
    [directPaths, signedPaths],
  );

  return useQueries({
    queries: signedPaths.map((path) => avatarUrlQueryOptions(path, { enabled })),
    combine,
  });
}
