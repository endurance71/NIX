import { describe, expect, it, vi } from 'vitest';
import { QueriesObserver, QueryClient, type QueryObserverResult } from '@tanstack/react-query';

import { describeOfflineCacheQuery, sanitizeOfflineQueryData } from '../lib/offlineCachePolicy';
import { queryKeys } from '../lib/queryKeys';
import { AVATAR_SIGNED_URL_STALE_TIME_MS } from '../services/avatarService';
import {
  UNSIGNED_AVATAR_RETRY_MS,
  avatarUrlQueryOptions,
  combineAvatarUrls,
  createAvatarUrlBatcher,
  normalizeAvatarPaths,
} from './useSignedAvatarUrls';

// Hoisted by Vitest: keeps the native Supabase / Expo modules out of the Node test run.
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/mediaService', () => ({}));
vi.mock('../services/profileService', () => ({}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function signer(prefix = 'signed') {
  return vi.fn(async (paths: string[]) =>
    Object.fromEntries(
      paths.filter((path) => !path.includes('missing')).map((path) => [path, `${prefix}:${path}`]),
    ),
  );
}

/** Mirrors `useSignedAvatarUrls` on the core observer used by `useQueries`. */
function observeAvatarUrls(
  client: QueryClient,
  paths: string[],
  sign: ReturnType<typeof createAvatarUrlBatcher>,
  enabled = true,
) {
  const combine = (results: QueryObserverResult[]) =>
    combineAvatarUrls(paths, results as QueryObserverResult<string | null>[], []);
  const queries = () => paths.map((path) => avatarUrlQueryOptions(path, { enabled, sign }));
  const observer = new QueriesObserver<Record<string, string>>(client, queries(), { combine });
  const unsubscribe = observer.subscribe(() => undefined);
  const current = () =>
    observer
      .getOptimisticResult(
        queries().map((query) => client.defaultQueryOptions(query)) as unknown as Parameters<
          typeof observer.getOptimisticResult
        >[0],
        combine,
      )[1]();
  return { current, unsubscribe };
}

describe('createAvatarUrlBatcher', () => {
  it('signs every path requested in the same tick with one call', async () => {
    const sign = signer();
    const signOne = createAvatarUrlBatcher(sign);

    const results = await Promise.all([
      signOne('a.jpg'),
      signOne('b.jpg'),
      signOne('a.jpg'),
      signOne('missing.jpg'),
    ]);

    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith(['a.jpg', 'b.jpg', 'missing.jpg']);
    expect(results).toEqual(['signed:a.jpg', 'signed:b.jpg', 'signed:a.jpg', null]);
  });

  it('rejects every waiter of a failed batch and starts a fresh batch afterwards', async () => {
    const sign = vi
      .fn<(paths: string[]) => Promise<Record<string, string>>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ 'a.jpg': 'signed:a.jpg' });
    const signOne = createAvatarUrlBatcher(sign);

    await expect(Promise.all([signOne('a.jpg'), signOne('b.jpg')])).rejects.toThrow('offline');
    await expect(signOne('a.jpg')).resolves.toBe('signed:a.jpg');
    expect(sign).toHaveBeenCalledTimes(2);
  });
});

