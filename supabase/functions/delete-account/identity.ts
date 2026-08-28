export type AuthIdentity = {
  provider?: string;
  identity_data?: Record<string, unknown> | null;
};

export type AuthUser = {
  id: string;
  identities?: AuthIdentity[] | null;
  app_metadata?: Record<string, unknown> | null;
};

export type AppleIdentityResolution =
  | { kind: 'none' }
  | { kind: 'unreliable' }
  | { kind: 'ok'; sub: string };

function metadataListsApple(user: AuthUser): boolean {
  const metadata = user.app_metadata ?? {};
  const provider = metadata.provider;
  const providers = metadata.providers;
  return provider === 'apple' || (Array.isArray(providers) && providers.includes('apple'));
}

function appleSubFromIdentity(identity: AuthIdentity): string | null {
  const sub = identity.identity_data?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

/**
 * Apple subject must come from Supabase Auth identities returned by getUser().
 * Client flags and profiles.apple_id are untrusted and unused.
 */
export function resolveAppleIdentity(user: AuthUser): AppleIdentityResolution {
  const identities = user.identities ?? [];
  const appleIdentities = identities.filter((identity) => identity.provider === 'apple');

  if (appleIdentities.length === 0) {
    return metadataListsApple(user) ? { kind: 'unreliable' } : { kind: 'none' };
  }

  const subs = appleIdentities.map(appleSubFromIdentity);
  if (subs.some((sub) => sub === null)) return { kind: 'unreliable' };

  const unique = new Set(subs as string[]);
  if (unique.size !== 1) return { kind: 'unreliable' };

  return { kind: 'ok', sub: [...unique][0] };
}

export function readAppleAuthorizationCode(body: Record<string, unknown>): string | null {
  const value = body.appleAuthorizationCode;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  return trimmed;
}
