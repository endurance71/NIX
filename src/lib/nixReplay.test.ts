import { describe, expect, it } from 'vitest';
import { isNixFirstOpenAvailable, isNixReplayAvailable } from './nixReplay';

const base = {
  direction: 'received' as const,
  media_path: 'nixes/user/a.jpg',
  status: 'viewed' as const,
  is_viewed: true,
  is_replayed: false,
  replay_expires_at: '2026-07-26T12:10:00.000Z',
};

describe('isNixReplayAvailable', () => {
  it('pozwala na replay w oknie TTL', () => {
    expect(isNixReplayAvailable(base, new Date('2026-07-26T12:05:00.000Z'))).toBe(true);
  });

  it('blokuje po wygaśnięciu TTL', () => {
    expect(isNixReplayAvailable(base, new Date('2026-07-26T12:10:00.000Z'))).toBe(false);
    expect(isNixReplayAvailable(base, new Date('2026-07-26T12:11:00.000Z'))).toBe(false);
  });

  it('blokuje bez replay_expires_at', () => {
    expect(isNixReplayAvailable({ ...base, replay_expires_at: null })).toBe(false);
  });

  it('blokuje po zużytym replay', () => {
    expect(isNixReplayAvailable({ ...base, is_replayed: true })).toBe(false);
  });

  it('blokuje cleaned / cleanup_failed / brak media', () => {
    expect(isNixReplayAvailable({ ...base, status: 'cleaned' })).toBe(false);
    expect(isNixReplayAvailable({ ...base, status: 'cleanup_failed' })).toBe(false);
    expect(isNixReplayAvailable({ ...base, media_path: null })).toBe(false);
  });

  it('blokuje wiadomości wysłane i nieprzeczytane', () => {
    expect(isNixReplayAvailable({ ...base, direction: 'sent' })).toBe(false);
    expect(isNixReplayAvailable({ ...base, is_viewed: false, status: 'sent' })).toBe(false);
  });
});

describe('isNixFirstOpenAvailable', () => {
  it('pozwala na pierwsze otwarcie nieprzeczytanego', () => {
    expect(
      isNixFirstOpenAvailable({
        ...base,
        is_viewed: false,
        status: 'sent',
        replay_expires_at: null,
      })
    ).toBe(true);
  });

  it('blokuje po odczytaniu', () => {
    expect(isNixFirstOpenAvailable(base)).toBe(false);
  });
});
