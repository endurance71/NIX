import { describe, expect, it } from 'vitest';

import { isInboxDeepLink } from './deepLinkRoute';

describe('isInboxDeepLink', () => {
  it('recognizes only the private Inbox route', () => {
    expect(isInboxDeepLink('nix://inbox')).toBe(true);
    expect(isInboxDeepLink('nix://inbox?source=live-activity')).toBe(true);
    expect(isInboxDeepLink('nix://uploads')).toBe(false);
    expect(isInboxDeepLink('https://example.com/inbox')).toBe(false);
    expect(isInboxDeepLink('not a url')).toBe(false);
  });
});
