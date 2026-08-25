import { describe, expect, it } from 'vitest';
import {
  describeOfflineCacheQuery,
  sanitizeOfflineQueryData,
} from './offlineCachePolicy';

describe('offline cache policy', () => {
  it('allows only explicit account presentation queries', () => {
    expect(describeOfflineCacheQuery(['currentUserProfile', 'user-a'])?.category).toBe('profile');
    expect(describeOfflineCacheQuery(['textMessagesWithPeer', 'peer-a'])).toEqual({
      category: 'chat', scopeId: 'peer-a',
    });
    expect(describeOfflineCacheQuery(['avatarSignedUrls', ['path']])).toBeNull();
    expect(describeOfflineCacheQuery(['unknown', 'access-token'])).toBeNull();
  });

  it('removes embedded media and expired text while keeping the newest 50 messages', () => {
    const now = Date.parse('2026-08-25T10:00:00.000Z');
    const messages = Array.from({ length: 52 }, (_, index) => ({
      id: `message-${index}`,
      body: `body-${index}`,
      created_at: new Date(now - (52 - index) * 1_000).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
      thumbnail_b64: 'not-persisted',
    }));
    messages.push({
      id: 'expired', body: 'expired', created_at: new Date(now - 100).toISOString(),
      expires_at: new Date(now - 1).toISOString(), thumbnail_b64: 'not-persisted',
    });

    const sanitized = sanitizeOfflineQueryData(['textMessagesWithPeer', 'peer-a'], messages, now) as typeof messages;
    expect(sanitized).toHaveLength(50);
    expect(sanitized[0].id).toBe('message-2');
    expect(JSON.stringify(sanitized)).not.toContain('thumbnail_b64');
    expect(JSON.stringify(sanitized)).not.toContain('expired');
  });

  it('strips embedded thumbnails from inbox metadata', () => {
    const result = sanitizeOfflineQueryData(['inboxNixesBundle'], {
      inboxData: [{ id: 'nix', media_path: 'metadata/path', thumbnail_b64: 'image-data' }],
      sentData: [], textMessagesData: [], unreadCount: 1,
    });
    expect(result).toMatchObject({ inboxData: [{ id: 'nix', media_path: 'metadata/path' }] });
    expect(JSON.stringify(result)).not.toContain('image-data');
  });
});
