import { describe, expect, it } from 'vitest';
import {
  buildFriendInviteTokenLink,
  buildProfileQrLink,
  extractFriendInvitePayload,
  extractProfileQrProfileId,
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

  it('zachowuje kompatybilność ze starym profileId payload', () => {
    const link = buildProfileQrLink('profile-1');

    expect(extractFriendInvitePayload(link)).toEqual({
      token: null,
      profileId: 'profile-1',
    });
    expect(extractProfileQrProfileId(link)).toBe('profile-1');
  });
});
