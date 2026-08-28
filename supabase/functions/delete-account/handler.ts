import { corsHeaders, getBearerToken, json } from '../_shared/http.ts';
import {
  createAppleClientSecret,
  exchangeAppleAuthorizationCode,
  fetchAppleJwks,
  readAppleSecrets,
  revokeAppleRefreshToken,
  verifyAppleIdToken,
  type AppleFailure,
  type AppleJwks,
  type AppleSecrets,
  type AppleTokenSuccess,
} from './apple.ts';
import {
  readAppleAuthorizationCode,
  resolveAppleIdentity,
  type AuthUser,
} from './identity.ts';

export type DeletionErrorCategory =
  | 'unauthorized'
  | 'method_not_allowed'
  | 'missing_apple_authorization_code'
  | 'apple_not_configured'
  | 'apple_identity_unreliable'
  | 'apple_token_invalid'
  | 'apple_token_exchange_failed'
  | 'apple_sub_mismatch'
  | 'apple_revoke_failed'
  | 'account_deletion_failed';

export type DeleteAccountDeps = {
  getUser: (accessToken: string) => Promise<AuthUser | null>;
  readAppleSecrets: () => AppleSecrets | null;
  createClientSecret: typeof createAppleClientSecret;
  exchangeCode: (input: {
    code: string;
    clientId: string;
    clientSecret: string;
  }) => Promise<AppleTokenSuccess | AppleFailure>;
  fetchJwks: () => Promise<AppleJwks | null>;
  verifyIdToken: (input: {
    idToken: string;
    clientId: string;
    jwks: AppleJwks;
  }) => Promise<{ ok: true; sub: string } | { ok: false }>;
  revokeToken: (input: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }) => Promise<{ ok: true } | AppleFailure>;
  cleanupDatabase: (userId: string) => Promise<{ mediaPaths: string[]; avatarPaths: string[] }>;
  cleanupStorage: (userId: string, paths: { mediaPaths: string[]; avatarPaths: string[] }) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
  logError: (category: DeletionErrorCategory) => void;
};

const USER_MESSAGES: Record<DeletionErrorCategory, { status: number; error: string }> = {
  unauthorized: { status: 401, error: 'Unauthorized' },
  method_not_allowed: { status: 405, error: 'Method not allowed' },
  missing_apple_authorization_code: {
    status: 400,
    error: 'Apple authorization is required to delete this account.',
  },
  apple_not_configured: {
    status: 503,
    error: 'Account deletion is temporarily unavailable. Please try again later.',
  },
  apple_identity_unreliable: {
    status: 403,
    error: 'Apple authorization did not match this account.',
  },
  apple_token_invalid: {
    status: 400,
    error: 'Apple authorization expired or is invalid. Please try again.',
  },
  apple_token_exchange_failed: {
    status: 502,
    error: 'Account deletion could not be completed. Please try again.',
  },
  apple_sub_mismatch: {
    status: 403,
    error: 'Apple authorization did not match this account.',
  },
  apple_revoke_failed: {
    status: 502,
    error: 'Account deletion could not be completed. Please try again.',
  },
  account_deletion_failed: {
    status: 500,
    error: 'Account deletion could not be completed. Please try again.',
  },
};

function fail(deps: DeleteAccountDeps, category: DeletionErrorCategory) {
  deps.logError(category);
  const { status, error } = USER_MESSAGES[category];
  return json({ error }, status);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function cleanupAndDelete(userId: string, deps: DeleteAccountDeps) {
  const paths = await deps.cleanupDatabase(userId);
  await deps.cleanupStorage(userId, paths);
  await deps.deleteAuthUser(userId);
}

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(deps, 'method_not_allowed');

  const token = getBearerToken(req);
  if (!token) return fail(deps, 'unauthorized');

  const user = await deps.getUser(token);
  if (!user) return fail(deps, 'unauthorized');

  const body = await readBody(req);
  const identity = resolveAppleIdentity(user);

  if (identity.kind === 'unreliable') return fail(deps, 'apple_identity_unreliable');

  if (identity.kind === 'ok') {
    const authorizationCode = readAppleAuthorizationCode(body);
    if (!authorizationCode) return fail(deps, 'missing_apple_authorization_code');

    const secrets = deps.readAppleSecrets();
    if (!secrets) return fail(deps, 'apple_not_configured');

    const clientSecret = await deps.createClientSecret(secrets);
    if (!clientSecret.ok) return fail(deps, 'apple_not_configured');

    const exchanged = await deps.exchangeCode({
      code: authorizationCode,
      clientId: secrets.clientId,
      clientSecret: clientSecret.token,
    });
    if (!exchanged.ok) return fail(deps, exchanged.category);

    const jwks = await deps.fetchJwks();
    if (!jwks) return fail(deps, 'apple_token_exchange_failed');

    const verified = await deps.verifyIdToken({
      idToken: exchanged.idToken,
      clientId: secrets.clientId,
      jwks,
    });
    if (!verified.ok) return fail(deps, 'apple_token_invalid');
    if (verified.sub !== identity.sub) return fail(deps, 'apple_sub_mismatch');

    const revoked = await deps.revokeToken({
      refreshToken: exchanged.refreshToken,
      clientId: secrets.clientId,
      clientSecret: clientSecret.token,
    });
    if (!revoked.ok) return fail(deps, revoked.category);
  }

  try {
    await cleanupAndDelete(user.id, deps);
    return json({ ok: true });
  } catch {
    return fail(deps, 'account_deletion_failed');
  }
}

export const productionApple = {
  createClientSecret: createAppleClientSecret,
  exchangeCode: (input: { code: string; clientId: string; clientSecret: string }) =>
    exchangeAppleAuthorizationCode(input),
  fetchJwks: () => fetchAppleJwks(),
  verifyIdToken: verifyAppleIdToken,
  revokeToken: (input: { refreshToken: string; clientId: string; clientSecret: string }) =>
    revokeAppleRefreshToken(input),
  readAppleSecrets: () => readAppleSecrets(Deno.env),
};
