import { File } from 'expo-file-system';
import { supabase } from '../lib/supabase';
import { voiceObjectPath } from '../lib/voiceMessage';
import type { ChatTextMessage } from '../lib/chatMessageExtras';
import { DomainError } from './errors';

export const VOICE_MESSAGES_BUCKET = 'voice-messages';
const VOICE_CONTENT_TYPE = 'audio/mp4';
/** Signed playback URLs live briefly; the cache refreshes them a minute before they lapse. */
const SIGNED_URL_TTL_SEC = 10 * 60;
const SIGNED_URL_REFRESH_MARGIN_MS = 60_000;
/** Matches the bucket's file_size_limit. */
const MAX_VOICE_BYTES = 2 * 1024 * 1024;

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const hex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

function errorText(error: { message?: string; code?: string } | null | undefined): string {
  return `${error?.code ?? ''} ${error?.message ?? ''}`;
}

/** Uploads the recorded file into the sender's folder; returns the object path. */
export async function uploadVoiceRecording(params: {
  senderId: string;
  receiverId: string;
  fileUri: string;
}): Promise<string> {
  const path = voiceObjectPath(params.senderId, params.receiverId, randomId());
  let bytes: ArrayBuffer;
  try {
    bytes = await new File(params.fileUri).arrayBuffer();
  } catch {
    throw new DomainError('INVALID_MEDIA', 'Nie udało się odczytać nagrania.');
  }
  if (bytes.byteLength === 0) throw new DomainError('INVALID_MEDIA', 'Nagranie jest puste.');
  if (bytes.byteLength > MAX_VOICE_BYTES) {
    throw new DomainError('MEDIA_TOO_LARGE', 'Nagranie jest za duże.');
  }
  const { error } = await supabase.storage
    .from(VOICE_MESSAGES_BUCKET)
    .upload(path, bytes, { contentType: VOICE_CONTENT_TYPE, upsert: false });
  if (error) {
    const text = errorText(error as { message?: string });
    if (text.includes('row-level security') || text.includes('403')) {
      throw new DomainError('NOT_FRIEND', 'Nie możesz wysłać wiadomości do tego użytkownika.');
    }
    throw new DomainError('UNKNOWN', error.message || 'Nie udało się wysłać nagrania.');
  }
  return path;
}

export async function sendVoiceMessage(params: {
  receiverId: string;
  path: string;
  durationMs: number;
  waveform: readonly number[];
  clientMessageId: string;
}): Promise<ChatTextMessage> {
  const { data, error } = await supabase.rpc('send_voice_message', {
    p_receiver_id: params.receiverId,
    p_voice_path: params.path,
    p_duration_ms: Math.round(params.durationMs),
    p_waveform: params.waveform.length > 0 ? params.waveform.map((sample) => Math.round(sample)) : undefined,
    p_client_message_id: params.clientMessageId,
  });
  if (error) {
    const text = errorText(error);
    if (text.includes('NOT_FRIEND')) {
      throw new DomainError('NOT_FRIEND', 'Nie możesz wysłać wiadomości do tego użytkownika.');
    }
    if (text.includes('UNAUTHORIZED')) throw new DomainError('UNAUTHORIZED', 'Wymagane logowanie.');
    throw new DomainError('UNKNOWN', error.message || 'Nie udało się wysłać nagrania.');
  }
  if (!data || typeof data !== 'object') {
    throw new DomainError('UNKNOWN', 'Nie udało się wysłać nagrania.');
  }
  return data as unknown as ChatTextMessage;
}

/** Best effort: an upload whose message could not be created (the cron sweeps leftovers). */
export async function discardVoiceUpload(path: string): Promise<void> {
  await supabase.storage
    .from(VOICE_MESSAGES_BUCKET)
    .remove([path])
    .catch(() => undefined);
}

/** Best effort: the local recording once it is delivered or discarded. */
export function deleteLocalRecording(fileUri: string | null | undefined): void {
  if (!fileUri) return;
  try {
    const file = new File(fileUri);
    if (file.exists) file.delete();
  } catch {
    // A leftover file in the cache directory is harmless; iOS purges it.
  }
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Short-lived signed URL for playback (RLS: only the two participants of a live message). */
export async function getVoicePlaybackUrl(path: string): Promise<string> {
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt - SIGNED_URL_REFRESH_MARGIN_MS > Date.now()) return cached.url;
  const { data, error } = await supabase.storage
    .from(VOICE_MESSAGES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    signedUrlCache.delete(path);
    throw new DomainError('NOT_FOUND', 'Nagranie jest niedostępne.');
  }
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SEC * 1000 });
  return data.signedUrl;
}
