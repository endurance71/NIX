import { describe, expect, it } from 'vitest';
import {
  PASSKEY_RP_ID,
  isPasskeyFeatureEnabled,
  passkeyErrorKey,
  toAuthenticationResponseJSON,
  toNativeAssertionOptions,
  toNativeRegistrationOptions,
  toRegistrationResponseJSON,
} from './passkeys';

describe('passkey feature flag', () => {
  it('is off unless explicitly enabled', () => {
    expect(isPasskeyFeatureEnabled(undefined)).toBe(false);
    expect(isPasskeyFeatureEnabled('1')).toBe(false);
    expect(isPasskeyFeatureEnabled('true')).toBe(true);
  });
});

describe('toNativeAssertionOptions', () => {
  it('maps server request options and defaults the relying party', () => {
    expect(toNativeAssertionOptions({
      challenge: 'Y2hhbGxlbmdl',
      allowCredentials: [{ id: 'Y3JlZA', type: 'public-key' }],
      userVerification: 'required',
    })).toEqual({
      rpId: PASSKEY_RP_ID,
      challenge: 'Y2hhbGxlbmdl',
      allowCredentialIds: ['Y3JlZA'],
      userVerification: 'required',
    });
  });

  it('keeps the server rpId and rejects a missing challenge', () => {
    expect(toNativeAssertionOptions({ challenge: 'YQ', rpId: 'example.com' }).rpId).toBe('example.com');
    expect(() => toNativeAssertionOptions({ challenge: '' })).toThrow();
  });
});

describe('toNativeRegistrationOptions', () => {
  const options = {
    rp: { id: PASSKEY_RP_ID, name: 'NiX' },
    user: { id: 'dXNlcg', name: 'ania@example.com', displayName: 'Ania' },
    challenge: 'Y2g',
    pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
    excludeCredentials: [{ id: 'b2xk', type: 'public-key' as const }],
    authenticatorSelection: { userVerification: 'preferred' as const },
  };

  it('maps creation options', () => {
    expect(toNativeRegistrationOptions(options)).toEqual({
      rpId: PASSKEY_RP_ID,
      challenge: 'Y2g',
      userId: 'dXNlcg',
      userName: 'ania@example.com',
      excludeCredentialIds: ['b2xk'],
      userVerification: 'preferred',
    });
  });

  it('requires a user handle', () => {
    expect(() => toNativeRegistrationOptions({ ...options, user: { ...options.user, id: '' } })).toThrow();
  });
});

describe('W3C JSON responses', () => {
  it('builds an authentication response', () => {
    const json = toAuthenticationResponseJSON({
      credentialId: 'aWQ',
      clientDataJSON: 'Y2Q',
      authenticatorData: 'YWQ',
      signature: 'c2ln',
      userHandle: 'dWg',
    });
    expect(json).toEqual({
      id: 'aWQ',
      rawId: 'aWQ',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: { clientDataJSON: 'Y2Q', authenticatorData: 'YWQ', signature: 'c2ln', userHandle: 'dWg' },
    });
    expect('userHandle' in toAuthenticationResponseJSON({
      credentialId: 'aWQ', clientDataJSON: 'Y2Q', authenticatorData: 'YWQ', signature: 'c2ln',
    }).response).toBe(false);
  });

  it('builds a registration response', () => {
    const json = toRegistrationResponseJSON({ credentialId: 'aWQ', clientDataJSON: 'Y2Q', attestationObject: 'YW8' });
    expect(json.response).toEqual({ clientDataJSON: 'Y2Q', attestationObject: 'YW8', transports: ['internal', 'hybrid'] });
    expect(json.rawId).toBe('aWQ');
  });
});

describe('passkeyErrorKey', () => {
  it('is silent when the user closes the system sheet', () => {
    expect(passkeyErrorKey({ code: 'ERR_PASSKEY_CANCELLED' })).toBeNull();
  });

  it('maps native, server and unknown failures', () => {
    expect(passkeyErrorKey({ code: 'ERR_PASSKEY_UNAVAILABLE' })).toBe('auth.passkeyUnavailable');
    expect(passkeyErrorKey({ code: 'webauthn_challenge_expired' })).toBe('auth.passkeyExpired');
    expect(passkeyErrorKey({ status: 404, message: 'Not Found' })).toBe('auth.passkeyNotEnabled');
    expect(passkeyErrorKey({ message: 'Passkey sign-in is disabled' })).toBe('auth.passkeyNotEnabled');
    expect(passkeyErrorKey({ message: 'Credential not found' })).toBe('auth.passkeyNotRecognized');
    expect(passkeyErrorKey(new Error('boom'))).toBe('auth.passkeyFailed');
    expect(passkeyErrorKey(undefined)).toBe('auth.passkeyFailed');
  });
});
