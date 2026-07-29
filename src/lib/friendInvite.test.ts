import { describe, expect, it } from 'vitest';
import {
  buildFriendInviteTokenLink,
  buildFriendInviteShareLink,
  extractFriendInvitePayload,
} from './friendInvite';

describe('friendInvite QR payloads', () => {
  it('buduje i parsuje tokenowy link zaproszenia', () => {
    const link = buildFriendInviteTokenLink('token-123');

    expect(link).toBe('nix://friend-invite?token=token-123');
    expect(extractFriendInvitePayload(link)).toEqual({
      token: 'token-123',
      profileId: null,
    });
  });

  it('buduje i parsuje Universal Link', () => {
    const link = buildFriendInviteShareLink('share-token');
    expect(link).toBe('https://nix.damianmotylinski.pl/invite/share-token');
    expect(extractFriendInvitePayload(link)).toEqual({
      token: 'share-token',
      profileId: null,
    });
  });

  it('zachowuje kompatybilność ze starym profileId payload', () => {
    const link = 'nix://friend-invite?profileId=profile-1';

    expect(extractFriendInvitePayload(link)).toEqual({
      token: null,
      profileId: 'profile-1',
    });
  });
});
