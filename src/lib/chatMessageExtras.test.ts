import { describe, expect, it } from 'vitest';
import { chatSavedState, chatVoiceInfo, formatVoiceDuration, withSavedState } from './chatMessageExtras';

describe('chatSavedState', () => {
  it('reads who saved a message; missing columns mean unsaved', () => {
    expect(chatSavedState({}, 'me')).toEqual({ saved: false, savedBy: null });
    expect(chatSavedState({ saved_at: '2026-10-12T10:00:00Z', saved_by: 'me' }, 'me')).toEqual({ saved: true, savedBy: 'me' });
    expect(chatSavedState({ saved_at: '2026-10-12T10:00:00Z', saved_by: 'peer' }, 'me')).toEqual({ saved: true, savedBy: 'peer' });
  });
  it('optimistic toggle keeps an existing saver and clears on unsave', () => {
    const saved = withSavedState({ saved_at: null, saved_by: null }, true, 'me', 'now');
    expect(saved).toEqual({ saved_at: 'now', saved_by: 'me' });
    expect(withSavedState({ saved_at: 'then', saved_by: 'peer' }, true, 'me', 'now')).toEqual({ saved_at: 'then', saved_by: 'peer' });
    expect(withSavedState(saved, false, 'me', 'now')).toEqual({ saved_at: null, saved_by: null });
  });
});

describe('chatVoiceInfo', () => {
  it('is null for text and older rows', () => {
    expect(chatVoiceInfo({})).toBeNull();
    expect(chatVoiceInfo({ kind: 'text' })).toBeNull();
  });
  it('sanitizes the stored samples', () => {
    expect(chatVoiceInfo({ kind: 'voice', voice_path: 'a/b/c.m4a', voice_duration_ms: 12_400, voice_waveform: [10, 150, -1] })).toEqual({
      path: 'a/b/c.m4a',
      durationMs: 12_400,
      waveform: [10, 100, 0],
    });
    expect(chatVoiceInfo({ kind: 'voice' })).toEqual({ path: null, durationMs: 0, waveform: [] });
  });
});

describe('formatVoiceDuration', () => {
  it('formats m:ss like the server placeholder', () => {
    expect(formatVoiceDuration(12_400)).toBe('0:12');
    expect(formatVoiceDuration(60_000)).toBe('1:00');
    expect(formatVoiceDuration(-5)).toBe('0:00');
  });
});
