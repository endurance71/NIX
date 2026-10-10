import { describe, expect, it } from 'vitest';

import { isAuthEmailLinkPath, parseAuthConfirmLink } from './authDeepLink';

const HASH = 'pkce_0123456789abcdef0123456789abcdef';

describe('parseAuthConfirmLink', () => {
  it('accepts confirmation and recovery links from the app scheme and the web origin', () => {
    expect(parseAuthConfirmLink(`nix://auth/confirm?token_hash=${HASH}&type=recovery`)).toEqual({
      tokenHash: HASH,
      type: 'recovery',
    });
    expect(
      parseAuthConfirmLink(`https://nix.damianmotylinski.pl/auth/confirm/?token_hash=${HASH}&type=signup`)
    ).toEqual({ tokenHash: HASH, type: 'signup' });
  });

  it('never accepts session tokens from a URL', () => {
    expect(parseAuthConfirmLink('nix://auth/callback#access_token=a&refresh_token=b')).toBeNull();
    expect(parseAuthConfirmLink('nix://x#access_token=a&refresh_token=b&type=recovery')).toBeNull();
    expect(
      parseAuthConfirmLink(`nix://auth/confirm?token_hash=${HASH}&type=recovery&access_token=a`)
    ).toEqual({ tokenHash: HASH, type: 'recovery' });
  });

  it('rejects other hosts, paths and email flows', () => {
    expect(parseAuthConfirmLink(`https://evil.example/auth/confirm?token_hash=${HASH}&type=signup`)).toBeNull();
    expect(parseAuthConfirmLink(`nix://auth/callback?token_hash=${HASH}&type=signup`)).toBeNull();
    expect(parseAuthConfirmLink(`nix://auth/confirm?token_hash=${HASH}&type=magiclink`)).toBeNull();
    expect(parseAuthConfirmLink(`nix://auth/confirm?token_hash=${HASH}&type=email_change`)).toBeNull();
    expect(parseAuthConfirmLink('nix://auth/confirm?token_hash=short&type=signup')).toBeNull();
    expect(parseAuthConfirmLink('not a url')).toBeNull();
  });
});

describe('isAuthEmailLinkPath', () => {
  it('matches auth email links in every form the router may pass', () => {
    expect(isAuthEmailLinkPath('nix://auth/confirm?token_hash=x&type=signup')).toBe(true);
    expect(isAuthEmailLinkPath('https://nix.damianmotylinski.pl/auth/confirm?token_hash=x')).toBe(true);
    expect(isAuthEmailLinkPath('/auth/confirm?token_hash=x')).toBe(true);
    expect(isAuthEmailLinkPath('nix://inbox')).toBe(false);
    expect(isAuthEmailLinkPath('/invite/abc')).toBe(false);
  });
});
