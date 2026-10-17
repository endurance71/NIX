import { describe, expect, it } from 'vitest';
import {
  buildFriendInviteTokenLink,
  buildFriendInviteShareLink,
  extractFriendInvitePayload,
  isFriendInviteLinkPath,
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
    expect(link).toBe('https://nix.shipapp.pl/invite/share-token');
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

describe('isFriendInviteLinkPath', () => {
  it('matches invite links in every form the router may pass', () => {
    expect(isFriendInviteLinkPath('nix://friend-invite?token=abc')).toBe(true);
    expect(isFriendInviteLinkPath('https://nix.shipapp.pl/invite/abc')).toBe(true);
    expect(isFriendInviteLinkPath('https://nix.damianmotylinski.pl/invite/abc')).toBe(true);
    expect(isFriendInviteLinkPath('/invite/abc')).toBe(true);
    expect(isFriendInviteLinkPath('/friend-invite?token=abc')).toBe(true);
    expect(isFriendInviteLinkPath('friend-invite?profileId=p1')).toBe(true);
  });

  it('leaves other routes and empty invites to the router', () => {
    expect(isFriendInviteLinkPath('nix://inbox')).toBe(false);
    expect(isFriendInviteLinkPath('/inbox')).toBe(false);
    expect(isFriendInviteLinkPath('/chat/abc')).toBe(false);
    expect(isFriendInviteLinkPath('nix://friend-invite')).toBe(false);
    expect(isFriendInviteLinkPath('https://example.com/invite/abc')).toBe(false);
  });
});
