import { requireOptionalNativeModule } from 'expo';

/** base64url fields of a platform passkey assertion (ASAuthorizationPlatformPublicKeyCredentialAssertion). */
export type NativePasskeyAssertion = {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle?: string;
};

/** base64url fields of a platform passkey registration. */
export type NativePasskeyRegistration = {
  credentialId: string;
  clientDataJSON: string;
  attestationObject: string;
};

export type NativePasskeyAssertionOptions = {
  rpId: string;
  challenge: string;
  allowCredentialIds: string[];
  userVerification: string;
};

export type NativePasskeyRegistrationOptions = {
  rpId: string;
  challenge: string;
  userId: string;
  userName: string;
  excludeCredentialIds: string[];
  userVerification: string;
};

type NixPasskeysNativeModule = {
  isSupported(): boolean;
  getAssertionAsync(options: NativePasskeyAssertionOptions): Promise<NativePasskeyAssertion>;
  createCredentialAsync(options: NativePasskeyRegistrationOptions): Promise<NativePasskeyRegistration>;
};

// Binaries built before this module existed (OTA onto build ≤ 11) simply have no passkeys.
const NixPasskeys = requireOptionalNativeModule<NixPasskeysNativeModule>('NixPasskeys');

/** Whether this binary can run passkey ceremonies at all. */
export function isNativePasskeySupported(): boolean {
  try {
    return Boolean(NixPasskeys?.isSupported());
  } catch {
    return false;
  }
}

export class NativePasskeyUnavailableError extends Error {
  readonly code = 'ERR_PASSKEY_UNAVAILABLE';
  constructor() {
    super('Passkeys are not available in this build.');
    this.name = 'NativePasskeyUnavailableError';
  }
}

export async function getPasskeyAssertionAsync(
  options: NativePasskeyAssertionOptions,
): Promise<NativePasskeyAssertion> {
  if (!NixPasskeys) throw new NativePasskeyUnavailableError();
  return NixPasskeys.getAssertionAsync(options);
}

export async function createPasskeyCredentialAsync(
  options: NativePasskeyRegistrationOptions,
): Promise<NativePasskeyRegistration> {
  if (!NixPasskeys) throw new NativePasskeyUnavailableError();
  return NixPasskeys.createCredentialAsync(options);
}
