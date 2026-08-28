export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
export const APPLE_ISS = 'https://appleid.apple.com';
export const APPLE_CLIENT_SECRET_TTL_SECONDS = 300;
export const APPLE_FETCH_TIMEOUT_MS = 8_000;

export type AppleSecrets = {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string;
};

export type AppleJwk = JsonWebKey & { kid?: string };

export type AppleJwks = {
  keys: AppleJwk[];
};

export type AppleTokenSuccess = {
  ok: true;
  refreshToken: string;
  idToken: string;
};

export type AppleFailure = {
  ok: false;
  category: 'apple_token_invalid' | 'apple_token_exchange_failed' | 'apple_revoke_failed';
};

type EnvReader = {
  get(key: string): string | undefined;
};

function requiredSecret(env: EnvReader, key: string): string | null {
  const value = env.get(key)?.trim();
  return value ? value : null;
}

export function readAppleSecrets(env: EnvReader): AppleSecrets | null {
  const teamId = requiredSecret(env, 'APPLE_TEAM_ID');
  const keyId = requiredSecret(env, 'APPLE_KEY_ID');
  const clientId = requiredSecret(env, 'APPLE_CLIENT_ID');
  const privateKey = requiredSecret(env, 'APPLE_PRIVATE_KEY');
  if (!teamId || !keyId || !clientId || !privateKey) return null;
  // Native Sign in with Apple must use the exact iOS bundle ID as client_id.
  if (clientId.includes(',')) return null;
  return { teamId, keyId, clientId, privateKey };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function decodeJwtPart(part: string): Record<string, unknown> | null {
  const bytes = base64UrlToBytes(part);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePkcs8Pem(pem: string): string | null {
  const normalized = pem.replaceAll('\\n', '\n').trim();
  const match = normalized.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  const body = match ? match[1] : (normalized.includes('BEGIN') ? null : normalized);
  if (!body) return null;
  const compact = body.replace(/\s+/g, '');
  return compact.length > 0 ? compact : null;
}

async function importApplePrivateKey(pem: string): Promise<CryptoKey | null> {
  const body = normalizePkcs8Pem(pem);
  if (!body) return null;
  try {
    const binary = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
    return await crypto.subtle.importKey(
      'pkcs8',
      binary,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  } catch {
    return null;
  }
}

export async function createAppleClientSecret(
  secrets: AppleSecrets,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<{ ok: true; token: string } | { ok: false }> {
  const key = await importApplePrivateKey(secrets.privateKey);
  if (!key) return { ok: false };

  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: secrets.keyId }))
  );
  const payload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: secrets.teamId,
        iat: nowSeconds,
        exp: nowSeconds + APPLE_CLIENT_SECRET_TTL_SECONDS,
        aud: APPLE_ISS,
        sub: secrets.clientId,
      })
    )
  );
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      toArrayBuffer(new TextEncoder().encode(signingInput))
    )
  );
  return { ok: true, token: `${signingInput}.${bytesToBase64Url(signature)}` };
}

async function readAppleJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function appleFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  return await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function exchangeAppleAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<AppleTokenSuccess | AppleFailure> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await appleFetch(
      fetchImpl,
      APPLE_TOKEN_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          code: input.code,
          grant_type: 'authorization_code',
        }),
      },
      input.timeoutMs ?? APPLE_FETCH_TIMEOUT_MS
    );
  } catch {
    return { ok: false, category: 'apple_token_exchange_failed' };
  }

  if (response.status >= 500) return { ok: false, category: 'apple_token_exchange_failed' };
  if (!response.ok) return { ok: false, category: 'apple_token_invalid' };

  const body = await readAppleJson(response);
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token : '';
  const idToken = typeof body?.id_token === 'string' ? body.id_token : '';
  if (!refreshToken || !idToken) return { ok: false, category: 'apple_token_invalid' };
  return { ok: true, refreshToken, idToken };
}

export async function fetchAppleJwks(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = APPLE_FETCH_TIMEOUT_MS
): Promise<AppleJwks | null> {
  try {
    const response = await appleFetch(fetchImpl, APPLE_JWKS_URL, {}, timeoutMs);
    if (!response.ok) return null;
    const parsed = await response.json();
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as AppleJwks).keys)) return null;
    return parsed as AppleJwks;
  } catch {
    return null;
  }
}

function findJwk(jwks: AppleJwks, kid: string): JsonWebKey | null {
  const key = jwks.keys.find((candidate) => candidate.kid === kid);
  return key ?? null;
}

export async function verifyAppleIdToken(input: {
  idToken: string;
  clientId: string;
  jwks: AppleJwks;
  nowSeconds?: number;
}): Promise<{ ok: true; sub: string } | { ok: false }> {
  const parts = input.idToken.split('.');
  if (parts.length !== 3) return { ok: false };

  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  const signature = base64UrlToBytes(parts[2]);
  if (!header || !payload || !signature) return { ok: false };
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false };

  const jwk = findJwk(input.jwks, header.kid);
  if (!jwk) return { ok: false };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  } catch {
    return { ok: false };
  }

  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    toArrayBuffer(signature),
    toArrayBuffer(signingInput)
  );
  if (!valid) return { ok: false };

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const sub = payload.sub;
  const exp = payload.exp;
  if (payload.iss !== APPLE_ISS) return { ok: false };
  if (payload.aud !== input.clientId) return { ok: false };
  if (typeof exp !== 'number' || exp <= nowSeconds) return { ok: false };
  if (typeof sub !== 'string' || sub.length === 0) return { ok: false };
  return { ok: true, sub };
}

export async function revokeAppleRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ ok: true } | AppleFailure> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await appleFetch(
      fetchImpl,
      APPLE_REVOKE_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          token: input.refreshToken,
          token_type_hint: 'refresh_token',
        }),
      },
      input.timeoutMs ?? APPLE_FETCH_TIMEOUT_MS
    );
  } catch {
    return { ok: false, category: 'apple_revoke_failed' };
  }

  // Apple returns HTTP 200 with an empty body after invalidation and for a
  // token that was already revoked. Any other status is fail-closed.
  if (response.status === 200) return { ok: true };
  return { ok: false, category: 'apple_revoke_failed' };
}
