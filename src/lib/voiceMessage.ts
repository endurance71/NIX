/**
 * Pure helpers for chat voice messages: recording limits, the hold-to-record / slide-to-cancel
 * decision, metering → waveform samples and resampling them into bubble bars.
 */

/** Hard limit of one voice message (the recorder stops itself here). */
export const VOICE_MAX_DURATION_MS = 60_000;
/** Shorter than this is an accidental tap, not a message. */
export const VOICE_MIN_DURATION_MS = 700;
/** Samples stored with the message (the server accepts at most 64). */
export const VOICE_WAVEFORM_SAMPLES = 48;
/** Metering poll while recording. */
export const VOICE_METERING_INTERVAL_MS = 100;

/**
 * iOS metering is average power in dBFS (-160…0). Speech sits roughly in -50…0; below that is
 * room noise. The square root lifts quiet syllables so the bars do not look empty.
 */
export function meteringToLevel(db: number | null | undefined): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
  const linear = Math.min(1, Math.max(0, (db + 50) / 50));
  return Math.round(Math.sqrt(linear) * 100);
}

/** Averages raw levels into at most `count` buckets (fewer samples are kept as they are). */
export function downsampleWaveform(levels: readonly number[], count = VOICE_WAVEFORM_SAMPLES): number[] {
  const clean = levels.map((level) => (Number.isFinite(level) ? Math.min(100, Math.max(0, level)) : 0));
  if (count <= 0 || clean.length === 0) return [];
  if (clean.length <= count) return clean.map((level) => Math.round(level));
  const result: number[] = [];
  for (let bucket = 0; bucket < count; bucket += 1) {
    const start = Math.floor((bucket * clean.length) / count);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * clean.length) / count));
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += clean[index];
    result.push(Math.round(sum / (end - start)));
  }
  return result;
}

/** Minimum bar height (0–1) so silence still draws a visible dot-like bar. */
export const VOICE_BAR_FLOOR = 0.12;

/**
 * Bar heights (0–1) for a bubble with `barCount` bars. Linear resampling of the stored samples;
 * no samples (older message, metering unavailable) gives a flat, quiet line.
 */
export function waveformBars(samples: readonly number[], barCount: number): number[] {
  if (barCount <= 0) return [];
  if (samples.length === 0) return Array.from({ length: barCount }, () => VOICE_BAR_FLOOR);
  const bars: number[] = [];
  for (let bar = 0; bar < barCount; bar += 1) {
    const position = barCount === 1 ? 0 : (bar * (samples.length - 1)) / (barCount - 1);
    const lower = Math.floor(position);
    const upper = Math.min(samples.length - 1, lower + 1);
    const fraction = position - lower;
    const value = samples[lower] * (1 - fraction) + samples[upper] * fraction;
    bars.push(Math.max(VOICE_BAR_FLOOR, Math.min(1, value / 100)));
  }
  return bars;
}

export type VoiceRecordingOutcome = 'send' | 'cancel' | 'tooShort';

/** What releasing the mic means. */
export function voiceRecordingOutcome(params: {
  durationMs: number;
  cancelled: boolean;
}): VoiceRecordingOutcome {
  if (params.cancelled) return 'cancel';
  if (!Number.isFinite(params.durationMs) || params.durationMs < VOICE_MIN_DURATION_MS) return 'tooShort';
  return 'send';
}

/** Storage object for a new voice message: `<sender>/<receiver>/<uuid>.m4a` (lowercase). */
export function voiceObjectPath(senderId: string, receiverId: string, objectId: string): string {
  return `${senderId.toLowerCase()}/${receiverId.toLowerCase()}/${objectId.toLowerCase()}.m4a`;
}

/** Playback progress (0–1) for the bubble; tolerant of a missing or zero duration. */
export function voicePlaybackProgress(currentTimeSec: number, durationMs: number): number {
  if (!Number.isFinite(currentTimeSec) || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, (currentTimeSec * 1000) / durationMs));
}
