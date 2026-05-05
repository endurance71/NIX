import { supabase } from '../lib/supabase';
import { getCurrentUser } from './profileService';
import { DomainError } from './errors';

export type InboxSnap = {
  id: string;
  sender_id: string;
  media_path: string;
  created_at: string;
  is_viewed: boolean;
  /** Domyślnie `image`; klipy wideo mają `video`. */
  media_type: string;
  /** Długość klipu wideo (ms); przy zdjęciach zwykle null. */
  playback_duration_ms: number | null;
  /** Sekundy wyświetlania u odbiorcy (5, 15, 30, 60, 180). */
  view_duration_sec: number;
  status: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
  sender: {
    username: string;
    avatar_storage_path?: string | null;
    avatar_emoji?: string | null;
  } | null;
};

export type SentSnap = {
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
  snap_id: string;
  media_path: string;
  receiver_id: string;
  attempt_count: number;
};

function dbErrorMessage(error: unknown) {
  return typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
    ? error.message
    : '';
}

function isMissingStatusColumnError(error: unknown) {
  const message = dbErrorMessage(error);
  return message.includes('column snaps.status does not exist') || message.includes("Could not find the 'status' column");
}

function isMissingViewDurationColumnError(error: unknown) {
  const message = dbErrorMessage(error);
  return (
    message.includes('column snaps.view_duration_sec does not exist') ||
    message.includes("Could not find the 'view_duration_sec' column")
  );
}

function isMissingPlaybackDurationColumnError(error: unknown) {
  const message = dbErrorMessage(error);
  return (
    message.includes('column snaps.playback_duration_ms does not exist') ||
    message.includes("Could not find the 'playback_duration_ms' column")
  );
}

export type InsertSnapMediaOptions = {
  mediaType?: 'image' | 'video';
  playbackDurationMs?: number | null;
};

function mapDatabaseError(error: unknown): DomainError {
  const message =
    typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Nieznany błąd bazy danych.';

  if (message.includes('Brak uprawnień') || message.includes('row-level security')) {
    return new DomainError('NOT_FRIEND', 'Możesz wysyłać wiadomości tylko do zaakceptowanych znajomych.');
  }

  if (message.includes('can_send_snap') || message.includes('Only viewed status')) {
    return new DomainError('INVALID_RECEIVER', 'Nieprawidłowy odbiorca wiadomości.');
  }

  if (message.includes('rate limit') || message.includes('too many')) {
    return new DomainError('RATE_LIMITED', 'Limit wysyłek został przekroczony. Spróbuj ponownie za chwilę.');
  }

  return new DomainError('UNKNOWN', message);
}

const ALLOWED_VIEW_DURATIONS = new Set([5, 15, 30, 60, 180]);

export async function insertSnap(
  receiverId: string,
  mediaPath: string,
  viewDurationSec = 5,
  mediaOptions?: InsertSnapMediaOptions
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
  };

  let payload: Record<string, unknown> = {
    ...minimalBase,
    view_duration_sec: duration,
    status: 'sent',
  };
  if (playbackMs !== null && mediaType === 'video') {
    payload.playback_duration_ms = playbackMs;
  }

  let { error } = await supabase.from('snaps').insert(payload);

  if (error && isMissingPlaybackDurationColumnError(error)) {
    const { playback_duration_ms: _pb, ...rest } = payload;
    payload = rest;
    ({ error } = await supabase.from('snaps').insert(payload));
  }

  if (error && isMissingViewDurationColumnError(error)) {
    const { view_duration_sec: _vd, ...rest } = payload;
    payload = rest;
    ({ error } = await supabase.from('snaps').insert(payload));
  }

  if (error && isMissingStatusColumnError(error)) {
    const { status: _st, ...rest } = payload;
    ({ error } = await supabase.from('snaps').insert(rest));
  }

  if (error) throw mapDatabaseError(error);
}

