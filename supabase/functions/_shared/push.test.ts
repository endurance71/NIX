import { describe, expect, it, vi } from 'vitest';
import { pushCopy, retryAt } from './push';

describe('push Edge Function helpers', () => {
  it('localizes all transactional event types without exposing media data', () => {
    expect(pushCopy('new_nix', 'ania', 'pl')).toEqual({
      title: 'NiX',
      body: '@ania wysyła Ci nowy NiX',
    });
    expect(pushCopy('friend_request', '@john', 'en')).toEqual({
      title: 'New friend request',
      body: '@john wants to add you as a friend',
    });
    expect(pushCopy('friend_accepted', 'ania', 'pl').body).toBe(
      'Ty i @ania jesteście teraz znajomymi'
    );
  });

  it('uses capped exponential retry delays', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    expect(retryAt(1)).toBe('2026-07-15T12:01:00.000Z');
    expect(retryAt(3)).toBe('2026-07-15T12:04:00.000Z');
    expect(retryAt(20)).toBe('2026-07-15T13:00:00.000Z');
    vi.useRealTimers();
  });
});
