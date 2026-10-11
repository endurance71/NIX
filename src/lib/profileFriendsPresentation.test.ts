import { describe, expect, it } from 'vitest';
import {
  beginBusyKey,
  endBusyKey,
  friendActionKey,
  getPendingInviteCount,
  isFriendRowBusy,
  isIncomingRequestBusy,
  isOutgoingRequestBusy,
} from './profileFriendsPresentation';

describe('profile friends presentation helpers', () => {
  it('combines incoming and outgoing invites without producing a negative badge', () => {
    expect(getPendingInviteCount(2, 3)).toBe(5);
    expect(getPendingInviteCount(-1, 2)).toBe(2);
  });

  it('tracks busy rows independently, so parallel actions keep their own spinners', () => {
    let busy: ReadonlySet<string> = new Set();
    busy = beginBusyKey(busy, friendActionKey.outgoing('request-1'))!;
    busy = beginBusyKey(busy, friendActionKey.friend('friend-1'))!;
    busy = beginBusyKey(busy, friendActionKey.incoming('request-2'))!;

    expect(isOutgoingRequestBusy(busy, 'request-1')).toBe(true);
    expect(isOutgoingRequestBusy(busy, 'request-2')).toBe(false);
    expect(isFriendRowBusy(busy, 'friend-1')).toBe(true);
    expect(isIncomingRequestBusy(busy, 'request-2')).toBe(true);

    busy = endBusyKey(busy, friendActionKey.friend('friend-1'));
    expect(isFriendRowBusy(busy, 'friend-1')).toBe(false);
    expect(isOutgoingRequestBusy(busy, 'request-1')).toBe(true);
  });

  it('refuses a second start of the same action', () => {
    const busy = new Set([friendActionKey.invite]);
    expect(beginBusyKey(busy, friendActionKey.invite)).toBeNull();
  });
});
