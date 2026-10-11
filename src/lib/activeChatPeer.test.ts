import { beforeEach, describe, expect, it } from 'vitest';
import { activeChatPeerRef, claimActiveChatPeer } from './activeChatPeer';

describe('claimActiveChatPeer', () => {
  beforeEach(() => {
    activeChatPeerRef.current = null;
  });

  it('marks the focused chat and clears it on blur', () => {
    const release = claimActiveChatPeer('a');
    expect(activeChatPeerRef.current).toBe('a');
    release();
    expect(activeChatPeerRef.current).toBeNull();
  });

  it("does not clear another chat's claim (A → B, A's late blur)", () => {
    const releaseA = claimActiveChatPeer('a');
    const releaseB = claimActiveChatPeer('b');
    releaseA();
    expect(activeChatPeerRef.current).toBe('b');
    releaseB();
    expect(activeChatPeerRef.current).toBeNull();
  });
});
