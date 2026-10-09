import { supabase, captureAccountTransport, type AccountTransport } from '../lib/supabase';
import { encryptedPhotoCache } from '../lib/encryptedPhotoCache';
import { retainPrivatePhotoForReplay } from './photoCacheService';
import { getCurrentUser } from './profileService';
import { DomainError } from './errors';
import { nowMs, trackDuration } from '../lib/telemetry';
import { filterUnreadInboxNixesFromSender } from '../lib/nixUnreadQueue';

export type InboxNix = {
  id: string;
  sender_id: string;
  media_path: string;
  created_at: string;
  is_viewed: boolean;
  /** Domyślnie `image`; klipy wideo mają `video`. */
  media_type: string;
  /** Długość klipu wideo (ms); przy zdjęciach zwykle null. */
  playback_duration_ms: number | null;
  /**
   * Embedded miniatura wideo (data URL JPEG base64). Pozwala odbiorcy
   * wyświetlić pierwszą klatkę natychmiast, bez dodatkowego pobrania.
   */
  thumbnail_b64?: string | null;
  /** Sekundy wyświetlania u odbiorcy (0, 5, 15, 30, 60, 180). 0 to nielimitowany. */
  view_duration_sec: number;
  is_replayed: boolean;
  replay_expires_at: string | null;
  status: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
  sender: {
    username: string;
    display_name?: string | null;
    avatar_storage_path?: string | null;
    avatar_emoji?: string | null;
  } | null;
};

export type SentNix = {
  id: string;
  receiver_id: string;
  created_at: string;
  status: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
  viewed_at: string | null;
  cleaned_at: string | null;
  receiver: {
    username: string;
    display_name?: string | null;
    avatar_storage_path?: string | null;
    avatar_emoji?: string | null;
  } | null;
};

type NixPageOptions = {
  limit?: number;
  beforeCreatedAt?: string;
  /** Internal bundle optimization: rows are enriched in one shared profile lookup. */
  includeProfiles?: boolean;
};

export type NixPublicProfile = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_storage_path?: string | null;
  avatar_emoji?: string | null;
};

