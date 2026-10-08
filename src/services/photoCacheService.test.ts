import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPrivatePhoto, reconcilePrivatePhotoCache } from './photoCacheService';
import { setSessionOwner } from '../lib/sessionScope';

const { cache, download, query, sign, row } = vi.hoisted(() => ({
  cache: { ticket: vi.fn(() => () => {}), read: vi.fn(), write: vi.fn(), remove: vi.fn(), retainForReplay: vi.fn(), entries: vi.fn(), sweep: vi.fn() },
  download: vi.fn(), query: vi.fn(), sign: vi.fn(),
  row: { id: 'nix', receiver_id: 'a', media_path: 'a/nix.jpg', media_type: 'image', is_viewed: false, is_replayed: false, replay_expires_at: null as string | null, status: 'sent' },
}));
vi.mock('../lib/encryptedPhotoCache', () => ({ encryptedPhotoCache: cache }));
vi.mock('../lib/mediaCache', () => ({ preparePrivatePhotoCache: vi.fn() }));
vi.mock('./photoMemoryDownloader', () => ({ downloadPhotoToMemory: download }));
vi.mock('../lib/supabase', async () => {
  const { captureSessionScope } = await import('../lib/sessionScope');
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ single: query, in: query }) }) }),
    storage: { from: () => ({ createSignedUrl: sign }) },
  };
  return { captureAccountTransport: async (owner = 'a') => ({ ...captureSessionScope(owner), client, token: 'jwt-a' }) };
});

describe('online-authorized private photo cache', () => {
  beforeEach(() => {
    vi.clearAllMocks(); setSessionOwner('a');
    row.is_viewed = false; row.is_replayed = false; row.status = 'sent'; row.replay_expires_at = null;
    query.mockImplementation(async () => ({ data: { ...row }, error: null }));
    cache.read.mockResolvedValue(null); cache.remove.mockResolvedValue(undefined);
    cache.write.mockImplementation(async (input) => ({ expiresAt: input.replayExpiresAt ?? Date.now() + 600_000 }));
    cache.entries.mockResolvedValue([]); cache.sweep.mockResolvedValue(undefined);
    sign.mockResolvedValue({ data: { signedUrl: 'https://test.supabase.co/signed' }, error: null });
    download.mockResolvedValue({ base64: 'cGhvdG8=', contentType: 'image/jpeg' });
  });

  it('authorizes every cache hit online without refreshing its original TTL', async () => {
    const deadline = Date.now() + 25_000;
    cache.read.mockResolvedValue({ base64: 'cGhvdG8=', metadata: { contentType: 'image/jpeg', phase: 'unviewed', expiresAt: deadline } });
    expect(await loadPrivatePhoto('nix', 'a/nix.jpg', 'a')).toEqual({ uri: 'data:image/jpeg;base64,cGhvdG8=', expiresAt: deadline });
    expect(query).toHaveBeenCalledTimes(2);
    expect(cache.write).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled();
  });

  it('does not grant offline replay or destroy ciphertext on a transient authorization failure', async () => {
    cache.read.mockResolvedValue({ base64: 'cGhvdG8=', metadata: { expiresAt: Date.now() + 25_000 } });
    query.mockResolvedValue({ data: null, error: { code: 'NETWORK', message: 'offline' } });
    await expect(loadPrivatePhoto('nix', 'a/nix.jpg', 'a')).rejects.toMatchObject({ code: 'NETWORK' });
    expect(cache.read).not.toHaveBeenCalled(); expect(cache.remove).not.toHaveBeenCalled();
  });

  it('rechecks canonical replay retention after an ACK completes during download', async () => {
    const deadline = Date.now() + 2_000_000;
    download.mockImplementationOnce(async () => {
      row.is_viewed = true; row.replay_expires_at = new Date(deadline).toISOString();
      return { base64: 'cGhvdG8=', contentType: 'image/jpeg' };
    });
    const result = await loadPrivatePhoto('nix', 'a/nix.jpg', 'a');
    expect(query).toHaveBeenCalledTimes(3);
    expect(cache.write).toHaveBeenCalledWith(expect.objectContaining({ replayExpiresAt: deadline }));
    expect(result.expiresAt).toBe(deadline);
  });

  it('rejects and deletes a photo cleaned/replayed while its signed download was paused', async () => {
    download.mockImplementationOnce(async () => { row.is_replayed = true; return { base64: 'cGhvdG8=', contentType: 'image/jpeg' }; });
    await expect(loadPrivatePhoto('nix', 'a/nix.jpg', 'a')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(cache.remove).toHaveBeenCalledWith('a', 'nix');
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('never writes downloaded plaintext after logout/login B', async () => {
    download.mockImplementationOnce(async () => { setSessionOwner(null); setSessionOwner('b'); return { base64: 'cGhvdG8=', contentType: 'image/jpeg' }; });
    await expect(loadPrivatePhoto('nix', 'a/nix.jpg', 'a')).rejects.toMatchObject({ name: 'AbortError' });
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('foreground/realtime reconciliation removes server-cleaned ciphertext', async () => {
    cache.entries.mockResolvedValue([{ nixId: 'nix', mediaPath: 'a/nix.jpg', phase: 'replay', expiresAt: Date.now() + 25_000 }]);
    query.mockResolvedValue({ data: [{ ...row, status: 'cleaned' }], error: null });
    await reconcilePrivatePhotoCache('a');
    expect(cache.remove).toHaveBeenCalledWith('a', 'nix');
  });

  it.each(['replayed', 'cleaned'])('rejects a cache hit %s while decryption is paused', async (change) => {
    let release!: () => void;
    cache.read.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { base64: 'cGhvdG8=', metadata: { contentType: 'image/jpeg', phase: 'unviewed', expiresAt: Date.now() + 25_000 } };
    });
    const pending = loadPrivatePhoto('nix', 'a/nix.jpg', 'a');
    const denied = expect(pending).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await vi.waitFor(() => expect(release).toBeDefined());
    if (change === 'replayed') row.is_replayed = true;
    else row.status = 'cleaned';
    release(); await denied;
    expect(cache.remove).toHaveBeenCalledWith('a', 'nix');
    expect(sign).not.toHaveBeenCalled();
  });

  it('rechecks online authorization after encryption and DB write finish', async () => {
    cache.write.mockImplementationOnce(async () => {
      row.status = 'cleaned';
      return { expiresAt: Date.now() + 25_000 };
    });
    await expect(loadPrivatePhoto('nix', 'a/nix.jpg', 'a')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(cache.remove).toHaveBeenCalledWith('a', 'nix');
  });
});
