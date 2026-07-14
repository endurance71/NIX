import { describe, expect, it } from 'vitest';
import {
  getPendingInviteCount,
  isFriendRowBusy,
  isOutgoingRequestBusy,
} from './profileFriendsPresentation';

describe('profile friends presentation helpers', () => {
  it('combines incoming and outgoing invites without producing a negative badge', () => {
    expect(getPendingInviteCount(2, 3)).toBe(5);
    expect(getPendingInviteCount(-1, 2)).toBe(2);
  });

  it('recognizes the active outgoing request only', () => {
    expect(isOutgoingRequestBusy('outgoing-request-1', 'request-1')).toBe(true);
    expect(isOutgoingRequestBusy('outgoing-request-2', 'request-1')).toBe(false);
    expect(isOutgoingRequestBusy(null, 'request-1')).toBe(false);
  });

  it('treats capture updates and removal as a busy friend row', () => {
    expect(isFriendRowBusy('capture-friend-1', 'friend-1')).toBe(true);
    expect(isFriendRowBusy('friend-friend-1', 'friend-1')).toBe(true);
    expect(isFriendRowBusy('capture-friend-2', 'friend-1')).toBe(false);
  });
});