export async function fetchNixPublicProfiles(profileIds: readonly string[]) {
  const uniqueIds = Array.from(new Set(profileIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, NixPublicProfile>();
  const { data, error } = await supabase.rpc('get_public_profiles_by_ids', {
    profile_ids: uniqueIds,
  });
  if (error) throw mapDatabaseError(error);
  return new Map(
    ((data ?? []) as NixPublicProfile[]).map((profile) => [profile.id, profile] as const)
  );
}

const DEFAULT_NIX_PAGE_LIMIT = 100;

function normalizePageLimit(limit: number | undefined) {
  return Math.max(1, Math.min(limit ?? DEFAULT_NIX_PAGE_LIMIT, 100));
}

function dbErrorMessage(error: unknown) {
  return typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
    ? error.message
    : '';
}

function isMissingStatusColumnError(error: unknown) {
  const message = dbErrorMessage(error);
  return message.includes('column nixes.status does not exist') || message.includes("Could not find the 'status' column");
}

function isMissingViewDurationColumnError(error: unknown) {
  const message = dbErrorMessage(error);
  return (
    message.includes('column nixes.view_duration_sec does not exist') ||
    message.includes("Could not find the 'view_duration_sec' column")
  );
}

function isMissingPlaybackDurationColumnError(error: unknown) {
  const message = dbErrorMessage(error);
  return (
    message.includes('column nixes.playback_duration_ms does not exist') ||
    message.includes("Could not find the 'playback_duration_ms' column")
  );
}

function isMissingThumbnailColumnError(error: unknown) {
  const message = dbErrorMessage(error);
  return (
    message.includes('column nixes.thumbnail_b64 does not exist') ||
    message.includes("Could not find the 'thumbnail_b64' column")
  );
}

function isMissingDeleteConversationRpcError(error: unknown) {
  const message = dbErrorMessage(error).toLowerCase();
  return (
    message.includes('delete_my_conversation_with_peer') &&
    (message.includes('could not find the function') || message.includes('schema cache'))
  );
}

function mapDatabaseError(error: unknown): DomainError {
  const message =
    typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Nieznany błąd bazy danych.';

  if (message.includes('Brak uprawnień') || message.includes('row-level security')) {
    return new DomainError('NOT_FRIEND', 'Możesz wysyłać wiadomości tylko do zaakceptowanych znajomych.');
  }

  if (message.includes('permission denied for function can_send_nix')) {
    return new DomainError('UNKNOWN', 'Konfiguracja wysyłki jest nieprawidłowa. Spróbuj ponownie później.');
  }

  if (message.includes('Only viewed status')) {
    return new DomainError('INVALID_RECEIVER', 'Nieprawidłowy odbiorca wiadomości.');
  }

  if (message.includes('rate limit') || message.includes('too many')) {
    return new DomainError('RATE_LIMITED', 'Limit wysyłek został przekroczony. Spróbuj ponownie za chwilę.');
  }

  return new DomainError('UNKNOWN', message);
}

export async function fetchInboxNixes(options: NixPageOptions = {}) {
  const user = await getCurrentUser();
  if (!user) return [];
  const startedAt = nowMs();
  const limit = normalizePageLimit(options.limit);

  // Lista Skrzynki nie renderuje miniaturek — `thumbnail_b64` zostaje w
  // `fetchUnreadInboxQueueFromSender` / viewerze (TTFP), nie w cold-fetchu listy.
  const inboxSelectList = `
      id,
      sender_id,
      media_path,
      media_type,
      playback_duration_ms,
      created_at,
      is_viewed,
      status,
      view_duration_sec
    `;

  const inboxSelectNoPlayback = `
      id,
      sender_id,
      media_path,
      media_type,
      created_at,
      is_viewed,
      status,
      view_duration_sec
    `;

  const inboxSelectNoViewDuration = `
      id,
      sender_id,
      media_path,
      media_type,
      created_at,
      is_viewed,
      status
    `;

  let inboxQuery = supabase
    .from('nixes')
    .select(inboxSelectList)
    .eq('receiver_id', user.id);
  if (options.beforeCreatedAt) {
    inboxQuery = inboxQuery.lt('created_at', options.beforeCreatedAt);
  }
  let { data, error } = await inboxQuery.order('created_at', { ascending: false }).limit(limit);

  if (error && isMissingPlaybackDurationColumnError(error)) {
    let retryQuery = supabase
      .from('nixes')
      .select(inboxSelectNoPlayback)
      .eq('receiver_id', user.id);
    if (options.beforeCreatedAt) {
      retryQuery = retryQuery.lt('created_at', options.beforeCreatedAt);
    }
    const retry = await retryQuery.order('created_at', { ascending: false }).limit(limit);
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error && isMissingViewDurationColumnError(error)) {
    let retryQuery = supabase
      .from('nixes')
      .select(inboxSelectNoViewDuration)
      .eq('receiver_id', user.id);
    if (options.beforeCreatedAt) {
      retryQuery = retryQuery.lt('created_at', options.beforeCreatedAt);
    }
    const retry = await retryQuery.order('created_at', { ascending: false }).limit(limit);
    data = retry.data as typeof data;
    error = retry.error;
  }

  /** Stałe pole widoku — część schematów DB bez kolumny `view_duration_sec`. */
  let inboxRows: any[] | null = null;
  if (!error && Array.isArray(data)) {
    inboxRows = data.map((nix: Record<string, unknown>) => ({
      ...nix,
      media_type: typeof nix.media_type === 'string' ? nix.media_type : 'image',
      playback_duration_ms:
        typeof nix.playback_duration_ms === 'number' ? nix.playback_duration_ms : null,
      thumbnail_b64: null,
      view_duration_sec: typeof nix.view_duration_sec === 'number' ? nix.view_duration_sec : 5,
    }));
  }
  if (error && isMissingStatusColumnError(error)) {
    let fallbackQuery = supabase
      .from('nixes')
      .select(
        `
        id,
        sender_id,
        media_path,
        created_at,
        is_viewed
      `
      )
      .eq('receiver_id', user.id);
    if (options.beforeCreatedAt) {
      fallbackQuery = fallbackQuery.lt('created_at', options.beforeCreatedAt);
    }
    const { data: fallbackData, error: fallbackError } = await fallbackQuery
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fallbackError) throw mapDatabaseError(fallbackError);
    inboxRows = (fallbackData ?? []).map((nix: any) => ({
      ...nix,
      media_type: 'image',
      playback_duration_ms: null,
      status: nix.is_viewed ? 'viewed' : 'sent',
      view_duration_sec: typeof nix.view_duration_sec === 'number' ? nix.view_duration_sec : 5,
    }));
  } else if (error) {
    throw mapDatabaseError(error);
  }

  const senderIds = (inboxRows ?? []).map((nix) => nix.sender_id as string);
  const senderMap =
    options.includeProfiles === false
      ? new Map<string, NixPublicProfile>()
      : await fetchNixPublicProfiles(senderIds);

  const result = ((inboxRows ?? []).map((nix: any) => ({
    ...nix,
    media_type: typeof nix.media_type === 'string' ? nix.media_type : 'image',
    playback_duration_ms:
      typeof nix.playback_duration_ms === 'number' ? nix.playback_duration_ms : null,
    thumbnail_b64: null,
    view_duration_sec: typeof nix.view_duration_sec === 'number' ? nix.view_duration_sec : 5,
    sender: senderMap.get(nix.sender_id)
      ? {
          username: senderMap.get(nix.sender_id)!.username,
          display_name: senderMap.get(nix.sender_id)!.display_name ?? null,
          avatar_storage_path: senderMap.get(nix.sender_id)!.avatar_storage_path ?? null,
          avatar_emoji: senderMap.get(nix.sender_id)!.avatar_emoji ?? null,
        }
      : null,
  })) ?? []) as InboxNix[];

  trackDuration('inbox_fetch_ms', startedAt, {
    status: 'success',
    row_count: result.length,
    limit,
  });
  return result;
}

/** Nieobejrzane nixy od jednego nadawcy, od najstarszego (FIFO przy odtwarzaniu). */
export { filterUnreadInboxNixesFromSender } from '../lib/nixUnreadQueue';

export async function fetchUnreadInboxQueueFromSender(senderId: string): Promise<InboxNix[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const selectCols = `
    id, sender_id, media_path, media_type, playback_duration_ms, thumbnail_b64,
    created_at, is_viewed, status, view_duration_sec
  `;

  let { data, error } = await supabase
    .from('nixes')
    .select(selectCols)
    .eq('receiver_id', user.id)
    .eq('sender_id', senderId)
    .eq('is_viewed', false)
    .not('status', 'in', '("cleaned","cleanup_failed")')
    .order('created_at', { ascending: true });

  if (error && isMissingThumbnailColumnError(error)) {
    const retry = await supabase
      .from('nixes')
      .select('id, sender_id, media_path, media_type, playback_duration_ms, created_at, is_viewed, status, view_duration_sec')
      .eq('receiver_id', user.id)
      .eq('sender_id', senderId)
      .eq('is_viewed', false)
      .order('created_at', { ascending: true });
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error && isMissingPlaybackDurationColumnError(error)) {
    const retry = await supabase
      .from('nixes')
      .select('id, sender_id, media_path, media_type, created_at, is_viewed, status, view_duration_sec')
      .eq('receiver_id', user.id)
      .eq('sender_id', senderId)
      .eq('is_viewed', false)
      .order('created_at', { ascending: true });
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error && isMissingViewDurationColumnError(error)) {
    const retry = await supabase
      .from('nixes')
      .select('id, sender_id, media_path, media_type, created_at, is_viewed, status')
      .eq('receiver_id', user.id)
      .eq('sender_id', senderId)
      .eq('is_viewed', false)
      .order('created_at', { ascending: true });
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error && isMissingStatusColumnError(error)) {
    const retry = await supabase
      .from('nixes')
      .select('id, sender_id, media_path, created_at, is_viewed')
      .eq('receiver_id', user.id)
      .eq('sender_id', senderId)
      .eq('is_viewed', false)
      .order('created_at', { ascending: true });
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) throw mapDatabaseError(error);

  return filterUnreadInboxNixesFromSender(
    ((data ?? []) as any[]).map((nix) => ({
      ...nix,
      media_type: typeof nix.media_type === 'string' ? nix.media_type : 'image',
      playback_duration_ms: typeof nix.playback_duration_ms === 'number' ? nix.playback_duration_ms : null,
      thumbnail_b64: typeof nix.thumbnail_b64 === 'string' ? nix.thumbnail_b64 : null,
      view_duration_sec: typeof nix.view_duration_sec === 'number' ? nix.view_duration_sec : 5,
      is_replayed: !!nix.is_replayed,
      replay_expires_at: nix.replay_expires_at ?? null,
      status: nix.status ?? (nix.is_viewed ? 'viewed' : 'sent'),
      sender: null,
    })) as InboxNix[],
    senderId
  );
}

export async function fetchSentNixes(options: NixPageOptions = {}) {
  const user = await getCurrentUser();
  if (!user) return [];
  const startedAt = nowMs();
  const limit = normalizePageLimit(options.limit);

  let sentQuery = supabase
    .from('nixes')
    .select(
      `
      id,
      receiver_id,
      created_at,
      status,
      viewed_at,
      cleaned_at
    `
    )
    .eq('sender_id', user.id);
  if (options.beforeCreatedAt) {
    sentQuery = sentQuery.lt('created_at', options.beforeCreatedAt);
  }
  const { data, error } = await sentQuery.order('created_at', { ascending: false }).limit(limit);

  let sentRows = data;
  if (error && isMissingStatusColumnError(error)) {
    let fallbackQuery = supabase
      .from('nixes')
      .select(
        `
        id,
        receiver_id,
        created_at,
        is_viewed,
        viewed_at
      `
      )
      .eq('sender_id', user.id);
    if (options.beforeCreatedAt) {
      fallbackQuery = fallbackQuery.lt('created_at', options.beforeCreatedAt);
    }
    const { data: fallbackData, error: fallbackError } = await fallbackQuery
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fallbackError) throw mapDatabaseError(fallbackError);
    sentRows = (fallbackData ?? []).map((nix: any) => ({
      ...nix,
      status: nix.is_viewed ? 'viewed' : 'sent',
      cleaned_at: null,
    }));
  } else if (error) {
    throw mapDatabaseError(error);
  }

  const receiverIds = (sentRows ?? []).map((nix) => nix.receiver_id as string);
  const receiverMap =
    options.includeProfiles === false
      ? new Map<string, NixPublicProfile>()
      : await fetchNixPublicProfiles(receiverIds);

  const result = ((sentRows ?? []).map((nix: any) => ({
    ...nix,
    receiver: receiverMap.get(nix.receiver_id)
      ? {
          username: receiverMap.get(nix.receiver_id)!.username,
          display_name: receiverMap.get(nix.receiver_id)!.display_name ?? null,
          avatar_storage_path: receiverMap.get(nix.receiver_id)!.avatar_storage_path ?? null,
          avatar_emoji: receiverMap.get(nix.receiver_id)!.avatar_emoji ?? null,
        }
      : null,
  })) ?? []) as SentNix[];

  trackDuration('sent_fetch_ms', startedAt, {
    status: 'success',
    row_count: result.length,
    limit,
  });
  return result;
}

