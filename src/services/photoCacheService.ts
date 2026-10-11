import { captureAccountTransport, type AccountTransport } from '../lib/supabase';
import { encryptedPhotoCache, PHOTO_CACHE_FIRST_VIEW_TTL_MS } from '../lib/encryptedPhotoCache';
import { downloadPhotoToMemory } from './photoMemoryDownloader';
import { DomainError } from './errors';
import { preparePrivatePhotoCache } from '../lib/mediaCache';
import i18n from '../lib/i18n';

async function photoAccess(nixId: string, mediaPath: string, transport: AccountTransport) {
  transport.assertActive();
  const { data, error } = await transport.client.from('nixes')
    .select('id,receiver_id,media_path,media_type,is_viewed,is_replayed,replay_expires_at,status')
    .eq('id', nixId).single();
  transport.assertActive();
  if (error && error.code !== 'PGRST116') throw error;
  if (error || !data || data.receiver_id !== transport.ownerId || data.media_path !== mediaPath || data.media_type !== 'image'
    || data.status === 'cleaned' || data.status === 'cleanup_failed' || data.is_replayed) {
    await encryptedPhotoCache.remove(transport.ownerId, nixId);
    throw new DomainError('NOT_FOUND', i18n.t('viewer.mediaUnavailable'));
  }
  const replayExpiresAt = data.is_viewed ? Date.parse(data.replay_expires_at ?? '') : undefined;
  if (replayExpiresAt !== undefined && (!Number.isFinite(replayExpiresAt) || replayExpiresAt <= Date.now())) {
    await encryptedPhotoCache.remove(transport.ownerId, nixId);
    throw new DomainError('NOT_FOUND', i18n.t('viewer.mediaExpired'));
  }
  return replayExpiresAt;
}

export type PrivatePhotoLoad = {
  uri: string;
  /** Provisional deadline; `persisted` resolves with the canonical one. */
  expiresAt: number;
  /**
   * Settles after the encrypted copy is stored and authorized online once more. A rejection means
   * the photo must be hidden again (the cache entry is already removed on a revoked/expired result).
   */
  persisted: Promise<number>;
};

/** Settle both so a denial (which deletes ciphertext mid-read) wins over the cancelled read. */
async function authorizeAndReadCache(nixId: string, mediaPath: string, expectedOwner: string, transport: AccountTransport) {
  let order = 0;
  let accessSettledAt = 0;
  let readSettledAt = 0;
  const [access, cached] = await Promise.allSettled([
    photoAccess(nixId, mediaPath, transport).finally(() => { accessSettledAt = ++order; }),
    encryptedPhotoCache.read(expectedOwner, nixId, mediaPath).finally(() => { readSettledAt = ++order; }),
  ]);
  if (access.status === 'rejected') throw access.reason;
  if (cached.status === 'rejected') throw cached.reason;
  return { replayExpiresAt: access.value, cached: cached.value, readOutlastedAccess: readSettledAt > accessSettledAt };
}

