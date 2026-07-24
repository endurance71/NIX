import { describe, expect, it } from 'vitest';
import { parsePushNotificationData, routeForPushNotification } from './pushNotificationPayload';

describe('push notification payload', () => {
  const base = {
    version: 1,
    entityId: '11111111-1111-1111-1111-111111111111',
    actorId: '22222222-2222-2222-2222-222222222222',
  } as const;

  it.each([
    'new_nix',
    'friend_request',
    'friend_accepted',
    'new_text_message',
    'message_reaction',
  ] as const)('accepts the supported %s payload', (type) => {
    expect(parsePushNotificationData({ ...base, type })).toEqual({ ...base, type });
  });

  it('rejects unknown or incomplete payloads', () => {
    expect(parsePushNotificationData({ ...base, type: 'marketing' })).toBeNull();
    expect(parsePushNotificationData({ ...base, version: 2, type: 'new_nix' })).toBeNull();
    expect(parsePushNotificationData({ version: 1, type: 'new_nix' })).toBeNull();
  });

  it('routes content and requests to inbox, and acceptance to friends', () => {
    expect(routeForPushNotification({ ...base, type: 'new_nix' })).toBe('/(tabs)/inbox');
    expect(routeForPushNotification({ ...base, type: 'friend_request' })).toBe('/(tabs)/inbox');
    expect(routeForPushNotification({ ...base, type: 'friend_accepted' })).toBe('/(tabs)/profile/friends');
    expect(routeForPushNotification({ ...base, type: 'new_text_message' })).toEqual({
      pathname: '/chat/[peerId]',
      params: { peerId: '22222222-2222-2222-2222-222222222222' },
    });
    expect(routeForPushNotification({ ...base, type: 'message_reaction' })).toEqual({
      pathname: '/chat/[peerId]',
      params: { peerId: '22222222-2222-2222-2222-222222222222' },
    });
  });
});
