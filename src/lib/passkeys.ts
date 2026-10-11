import type {
  PasskeyAuthenticationOptionsResponse,
  PasskeyAuthenticationVerifyParams,
  PasskeyRegistrationOptionsResponse,
  PasskeyRegistrationVerifyParams,
} from '@supabase/supabase-js';
import type {
  NativePasskeyAssertion,
  NativePasskeyAssertionOptions,
  NativePasskeyRegistration,
  NativePasskeyRegistrationOptions,
} from '../../modules/nix-passkeys';

type PublicKeyCredentialRequestOptionsJSON = PasskeyAuthenticationOptionsResponse['options'];
type PublicKeyCredentialCreationOptionsJSON = PasskeyRegistrationOptionsResponse['options'];
type AuthenticationResponseJSON = PasskeyAuthenticationVerifyParams['credential'];
type RegistrationResponseJSON = PasskeyRegistrationVerifyParams['credential'];

/**
 * WebAuthn relying party of NiX passkeys. Must match Supabase Auth `[auth.webauthn] rp_id`, the
 * `webcredentials:` associated domain and the `webcredentials.apps` entry of the AASA file.
 */
export const PASSKEY_RP_ID = 'nix.damianmotylinski.pl';

/**
 * The login button is shown only when the backend has passkeys enabled (`[auth.passkey]` in the
 * hosted project) — a build without the flag never offers a ceremony the server would refuse.
 */
export function isPasskeyFeatureEnabled(value: string | undefined = process.env.EXPO_PUBLIC_PASSKEYS_ENABLED) {
  return value === 'true';
}

function credentialIds(list: readonly { id: string }[] | undefined) {
  return (list ?? []).map((item) => item.id).filter((id) => typeof id === 'string' && id.length > 0);
}

/** Server request options → native ASAuthorization assertion input. */
export function toNativeAssertionOptions(
  options: PublicKeyCredentialRequestOptionsJSON,
): NativePasskeyAssertionOptions {
  if (!options || typeof options.challenge !== 'string' || options.challenge.length === 0) {
    throw new Error('Passkey challenge is missing');
  }
  return {
    rpId: options.rpId || PASSKEY_RP_ID,
    challenge: options.challenge,
    allowCredentialIds: credentialIds(options.allowCredentials),
    userVerification: options.userVerification ?? 'preferred',
  };
}

/** Server creation options → native ASAuthorization registration input. */
export function toNativeRegistrationOptions(
  options: PublicKeyCredentialCreationOptionsJSON,
): NativePasskeyRegistrationOptions {
  if (!options || typeof options.challenge !== 'string' || options.challenge.length === 0) {
    throw new Error('Passkey challenge is missing');
  }
  if (!options.user || typeof options.user.id !== 'string' || options.user.id.length === 0) {
    throw new Error('Passkey user handle is missing');
  }
  return {
    rpId: options.rp?.id || PASSKEY_RP_ID,
    challenge: options.challenge,
    userId: options.user.id,
    // The name is what the password manager lists; fall back to the display name.
    userName: options.user.name || options.user.displayName || 'NiX',
    excludeCredentialIds: credentialIds(options.excludeCredentials),
    userVerification: options.authenticatorSelection?.userVerification ?? 'preferred',
  };
}

/** Native assertion → W3C `AuthenticationResponseJSON` expected by `/passkeys/authentication/verify`. */
export function toAuthenticationResponseJSON(native: NativePasskeyAssertion): AuthenticationResponseJSON {
  return {
    id: native.credentialId,
    rawId: native.credentialId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: native.clientDataJSON,
      authenticatorData: native.authenticatorData,
      signature: native.signature,
      ...(native.userHandle ? { userHandle: native.userHandle } : {}),
    },
  };
}

/** Native registration → W3C `RegistrationResponseJSON` expected by `/passkeys/registration/verify`. */
export function toRegistrationResponseJSON(native: NativePasskeyRegistration): RegistrationResponseJSON {
  return {
    id: native.credentialId,
    rawId: native.credentialId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: native.clientDataJSON,
      attestationObject: native.attestationObject,
      transports: ['internal', 'hybrid'],
    },
  };
}

export type PasskeyErrorKey =
  | 'auth.passkeyUnavailable'
  | 'auth.passkeyNotEnabled'
  | 'auth.passkeyExpired'
  | 'auth.passkeyNotRecognized'
  | 'auth.passkeyFailed';

/**
 * i18n key for a failed passkey sign-in, or `null` when the user just closed the system sheet
 * (no message, like a cancelled Apple sign-in).
 */
export function passkeyErrorKey(error: unknown): PasskeyErrorKey | null {
  const value = (error ?? {}) as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof value.code === 'string' ? value.code : '';
  const status = typeof value.status === 'number' ? value.status : undefined;
  const message = typeof value.message === 'string' ? value.message.toLowerCase() : '';
  if (code === 'ERR_PASSKEY_CANCELLED' || code === 'ERROR_CEREMONY_ABORTED') return null;
  if (code === 'ERR_PASSKEY_UNAVAILABLE' || code === 'ERR_PASSKEY_NOT_INTERACTIVE') {
    return 'auth.passkeyUnavailable';
  }
  if (code === 'webauthn_challenge_expired') return 'auth.passkeyExpired';
  if (status === 404 || code === 'passkey_disabled' || code === 'feature_disabled'
    || /passkey.*(disabled|not enabled)|webauthn.*(disabled|not enabled)/.test(message)) {
    return 'auth.passkeyNotEnabled';
  }
  if (code === 'passkey_not_found' || code === 'webauthn_credential_not_found'
    || code === 'user_not_found' || /credential.*not found|unknown credential/.test(message)) {
    return 'auth.passkeyNotRecognized';
  }
  return 'auth.passkeyFailed';
}