export async function loadPrivatePhoto(nixId: string, mediaPath: string, expectedOwner: string): Promise<PrivatePhotoLoad> {
  const transport = await captureAccountTransport(expectedOwner);
  const assertCacheTicket = encryptedPhotoCache.ticket(expectedOwner, nixId);
  const assertTicket = () => { transport.assertActive(); assertCacheTicket(); };
  await preparePrivatePhotoCache();
  transport.assertActive(); assertTicket();
  // Every cache hit is authorized online. Local ciphertext never grants offline replay: the read runs
  // alongside the check, but its plaintext is returned only after the check passed.
  const lookup = await authorizeAndReadCache(nixId, mediaPath, expectedOwner, transport);
  let replayExpiresAt = lookup.replayExpiresAt;
  const { cached } = lookup;
  transport.assertActive(); assertTicket();
  if (cached) {
    // Decryption finished after the check: a replay/cleanup may have landed in between.
    if (lookup.readOutlastedAccess) {
      replayExpiresAt = await photoAccess(nixId, mediaPath, transport);
      transport.assertActive(); assertTicket();
    }
    if (replayExpiresAt !== undefined && (cached.metadata.phase !== 'replay' || cached.metadata.expiresAt !== replayExpiresAt)) {
      await encryptedPhotoCache.retainForReplay(expectedOwner, nixId, mediaPath, replayExpiresAt);
      transport.assertActive(); assertTicket();
      replayExpiresAt = await photoAccess(nixId, mediaPath, transport);
      transport.assertActive(); assertTicket();
    }
    const expiresAt = replayExpiresAt ?? cached.metadata.expiresAt;
    if (expiresAt <= Date.now()) {
      await encryptedPhotoCache.remove(expectedOwner, nixId);
      throw new DomainError('NOT_FOUND', i18n.t('viewer.mediaExpired'));
    }
    return { uri: `data:${cached.metadata.contentType};base64,${cached.base64}`, expiresAt, persisted: Promise.resolve(expiresAt) };
  }
  const { data, error } = await transport.client.storage.from('media-vault').createSignedUrl(mediaPath, 60);
  transport.assertActive(); assertTicket();
  if (error || !data?.signedUrl) throw error ?? new Error('Photo URL unavailable');
  const photo = await downloadPhotoToMemory(data.signedUrl, transport);
  transport.assertActive(); assertTicket();
  // An ACK/cleanup can finish during a download; never show or persist the earlier retention snapshot.
  replayExpiresAt = await photoAccess(nixId, mediaPath, transport);
  transport.assertActive(); assertTicket();
  const provisionalExpiresAt = replayExpiresAt ?? Date.now() + PHOTO_CACHE_FIRST_VIEW_TTL_MS;
  if (provisionalExpiresAt <= Date.now()) {
    await encryptedPhotoCache.remove(expectedOwner, nixId);
    throw new DomainError('NOT_FOUND', i18n.t('viewer.mediaExpired'));
  }
  // Display does not wait for encryption: the photo was just authorized online, exactly like a cache hit.
  const persisted = (async () => {
    const metadata = await encryptedPhotoCache.write({ ownerId: expectedOwner, nixId, mediaPath,
      base64: photo.base64, contentType: photo.contentType, replayExpiresAt, assertTicket });
    transport.assertActive(); assertTicket();
    // Encryption, DB writes and sweeping can outlast a replay or server cleanup.
    const finalReplayExpiresAt = await photoAccess(nixId, mediaPath, transport);
    transport.assertActive(); assertTicket();
    const expiresAt = Math.min(metadata.expiresAt, finalReplayExpiresAt ?? Infinity);
    if (expiresAt <= Date.now()) {
      await encryptedPhotoCache.remove(expectedOwner, nixId);
      throw new DomainError('NOT_FOUND', i18n.t('viewer.mediaExpired'));
    }
    return expiresAt;
  })();
  // Callers that only warm the cache may ignore the outcome; it must not surface as unhandled.
  persisted.catch(() => {});
  return { uri: `data:${photo.contentType};base64,${photo.base64}`, expiresAt: provisionalExpiresAt, persisted };
}

export async function retainPrivatePhotoForReplay(nixId: string, mediaPath: string, expectedOwner: string, capturedTransport?: AccountTransport) {
  const transport = capturedTransport ?? await captureAccountTransport(expectedOwner);
  const replayExpiresAt = await photoAccess(nixId, mediaPath, transport);
  if (replayExpiresAt !== undefined) {
    transport.assertActive();
    await encryptedPhotoCache.retainForReplay(expectedOwner, nixId, mediaPath, replayExpiresAt);
    transport.assertActive();
  }
}

const reconciliations = new Map<string, Promise<void>>();

/** Realtime/foreground synchronization deletes ciphertext whose server retention ended. */
export function reconcilePrivatePhotoCache(ownerId: string) {
  const current = reconciliations.get(ownerId);
  if (current) return current;
  const promise = (async () => {
    const transport = await captureAccountTransport(ownerId);
    await encryptedPhotoCache.sweep();
    transport.assertActive();
    const entries = await encryptedPhotoCache.entries(ownerId);
    transport.assertActive();
    if (entries.length === 0) return;
    for (let offset = 0; offset < entries.length; offset += 50) {
      const batch = entries.slice(offset, offset + 50);
      const { data, error } = await transport.client.from('nixes')
        .select('id,media_path,media_type,is_viewed,is_replayed,replay_expires_at,status')
        .eq('receiver_id', ownerId).in('id', batch.map((entry) => entry.nixId));
      transport.assertActive();
      if (error) throw error;
      for (const entry of batch) {
        const nix = data?.find((row) => row.id === entry.nixId);
        const deadline = nix?.is_viewed ? Date.parse(nix.replay_expires_at ?? '') : undefined;
        if (!nix || nix.media_type !== 'image' || nix.media_path !== entry.mediaPath || nix.is_replayed
          || nix.status === 'cleaned' || nix.status === 'cleanup_failed'
          || (deadline !== undefined && (!Number.isFinite(deadline) || deadline <= Date.now()))) {
          await encryptedPhotoCache.remove(ownerId, entry.nixId);
        } else if (deadline !== undefined && (entry.phase !== 'replay' || entry.expiresAt !== deadline)) {
          await encryptedPhotoCache.retainForReplay(ownerId, entry.nixId, entry.mediaPath, deadline);
        }
        transport.assertActive();
      }
    }
  })().finally(() => { if (reconciliations.get(ownerId) === promise) reconciliations.delete(ownerId); });
  reconciliations.set(ownerId, promise);
  return promise;
}