describe('avatar URL per-path cache', () => {
  it('signs only paths that are missing or about to expire, in one batch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.avatarUrl('fresh.jpg'), 'cached:fresh.jpg');
    client.setQueryData(queryKeys.avatarUrl('expiring.jpg'), 'cached:expiring.jpg', {
      updatedAt: Date.now() - AVATAR_SIGNED_URL_STALE_TIME_MS - 1,
    });
    const sign = signer();
    const view = observeAvatarUrls(
      client,
      ['expiring.jpg', 'fresh.jpg', 'new.jpg'],
      createAvatarUrlBatcher(sign),
    );

    // The cached URLs are visible immediately, the expiring one included (no fallback to initials).
    expect(view.current()).toEqual({
      'expiring.jpg': 'cached:expiring.jpg',
      'fresh.jpg': 'cached:fresh.jpg',
    });
    await settle();

    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith(['expiring.jpg', 'new.jpg']);
    expect(view.current()).toEqual({
      'expiring.jpg': 'signed:expiring.jpg',
      'fresh.jpg': 'cached:fresh.jpg',
      'new.jpg': 'signed:new.jpg',
    });
    view.unsubscribe();
  });

  it('reuses URLs signed by another screen when a new path joins the set', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const sign = signer();
    const signOne = createAvatarUrlBatcher(sign);
    const inbox = observeAvatarUrls(client, ['a.jpg', 'b.jpg'], signOne);
    await settle();
    inbox.unsubscribe();

    const sendTo = observeAvatarUrls(client, ['a.jpg', 'b.jpg', 'c.jpg'], signOne);
    expect(sendTo.current()).toEqual({ 'a.jpg': 'signed:a.jpg', 'b.jpg': 'signed:b.jpg' });
    await settle();

    expect(sign).toHaveBeenNthCalledWith(2, ['c.jpg']);
    expect(sendTo.current()['c.jpg']).toBe('signed:c.jpg');
    sendTo.unsubscribe();
  });

  it('returns whatever is cached and signs nothing while offline', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.avatarUrl('a.jpg'), 'cached:a.jpg', { updatedAt: 0 });
    const sign = signer();
    const view = observeAvatarUrls(
      client,
      ['a.jpg', 'b.jpg'],
      createAvatarUrlBatcher(sign),
      false,
    );
    await settle();

    expect(sign).not.toHaveBeenCalled();
    expect(view.current()).toEqual({ 'a.jpg': 'cached:a.jpg' });
    view.unsubscribe();
  });

  it('keeps the map identity until a URL in it changes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = observeAvatarUrls(client, ['a.jpg', 'b.jpg'], createAvatarUrlBatcher(signer()));
    await settle();
    const first = view.current();

    client.setQueryData(queryKeys.avatarUrl('a.jpg'), 'signed:a.jpg');
    expect(view.current()).toBe(first);

    client.setQueryData(queryKeys.avatarUrl('a.jpg'), 'resigned:a.jpg');
    const second = view.current();
    expect(second).not.toBe(first);
    expect(second).toEqual({ 'a.jpg': 'resigned:a.jpg', 'b.jpg': 'signed:b.jpg' });
    view.unsubscribe();
  });

  it('retries an unsignable path sooner than a signed one', () => {
    const options = avatarUrlQueryOptions('a.jpg', { enabled: true, sign: async () => null });
    const staleTime = options.staleTime as (query: { state: { data: string | null } }) => number;

    expect(staleTime({ state: { data: 'signed:a.jpg' } })).toBe(AVATAR_SIGNED_URL_STALE_TIME_MS);
    expect(staleTime({ state: { data: null } })).toBe(UNSIGNED_AVATAR_RETRY_MS);
  });

  it('never persists signed URLs to the offline disk cache', () => {
    expect(describeOfflineCacheQuery(queryKeys.avatarUrl('a.jpg'))).toBeNull();
    expect(sanitizeOfflineQueryData(['x'], { signedUrl: 'https://x' })).toEqual({});
  });
});

describe('normalizeAvatarPaths / combineAvatarUrls', () => {
  it('ignores order, duplicates and empty paths', () => {
    expect(normalizeAvatarPaths(['b.jpg', null, 'a.jpg', '', ' ', undefined, 'b.jpg'])).toEqual([
      'a.jpg',
      'b.jpg',
    ]);
  });

  it('passes legacy direct URLs through and skips unsigned paths', () => {
    expect(
      combineAvatarUrls(['a.jpg', 'b.jpg'], [{ data: 'signed:a.jpg' }, { data: null }], [
        'https://cdn/x.jpg',
      ]),
    ).toEqual({ 'a.jpg': 'signed:a.jpg', 'https://cdn/x.jpg': 'https://cdn/x.jpg' });
  });
});
