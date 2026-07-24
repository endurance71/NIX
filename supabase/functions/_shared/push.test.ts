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
      title: 'NiX',
      body: '@ania wysyła Ci nowy NiX',
    });
    expect(pushCopy('friend_request', formatPushActorLabel(null, '@john'), 'en')).toEqual({
      title: 'New friend request',
      body: '@john wants to add you as a friend',
    });
    expect(pushCopy('friend_accepted', formatPushActorLabel(null, 'ania'), 'pl').body).toBe(
      'Ty i @ania jesteście teraz znajomymi'
    );
    expect(pushCopy('message_reaction', formatPushActorLabel(null, 'ania'), 'pl', 'heart')).toEqual({
      title: 'Wiadomość',
      body: '@ania zareagował(a): ❤️',
    });
    expect(pushCopy('message_reaction', formatPushActorLabel(null, 'ania'), 'en', 'hahaha')).toEqual({
      title: 'Message',
      body: '@ania reacted: 😂',
    });
  });

  it('maps reaction emoji tokens to glyphs with a safe fallback', () => {
    expect(reactionGlyph('thumbsup')).toBe('👍');
    expect(reactionGlyph('unknown')).toBe('💬');
    expect(reactionGlyph(null)).toBe('💬');
  });

  it('uses display name in localized copy when provided', () => {
    const label = formatPushActorLabel('Damian Motyliński', 'damian');
    expect(pushCopy('new_nix', label, 'pl').body).toBe('Damian Motyliński wysyła Ci nowy NiX');
    expect(pushCopy('friend_request', label, 'en').body).toBe(
      'Damian Motyliński wants to add you as a friend'
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
