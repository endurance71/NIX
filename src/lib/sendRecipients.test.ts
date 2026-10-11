import { describe, expect, it } from 'vitest';
import {
  buildRecipientSections,
  collectInboxRecentActivity,
  filterRecipients,
  recentRecipientIds,
  recipientDisplayName,
  summarizeRecipientNames,
} from './sendRecipients';

const anna = { id: 'a', username: 'anna', display_name: 'Anna Łącka' };
const bartek = { id: 'b', username: 'bartek', display_name: null };
const celina = { id: 'c', username: 'celina', display_name: 'Celina' };
const profiles = [anna, bartek, celina];

describe('recipientDisplayName', () => {
  it('prefers the display name, then @username, then the fallback', () => {
    expect(recipientDisplayName(anna, '?')).toBe('Anna Łącka');
    expect(recipientDisplayName(bartek, '?')).toBe('@bartek');
    expect(recipientDisplayName({ id: 'x', username: '', display_name: '  ' }, '?')).toBe('?');
  });
});

describe('filterRecipients', () => {
  it('returns the same array for an empty query', () => {
    expect(filterRecipients(profiles, '  ')).toBe(profiles);
  });

  it('matches display names without diacritics and usernames with a leading @', () => {
    expect(filterRecipients(profiles, 'lacka').map((p) => p.id)).toEqual(['a']);
    expect(filterRecipients(profiles, '@BART').map((p) => p.id)).toEqual(['b']);
    expect(filterRecipients(profiles, 'zzz')).toEqual([]);
  });
});

describe('recentRecipientIds', () => {
  const activity = collectInboxRecentActivity({
    sentData: [{ receiver_id: 'b', created_at: '2026-10-09T10:00:00Z' }],
    inboxData: [
      { sender_id: 'c', created_at: '2026-10-10T08:00:00Z' },
      { sender_id: 'stranger', created_at: '2026-10-10T09:00:00Z' },
    ],
    textMessagesData: [
      { peer_id: 'b', created_at: '2026-10-10T07:00:00Z' },
      { peer_id: 'a', created_at: 'not a date' },
    ],
  });

  it('orders accepted peers by their latest activity and drops strangers', () => {
    expect(recentRecipientIds(activity, ['a', 'b', 'c'])).toEqual(['c', 'b']);
  });

  it('respects the limit', () => {
    expect(recentRecipientIds(activity, ['a', 'b', 'c'], 1)).toEqual(['c']);
    expect(recentRecipientIds(activity, ['a', 'b', 'c'], 0)).toEqual([]);
  });

  it('handles a missing bundle', () => {
    expect(collectInboxRecentActivity(undefined)).toEqual([]);
  });
});

describe('buildRecipientSections', () => {
  it('lifts recent recipients above the rest without duplicating them', () => {
    const sections = buildRecipientSections({ profiles, recentIds: ['c', 'gone'], query: '' });
    expect(sections.recent.map((p) => p.id)).toEqual(['c']);
    expect(sections.others.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('shows one flat filtered list while searching', () => {
    const sections = buildRecipientSections({
      profiles,
      bestFriendIds: ['a'],
      recentIds: ['c'],
      query: 'cel',
    });
    expect(sections.best).toEqual([]);
    expect(sections.recent).toEqual([]);
    expect(sections.others.map((p) => p.id)).toEqual(['c']);
  });

  it('puts best friends first and never repeats them under recent', () => {
    const sections = buildRecipientSections({
      profiles,
      bestFriendIds: ['b', 'gone', 'a'],
      recentIds: ['a', 'c'],
      query: '',
    });
    expect(sections.best.map((p) => p.id)).toEqual(['b', 'a']);
    expect(sections.recent.map((p) => p.id)).toEqual(['c']);
    expect(sections.others).toEqual([]);
  });

  it('has no best-friends section without streak data', () => {
    const sections = buildRecipientSections({ profiles, recentIds: ['c'], query: '' });
    expect(sections.best).toEqual([]);
    expect(sections.recent.map((p) => p.id)).toEqual(['c']);
  });
});

describe('summarizeRecipientNames', () => {
  it('names the first two and counts the rest', () => {
    expect(summarizeRecipientNames([])).toBeNull();
    expect(summarizeRecipientNames(['Anna'])).toEqual({ names: 'Anna', extra: 0 });
    expect(summarizeRecipientNames(['Anna', 'Bartek', 'Celina', 'Dawid'])).toEqual({
      names: 'Anna, Bartek',
      extra: 2,
    });
  });
});