export type ChatNixEvent = {
  id: string;
  direction: 'sent' | 'received';
  created_at: string;
  media_type: string;
  media_path: string | null;
  thumbnail_b64: string | null;
  is_viewed: boolean;
  is_replayed: boolean;
  replay_expires_at: string | null;
  status: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
  view_duration_sec: number;
  playback_duration_ms?: number | null;
  client_upload_id: string | null;
};

/** NiXy w obu kierunkach z danym peerm — do unified czatu. */
export async function fetchChatNixesWithPeer(
  peerId: string,
  limit = 50,
  currentUserId?: string
): Promise<ChatNixEvent[]> {
  const userId = currentUserId || (await getCurrentUser())?.id;
  if (!userId || !peerId) return [];
  const pageLimit = normalizePageLimit(limit);

  const { data, error } = await supabase
    .from('nixes')
    .select(
      `
      id,
      sender_id,
      receiver_id,
      created_at,
      media_path,
      media_type,
      thumbnail_b64,
      is_viewed,
      is_replayed,
      replay_expires_at,
      status,
      view_duration_sec,
      playback_duration_ms,
      client_upload_id
    `
    )
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${userId})`
    )
    .order('created_at', { ascending: false })
    .limit(pageLimit);

  if (error) throw mapDatabaseError(error);

  return ((data ?? []) as {
    id: string;
    sender_id: string;
    receiver_id: string;
    created_at: string;
    media_path: string | null;
    media_type: string | null;
    thumbnail_b64: string | null;
    is_viewed: boolean | null;
    is_replayed: boolean | null;
    replay_expires_at: string | null;
    status: ChatNixEvent['status'] | null;
    view_duration_sec: number | null;
    playback_duration_ms: number | null;
    client_upload_id: string | null;
  }[]).map((nix) => {
    const direction: 'sent' | 'received' = nix.sender_id === userId ? 'sent' : 'received';
    const isViewed = nix.is_viewed === true || nix.status === 'viewed' || nix.status === 'cleaned';
    return {
      id: nix.id,
      direction,
      created_at: nix.created_at,
      media_type: nix.media_type === 'video' ? 'video' : 'image',
      media_path: nix.media_path,
      thumbnail_b64: nix.thumbnail_b64 ?? null,
      is_viewed: isViewed,
      is_replayed: nix.is_replayed ?? false,
      replay_expires_at: nix.replay_expires_at ?? null,
      status: nix.status ?? (isViewed ? 'viewed' : 'sent'),
      view_duration_sec: typeof nix.view_duration_sec === 'number' ? nix.view_duration_sec : 5,
      playback_duration_ms: typeof nix.playback_duration_ms === 'number' ? nix.playback_duration_ms : null,
      client_upload_id: nix.client_upload_id ?? null,
    };
  });
}

export async function deleteConversationWithPeer(peerProfileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');
  if (!peerProfileId) throw new DomainError('INVALID_INPUT', 'Brak identyfikatora rozmówcy.');
  if (peerProfileId === user.id) {
    throw new DomainError('INVALID_INPUT', 'Nie można usunąć rozmowy z samym sobą.');
  }

  const { error } = await supabase.rpc('delete_my_conversation_with_peer', {
    peer_profile_id: peerProfileId,
  });
  if (error) {
    if (isMissingDeleteConversationRpcError(error)) {
      throw new DomainError(
        'UNKNOWN',
        'Usuwanie rozmowy jest chwilowo niedostępne. Spróbuj ponownie za chwilę.'
      );
    }
    throw mapDatabaseError(error);
  }
}

function normalizeSignedUrlExpiresIn(expiresInSec: number) {
  if (!Number.isFinite(expiresInSec)) return 60;
  return Math.max(1, Math.ceil(expiresInSec));
}

export async function createSignedNixUrl(path: string, expiresInSec = 60) {
  const { data, error } = await supabase.storage
    .from('media-vault')
    .createSignedUrl(path, normalizeSignedUrlExpiresIn(expiresInSec));

  if (error) throw error;
  return data.signedUrl;
}

async function requestNixCleanup(nixId: string, transport: AccountTransport) {
  transport.assertActive();
  const { data, error } = await transport.client.functions.invoke('cleanup-nix', { body: { nixId } });
  transport.assertActive();
  if (error || data?.ok !== true) throw new DomainError('CLEANUP_FAILED', 'Nie udało się wyczyścić wiadomości.');
}

export async function flushCleanupQueue(limit = 10) {
  const user = await getCurrentUser();
  if (!user) return;
  const transport = await captureAccountTransport(user.id);
  const { data, error } = await transport.client.from('nix_cleanup_queue')
    .select('nix_id').eq('receiver_id', transport.ownerId)
    .lte('next_attempt_at', new Date().toISOString()).order('updated_at', { ascending: true }).limit(limit);
  transport.assertActive();
  if (error) throw mapDatabaseError(error);
  for (const job of data ?? []) {
    transport.assertActive();
    await encryptedPhotoCache.remove(transport.ownerId, job.nix_id);
    try { await requestNixCleanup(job.nix_id, transport); }
    catch (error) { transport.assertActive(); console.warn('Cleanup zostanie ponowiony przez serwer', error); }
  }
}

export async function markNixViewedForReplay(nixId: string, capturedTransport?: AccountTransport) {
  const transport = capturedTransport ?? await captureAccountTransport();
  transport.assertActive();
  const { error } = await transport.client.rpc('mark_nix_viewed_for_replay', { p_nix_id: nixId });
  transport.assertActive();
  if (error) throw mapDatabaseError(error);
  // The server supplies the replay deadline; ACK retries and viewer exits use the same policy.
  const { data } = await transport.client.from('nixes').select('media_path,media_type').eq('id', nixId).single();
  transport.assertActive();
  if (data?.media_type === 'image') {
    await retainPrivatePhotoForReplay(nixId, data.media_path, transport.ownerId, transport).catch(() => {});
    transport.assertActive();
  }
}

/** Media missing / unreadable — remove from unread FIFO without a replay window. */
export async function markNixUnplayable(nixId: string) {
  const transport = await captureAccountTransport();
  await encryptedPhotoCache.remove(transport.ownerId, nixId);
  transport.assertActive();
  const { error } = await transport.client.rpc('mark_nix_unplayable', { p_nix_id: nixId });
  transport.assertActive();
  if (error) throw mapDatabaseError(error);
}

export async function markNixReplayedWithCleanup(nixId: string, _legacyMediaPath?: string, capturedTransport?: AccountTransport) {
  const transport = capturedTransport ?? await captureAccountTransport();
  await encryptedPhotoCache.remove(transport.ownerId, nixId);
  transport.assertActive();
  const { error } = await transport.client.rpc('mark_nix_replayed', { p_nix_id: nixId });
  transport.assertActive();
  if (error) throw mapDatabaseError(error);
  const { error: queueError } = await transport.client.rpc('request_nix_cleanup', { p_nix_id: nixId });
  transport.assertActive();
  if (queueError) throw mapDatabaseError(queueError);
  try { await requestNixCleanup(nixId, transport); }
  catch (error) {
    transport.assertActive();
    // The canonical server queue owns retries and derives the media path from the NiX.
    console.warn('Cleanup zostanie ponowiony przez serwer', error);
  }
}

export async function fetchInboxNixById(nixId: string): Promise<InboxNix> {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  const { data, error } = await supabase
    .from('nixes')
    .select(
      `
      id,
      media_path,
      media_type,
      playback_duration_ms,
      thumbnail_b64,
      view_duration_sec,
      sender_id,
      receiver_id,
      status,
      created_at,
      is_viewed,
      viewed_at,
      is_replayed,
      replay_expires_at,
      cleaned_at
    `
    )
    .eq('id', nixId)
    .single();

  if (error) throw mapDatabaseError(error);
  if (!data) throw new DomainError('NOT_FOUND', 'Nix nie istnieje.');

  const senderIds = [data.sender_id];
  const senderMap = await fetchNixPublicProfiles(senderIds);

  const nix = {
    ...data,
    sender: senderMap.get(data.sender_id)
      ? {
          username: senderMap.get(data.sender_id)!.username,
          display_name: senderMap.get(data.sender_id)!.display_name ?? null,
          avatar_storage_path: senderMap.get(data.sender_id)!.avatar_storage_path ?? null,
          avatar_emoji: senderMap.get(data.sender_id)!.avatar_emoji ?? null,
        }
      : null,
  };

  return nix as InboxNix;
}