export async function fetchInboxSnaps() {
  const user = await getCurrentUser();
  if (!user) return [];

  const inboxSelectFull = `
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

  let { data, error } = await supabase
    .from('snaps')
    .select(inboxSelectFull)
    .eq('receiver_id', user.id)
    .order('created_at', { ascending: false });

  if (error && isMissingPlaybackDurationColumnError(error)) {
    const retry = await supabase
      .from('snaps')
      .select(inboxSelectNoPlayback)
      .eq('receiver_id', user.id)
      .order('created_at', { ascending: false });
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error && isMissingViewDurationColumnError(error)) {
    const retry = await supabase
      .from('snaps')
      .select(inboxSelectNoViewDuration)
      .eq('receiver_id', user.id)
      .order('created_at', { ascending: false });
    data = retry.data as typeof data;
    error = retry.error;
  }

  /** Stałe pole widoku — część schematów DB bez kolumny `view_duration_sec`. */
  let inboxRows: any[] | null = null;
  if (!error && Array.isArray(data)) {
    inboxRows = data.map((snap: Record<string, unknown>) => ({
      ...snap,
      media_type: typeof snap.media_type === 'string' ? snap.media_type : 'image',
      playback_duration_ms:
        typeof snap.playback_duration_ms === 'number' ? snap.playback_duration_ms : null,
      view_duration_sec: typeof snap.view_duration_sec === 'number' ? snap.view_duration_sec : 5,
    }));
  }
  if (error && isMissingStatusColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('snaps')
      .select(
        `
        id,
        sender_id,
        media_path,
        created_at,
        is_viewed
      `
      )
      .eq('receiver_id', user.id)
      .order('created_at', { ascending: false });
    if (fallbackError) throw mapDatabaseError(fallbackError);
    inboxRows = (fallbackData ?? []).map((snap: any) => ({
      ...snap,
      media_type: 'image',
      playback_duration_ms: null,
      status: snap.is_viewed ? 'viewed' : 'sent',
      view_duration_sec: typeof snap.view_duration_sec === 'number' ? snap.view_duration_sec : 5,
    }));
  } else if (error) {
    throw mapDatabaseError(error);
  }

  const senderIds = Array.from(new Set((inboxRows ?? []).map((snap) => snap.sender_id as string)));
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

  return ((inboxRows ?? []).map((snap: any) => ({
    ...snap,
    media_type: typeof snap.media_type === 'string' ? snap.media_type : 'image',
    playback_duration_ms:
      typeof snap.playback_duration_ms === 'number' ? snap.playback_duration_ms : null,
    view_duration_sec: typeof snap.view_duration_sec === 'number' ? snap.view_duration_sec : 5,
    sender: senderMap.get(snap.sender_id)
      ? {
          username: senderMap.get(snap.sender_id)!.username,
          avatar_storage_path: senderMap.get(snap.sender_id)!.avatar_storage_path ?? null,
          avatar_emoji: senderMap.get(snap.sender_id)!.avatar_emoji ?? null,
        }
      : null,
  })) ?? []) as InboxSnap[];
}

/** Nieobejrzane snapy od jednego nadawcy, od najstarszego (FIFO przy odtwarzaniu). */
export function filterUnreadInboxSnapsFromSender(snaps: InboxSnap[], senderId: string): InboxSnap[] {
  return snaps
    .filter((s) => s.sender_id === senderId && s.is_viewed !== true)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function fetchUnreadInboxQueueFromSender(senderId: string): Promise<InboxSnap[]> {
  const inbox = await fetchInboxSnaps();
  return filterUnreadInboxSnapsFromSender(inbox, senderId);
}

export async function fetchSentSnaps() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('snaps')
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
    .eq('sender_id', user.id)
    .order('created_at', { ascending: false });

  let sentRows = data;
  if (error && isMissingStatusColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('snaps')
      .select(
        `
        id,
        receiver_id,
        created_at,
        is_viewed,
        viewed_at
      `
      )
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false });
    if (fallbackError) throw mapDatabaseError(fallbackError);
    sentRows = (fallbackData ?? []).map((snap: any) => ({
      ...snap,
      status: snap.is_viewed ? 'viewed' : 'sent',
      cleaned_at: null,
    }));
  } else if (error) {
    throw mapDatabaseError(error);
  }

  const receiverIds = Array.from(new Set((sentRows ?? []).map((snap) => snap.receiver_id as string)));
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

  return ((sentRows ?? []).map((snap: any) => ({
    ...snap,
    receiver: receiverMap.get(snap.receiver_id)
      ? {
          username: receiverMap.get(snap.receiver_id)!.username,
          avatar_storage_path: receiverMap.get(snap.receiver_id)!.avatar_storage_path ?? null,
          avatar_emoji: receiverMap.get(snap.receiver_id)!.avatar_emoji ?? null,
        }
      : null,
  })) ?? []) as SentSnap[];
}

export async function createSignedSnapUrl(path: string, expiresInSec = 60) {
  const { data, error } = await supabase.storage
    .from('media-vault')
    .createSignedUrl(path, expiresInSec);

  if (error) throw error;
  return data.signedUrl;
}

export async function markSnapViewed(snapId: string) {
  const basePayload = { is_viewed: true, viewed_at: new Date().toISOString() };
  const { error } = await supabase
    .from('snaps')
    .update({ ...basePayload, status: 'viewed' })
    .eq('id', snapId);

  if (error && isMissingStatusColumnError(error)) {
    const { error: fallbackError } = await supabase.from('snaps').update(basePayload).eq('id', snapId);
    if (fallbackError) throw mapDatabaseError(fallbackError);
    return;
  }

  if (error) throw mapDatabaseError(error);
}

export async function requestSnapCleanup(snapId: string, mediaPath: string) {
  const { data, error } = await supabase.functions.invoke('cleanup-snap', {
    body: { snapId, mediaPath },
  });

  if (error) {
    throw new DomainError('CLEANUP_FAILED', 'Nie udało się wyczyścić wiadomości.');
  }

  if (data?.ok !== true) {
    throw new DomainError('CLEANUP_FAILED', 'Cleanup zwrócił nieoczekiwany rezultat.');
  }
}

export async function enqueueCleanupJob(snapId: string, mediaPath: string) {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await supabase.from('snap_cleanup_queue').upsert({
    snap_id: snapId,
    media_path: mediaPath,
    receiver_id: user.id,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('Nie udało się dodać zadania cleanup do kolejki', error);
  }
}

export async function markCleanupJobDone(snapId: string) {
  const { error } = await supabase.from('snap_cleanup_queue').delete().eq('snap_id', snapId);
  if (error) {
    console.warn('Nie udało się usunąć zadania cleanup z kolejki', error);
  }
}

export async function markCleanupJobFailed(snapId: string, reason: string) {
  const { error } = await supabase
    .from('snap_cleanup_queue')
    .update({
      last_error: reason,
      updated_at: new Date().toISOString(),
      attempt_count: 1,
      next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .eq('snap_id', snapId);

  if (error) {
    console.warn('Nie udało się zapisać błędu cleanup w kolejce', error);
  }
}

export async function flushCleanupQueue(limit = 10) {
  const user = await getCurrentUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('snap_cleanup_queue')
    .select('snap_id, media_path, receiver_id, attempt_count')
    .eq('receiver_id', user.id)
    .lte('next_attempt_at', new Date().toISOString())
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('Nie udało się odczytać kolejki cleanup', error);
    return;
  }

  for (const job of (data ?? []) as CleanupQueueRow[]) {
    try {
      await requestSnapCleanup(job.snap_id, job.media_path);
      await markCleanupJobDone(job.snap_id);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown cleanup failure';
      const { error: updateError } = await supabase
        .from('snap_cleanup_queue')
        .update({
          last_error: reason,
          attempt_count: job.attempt_count + 1,
          updated_at: new Date().toISOString(),
          next_attempt_at: new Date(Date.now() + Math.min(15 * 60_000, (job.attempt_count + 1) * 60_000)).toISOString(),
        })
        .eq('snap_id', job.snap_id);

      if (updateError) {
        console.warn('Nie udało się zaktualizować próby cleanup', updateError);
      }
    }
  }
}

export async function markSnapViewedWithCleanup(snapId: string, mediaPath: string) {
  await markSnapViewed(snapId);
  await enqueueCleanupJob(snapId, mediaPath);

  try {
    await requestSnapCleanup(snapId, mediaPath);
    await markCleanupJobDone(snapId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown cleanup error';
    await markCleanupJobFailed(snapId, reason);
    // Cleanup failure is non-critical — snap is already viewed and job is enqueued for retry.
    console.warn('Cleanup zostanie ponowiony:', reason);
  }
}
