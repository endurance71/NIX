import { supabase } from '../lib/supabase';
import { getCurrentUser } from './profileService';
import { DomainError } from './errors';
import { nowMs, trackDuration } from '../lib/telemetry';

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
  /** Sekundy wyświetlania u odbiorcy (5, 15, 30, 60, 180). */
  view_duration_sec: number;
  status: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
  sender: {
    username: string;
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
    avatar_storage_path?: string | null;
    avatar_emoji?: string | null;
  } | null;
};

type CleanupQueueRow = {
  nix_id: string;
  media_path: string;
  receiver_id: string;
  attempt_count: number;
};

type NixPageOptions = {
  limit?: number;
  beforeCreatedAt?: string;
};

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

function isMissingClientUploadColumnError(error: unknown) {
  const message = dbErrorMessage(error);
  return (
    message.includes('column nixes.client_upload_id does not exist') ||
    message.includes("Could not find the 'client_upload_id' column")
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

export type InsertNixMediaOptions = {
  mediaType?: 'image' | 'video';
  playbackDurationMs?: number | null;
  clientUploadId?: string;
  /**
   * Embedded miniatura jako data URL JPEG (`data:image/jpeg;base64,...`).
   * Zapisywana wyłącznie dla `mediaType === 'video'`. Pominięta, jeśli kolumna
   * `nixes.thumbnail_b64` nie istnieje (schema fallback).
   */
  thumbnailB64?: string | null;
};

function mapDatabaseError(error: unknown): DomainError {
  const message =
    typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Nieznany błąd bazy danych.';

  if (message.includes('Brak uprawnień') || message.includes('row-level security')) {
    return new DomainError('NOT_FRIEND', 'Możesz wysyłać wiadomości tylko do zaakceptowanych znajomych.');
  }

  if (message.includes('can_send_nix') || message.includes('Only viewed status')) {
    return new DomainError('INVALID_RECEIVER', 'Nieprawidłowy odbiorca wiadomości.');
  }

  if (message.includes('rate limit') || message.includes('too many')) {
    return new DomainError('RATE_LIMITED', 'Limit wysyłek został przekroczony. Spróbuj ponownie za chwilę.');
  }

  return new DomainError('UNKNOWN', message);
}

const ALLOWED_VIEW_DURATIONS = new Set([5, 15, 30, 60, 180]);
let supportsClientUploadId: boolean | null = null;
let supportsThumbnailB64: boolean | null = null;

export async function insertNix(
  receiverId: string,
  mediaPath: string,
  viewDurationSec = 5,
  mediaOptions?: InsertNixMediaOptions
) {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');

  const duration =
    typeof viewDurationSec === 'number' && ALLOWED_VIEW_DURATIONS.has(viewDurationSec)
      ? viewDurationSec
      : 5;

  const mediaType = mediaOptions?.mediaType ?? 'image';
  const playbackMsRaw = mediaOptions?.playbackDurationMs;
  const playbackMs =
    typeof playbackMsRaw === 'number' && Number.isFinite(playbackMsRaw)
      ? Math.max(1, Math.round(playbackMsRaw))
      : null;

  const minimalBase = {
    sender_id: user.id,
    receiver_id: receiverId,
    media_path: mediaPath,
    media_type: mediaType,
    client_upload_id: mediaOptions?.clientUploadId ?? null,
  };

  let payload: Record<string, unknown> = {
    ...minimalBase,
    view_duration_sec: duration,
    status: 'sent',
  };
  if (playbackMs !== null && mediaType === 'video') {
    payload.playback_duration_ms = playbackMs;
  }
  if (
    mediaType === 'video' &&
    typeof mediaOptions?.thumbnailB64 === 'string' &&
    mediaOptions.thumbnailB64.length > 0 &&
    supportsThumbnailB64 !== false
  ) {
    payload.thumbnail_b64 = mediaOptions.thumbnailB64;
  }

  let useLegacyInsert = supportsClientUploadId === false;
  const persistNix = async (nextPayload: Record<string, unknown>, legacyMode: boolean) => {
    if (legacyMode) {
      const { client_upload_id: _idempotencyKey, ...legacyPayload } = nextPayload;
      return await supabase.from('nixes').insert(legacyPayload);
    }
    return await supabase
      .from('nixes')
      .upsert(nextPayload, { onConflict: 'sender_id,receiver_id,client_upload_id', ignoreDuplicates: true });
  };

  let { error } = await persistNix(payload, useLegacyInsert);
  if (error && isMissingClientUploadColumnError(error)) {
    useLegacyInsert = true;
    supportsClientUploadId = false;
    ({ error } = await persistNix(payload, true));
  }

  if (error && isMissingThumbnailColumnError(error)) {
    supportsThumbnailB64 = false;
    const { thumbnail_b64: _tb, ...rest } = payload;
    payload = rest;
    ({ error } = await persistNix(payload, useLegacyInsert));
  }

  if (error && isMissingPlaybackDurationColumnError(error)) {
    const { playback_duration_ms: _pb, ...rest } = payload;
    payload = rest;
    ({ error } = await persistNix(payload, useLegacyInsert));
  }

  if (error && isMissingViewDurationColumnError(error)) {
    const { view_duration_sec: _vd, ...rest } = payload;
    payload = rest;
    ({ error } = await persistNix(payload, useLegacyInsert));
  }

  if (error && isMissingStatusColumnError(error)) {
    const { status: _st, ...rest } = payload;
    ({ error } = await persistNix(rest, useLegacyInsert));
  }

  if (!error && supportsClientUploadId === null && !useLegacyInsert) {
    supportsClientUploadId = true;
  }
  if (!error && supportsThumbnailB64 === null && payload.thumbnail_b64 !== undefined) {
    supportsThumbnailB64 = true;
  }

  if (error) throw mapDatabaseError(error);
}

export async function fetchInboxNixes(options: NixPageOptions = {}) {
  const user = await getCurrentUser();
  if (!user) return [];
  const startedAt = nowMs();
  const limit = normalizePageLimit(options.limit);

  const inboxSelectFull = `
      id,
      sender_id,
      media_path,
      media_type,
      playback_duration_ms,
      thumbnail_b64,
      created_at,
      is_viewed,
      status,
      view_duration_sec
    `;

  const inboxSelectNoThumbnail = `
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
    .select(inboxSelectFull)
    .eq('receiver_id', user.id);
  if (options.beforeCreatedAt) {
    inboxQuery = inboxQuery.lt('created_at', options.beforeCreatedAt);
  }
  let { data, error } = await inboxQuery.order('created_at', { ascending: false }).limit(limit);

  if (error && isMissingThumbnailColumnError(error)) {
    let retryQuery = supabase
      .from('nixes')
      .select(inboxSelectNoThumbnail)
      .eq('receiver_id', user.id);
    if (options.beforeCreatedAt) {
      retryQuery = retryQuery.lt('created_at', options.beforeCreatedAt);
    }
    const retry = await retryQuery.order('created_at', { ascending: false }).limit(limit);
    data = retry.data as typeof data;
    error = retry.error;
  }

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
      thumbnail_b64: typeof nix.thumbnail_b64 === 'string' ? nix.thumbnail_b64 : null,
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

  const senderIds = Array.from(new Set((inboxRows ?? []).map((nix) => nix.sender_id as string)));
  const { data: senderProfiles, error: senderError } = await supabase.rpc('get_public_profiles_by_ids', {
    profile_ids: senderIds,
  });
  if (senderError) throw mapDatabaseError(senderError);

  const senderMap = new Map(
    ((senderProfiles ?? []) as {
      id: string;
      username: string;
      avatar_storage_path?: string | null;
      avatar_emoji?: string | null;
    }[]).map((profile) => [
      profile.id,
      profile,
    ])
  );

  const result = ((inboxRows ?? []).map((nix: any) => ({
    ...nix,
    media_type: typeof nix.media_type === 'string' ? nix.media_type : 'image',
    playback_duration_ms:
      typeof nix.playback_duration_ms === 'number' ? nix.playback_duration_ms : null,
    thumbnail_b64: typeof nix.thumbnail_b64 === 'string' ? nix.thumbnail_b64 : null,
    view_duration_sec: typeof nix.view_duration_sec === 'number' ? nix.view_duration_sec : 5,
    sender: senderMap.get(nix.sender_id)
      ? {
          username: senderMap.get(nix.sender_id)!.username,
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
export function filterUnreadInboxNixesFromSender(nixes: InboxNix[], senderId: string): InboxNix[] {
  return nixes
    .filter((s) => s.sender_id === senderId && s.is_viewed !== true)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

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

  return ((data ?? []) as any[]).map((nix) => ({
    ...nix,
    media_type: typeof nix.media_type === 'string' ? nix.media_type : 'image',
    playback_duration_ms: typeof nix.playback_duration_ms === 'number' ? nix.playback_duration_ms : null,
    thumbnail_b64: typeof nix.thumbnail_b64 === 'string' ? nix.thumbnail_b64 : null,
    view_duration_sec: typeof nix.view_duration_sec === 'number' ? nix.view_duration_sec : 5,
    status: nix.status ?? (nix.is_viewed ? 'viewed' : 'sent'),
    sender: null,
  })) as InboxNix[];
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

  const receiverIds = Array.from(new Set((sentRows ?? []).map((nix) => nix.receiver_id as string)));
  const { data: receiverProfiles, error: receiverError } = await supabase.rpc('get_public_profiles_by_ids', {
    profile_ids: receiverIds,
  });
  if (receiverError) throw mapDatabaseError(receiverError);

  const receiverMap = new Map(
    ((receiverProfiles ?? []) as {
      id: string;
      username: string;
      avatar_storage_path?: string | null;
      avatar_emoji?: string | null;
    }[]).map((profile) => [
      profile.id,
      profile,
    ])
  );

  const result = ((sentRows ?? []).map((nix: any) => ({
    ...nix,
    receiver: receiverMap.get(nix.receiver_id)
      ? {
          username: receiverMap.get(nix.receiver_id)!.username,
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

export async function createSignedNixUrl(path: string, expiresInSec = 60) {
  const { data, error } = await supabase.storage
    .from('media-vault')
    .createSignedUrl(path, expiresInSec);

  if (error) throw error;
  return data.signedUrl;
}

async function markNixViewed(nixId: string) {
  const basePayload = { is_viewed: true, viewed_at: new Date().toISOString() };
  const { error } = await supabase
    .from('nixes')
    .update({ ...basePayload, status: 'viewed' })
    .eq('id', nixId);

  if (error && isMissingStatusColumnError(error)) {
    const { error: fallbackError } = await supabase.from('nixes').update(basePayload).eq('id', nixId);
    if (fallbackError) throw mapDatabaseError(fallbackError);
    return;
  }

  if (error) throw mapDatabaseError(error);
}

export async function requestNixCleanup(nixId: string, mediaPath: string) {
  const { data, error } = await supabase.functions.invoke('cleanup-nix', {
    body: { nixId, mediaPath },
  });

  if (error) {
    throw new DomainError('CLEANUP_FAILED', 'Nie udało się wyczyścić wiadomości.');
  }

  if (data?.ok !== true) {
    throw new DomainError('CLEANUP_FAILED', 'Cleanup zwrócił nieoczekiwany rezultat.');
  }
}

export async function enqueueCleanupJob(nixId: string, mediaPath: string) {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await supabase.from('nix_cleanup_queue').upsert({
    nix_id: nixId,
    media_path: mediaPath,
    receiver_id: user.id,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('Nie udało się dodać zadania cleanup do kolejki', error);
  }
}

async function markCleanupJobDone(nixId: string) {
  const { error } = await supabase.from('nix_cleanup_queue').delete().eq('nix_id', nixId);
  if (error) {
    console.warn('Nie udało się usunąć zadania cleanup z kolejki', error);
  }
}

async function markCleanupJobFailed(nixId: string, reason: string) {
  const { error } = await supabase
    .from('nix_cleanup_queue')
    .update({
      last_error: reason,
      updated_at: new Date().toISOString(),
      attempt_count: 1,
      next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .eq('nix_id', nixId);

  if (error) {
    console.warn('Nie udało się zapisać błędu cleanup w kolejce', error);
  }
}

export async function flushCleanupQueue(limit = 10) {
  const user = await getCurrentUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('nix_cleanup_queue')
    .select('nix_id, media_path, receiver_id, attempt_count')
    .eq('receiver_id', user.id)
    .lte('next_attempt_at', new Date().toISOString())
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('Nie udało się odczytać kolejki cleanup', error);
    return;
  }

  await Promise.all(
    ((data ?? []) as CleanupQueueRow[]).map(async (job) => {
      try {
        await requestNixCleanup(job.nix_id, job.media_path);
        await markCleanupJobDone(job.nix_id);
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown cleanup failure';
        const { error: updateError } = await supabase
          .from('nix_cleanup_queue')
          .update({
            last_error: reason,
            attempt_count: job.attempt_count + 1,
            updated_at: new Date().toISOString(),
            next_attempt_at: new Date(Date.now() + Math.min(15 * 60_000, (job.attempt_count + 1) * 60_000)).toISOString(),
          })
          .eq('nix_id', job.nix_id);

        if (updateError) {
          console.warn('Nie udało się zaktualizować próby cleanup', updateError);
        }
      }
    })
  );
}

export async function markNixViewedWithCleanup(nixId: string, mediaPath: string) {
  await markNixViewed(nixId);
  await enqueueCleanupJob(nixId, mediaPath);

  try {
    await requestNixCleanup(nixId, mediaPath);
    await markCleanupJobDone(nixId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown cleanup error';
    await markCleanupJobFailed(nixId, reason);
    // Cleanup failure is non-critical — nix is already viewed and job is enqueued for retry.
    console.warn('Cleanup zostanie ponowiony:', reason);
  }
}
