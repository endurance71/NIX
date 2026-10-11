import type { TextMessage } from '../types/database.types';

/**
 * Columns added by 20261012100000_text_message_saves and 20261012101000_voice_messages. All
 * optional: production backends without those migrations simply do not return them, and every
 * reader below treats a missing field as „plain, unsaved text”.
 */
export type ChatMessageExtras = {
  saved_at?: string | null;
  saved_by?: string | null;
  kind?: string | null;
  voice_path?: string | null;
  voice_duration_ms?: number | null;
  voice_waveform?: readonly number[] | null;
  /** `fetch_text_messages_with_peer` (20261013100000): media type of the NiX it replies to. */
  reply_to_nix_media_type?: string | null;
};

export type ChatTextMessage = TextMessage & ChatMessageExtras;

export type ChatSavedState = {
  saved: boolean;
  /** `me` / `peer` when known; `null` for an unsaved message. */
  savedBy: 'me' | 'peer' | null;
};

export function chatSavedState(message: ChatMessageExtras, currentUserId: string): ChatSavedState {
  if (!message.saved_at) return { saved: false, savedBy: null };
  return { saved: true, savedBy: message.saved_by === currentUserId ? 'me' : 'peer' };
}

/** Optimistic save toggle; the server answer (or the next refetch) replaces it. */
export function withSavedState<T extends ChatMessageExtras>(
  message: T,
  saved: boolean,
  currentUserId: string,
  nowIso: string,
): T {
  return saved
    ? { ...message, saved_at: message.saved_at ?? nowIso, saved_by: message.saved_by ?? currentUserId }
    : { ...message, saved_at: null, saved_by: null };
}

export type ChatVoiceInfo = {
  /** Storage object, or `null` for a local recording that is still uploading. */
  path: string | null;
  durationMs: number;
  waveform: readonly number[];
};

export function isVoiceMessage(message: ChatMessageExtras): boolean {
  return message.kind === 'voice';
}

function clampSample(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function chatVoiceInfo(message: ChatMessageExtras): ChatVoiceInfo | null {
  if (!isVoiceMessage(message)) return null;
  const durationMs =
    typeof message.voice_duration_ms === 'number' && Number.isFinite(message.voice_duration_ms)
      ? Math.max(0, message.voice_duration_ms)
      : 0;
  const waveform = Array.isArray(message.voice_waveform)
    ? message.voice_waveform.flatMap((sample) => {
        const clamped = clampSample(sample);
        return clamped === null ? [] : [clamped];
      })
    : [];
  return { path: message.voice_path ?? null, durationMs, waveform };
}

/** „0:12”, „1:00” — whole seconds, rounded like the server placeholder body. */
export function formatVoiceDuration(ms: number): string {
  const totalSeconds = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
