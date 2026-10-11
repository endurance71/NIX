import { describe, expect, it, vi } from 'vitest';
import { formatPushActorLabel, pushCopy, reactionGlyph, retryAt } from './push';

describe('push Edge Function helpers', () => {
  it('formats actor label from display name with username fallback', () => {
    expect(formatPushActorLabel('Damian Motyliński', 'damian')).toBe('Damian Motyliński');
    expect(formatPushActorLabel('  Ada  ', 'ada')).toBe('Ada');
    expect(formatPushActorLabel(null, 'ania')).toBe('@ania');
    expect(formatPushActorLabel('', '@john')).toBe('@john');
    expect(formatPushActorLabel('   ', 'ania')).toBe('@ania');
    expect(formatPushActorLabel(null, null)).toBe('@nix_user');
  });

  it('localizes all transactional event types without exposing media data', () => {
    expect(pushCopy('new_nix', formatPushActorLabel(null, 'ania'), 'pl')).toEqual({
      title: '@ania',
      body: 'Wysyła Ci nowy NiX',
    });
    expect(pushCopy('friend_request', formatPushActorLabel(null, '@john'), 'en')).toEqual({
      title: '@john',
      body: 'Wants to add you as a friend',
    });
    expect(pushCopy('friend_accepted', formatPushActorLabel(null, 'ania'), 'pl')).toEqual({
      title: '@ania',
      body: 'Jesteście teraz znajomymi',
    });
    expect(pushCopy('message_reaction', formatPushActorLabel(null, 'ania'), 'pl', 'heart')).toEqual({
      title: '@ania',
      body: 'Reakcja na Twoją wiadomość: ❤️',
    });
    expect(pushCopy('message_reaction', formatPushActorLabel(null, 'ania'), 'en', 'hahaha')).toEqual({
      title: '@ania',
      body: 'Reacted to your message: 😂',
    });
    expect(pushCopy('capture_attempt', formatPushActorLabel(null, 'ania'), 'pl')).toEqual({
      title: '@ania',
      body: 'Próba zrobienia zrzutu lub nagrania ekranu',
    });
    expect(pushCopy('capture_attempt', formatPushActorLabel(null, 'ania'), 'en')).toEqual({
      title: '@ania',
      body: 'Tried to screenshot or record the screen',
    });
  });

  it('maps reaction emoji tokens to glyphs with a safe fallback', () => {
    expect(reactionGlyph('thumbsup')).toBe('👍');
    expect(reactionGlyph('unknown')).toBe('💬');
    expect(reactionGlyph(null)).toBe('💬');
  });

  it('uses display name as the push title when provided', () => {
    const label = formatPushActorLabel('Damian Motyliński', 'damian');
    expect(pushCopy('new_nix', label, 'pl')).toEqual({
      title: 'Damian Motyliński',
      body: 'Wysyła Ci nowy NiX',
    });
    expect(pushCopy('friend_request', label, 'en').title).toBe('Damian Motyliński');
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
