import { assertEquals, assertExists } from 'jsr:@std/assert@1';
import {
  APPLE_CLIENT_SECRET_TTL_SECONDS,
  APPLE_ISS,
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  createAppleClientSecret,
  exchangeAppleAuthorizationCode,
  fetchAppleJwks,
  readAppleSecrets,
  revokeAppleRefreshToken,
  verifyAppleIdToken,
  type AppleJwk,
  type AppleJwks,
} from './apple.ts';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function pkcs8Pem(bytes: ArrayBuffer): string {
  const body = bytesToBase64(new Uint8Array(bytes));
  const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

async function generateAppleSecrets() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    teamId: 'TEAMID1234',
    keyId: 'KEYID12345',
    clientId: 'com.damianmotylinski.nixapp',
    privateKey: pkcs8Pem(pkcs8),
  };
}

async function generateRs256Jwt(claims: Record<string, unknown>, kid = 'apple-kid') {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid })));
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(signingInput))
  );
  const jwks: AppleJwks = { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' } as AppleJwk] };
  return { token: `${signingInput}.${bytesToBase64Url(signature)}`, jwks };
}

Deno.test('sekrety Apple są kompletne i nie przyjmują listy Client ID', () => {
  const env = new Map([
    ['APPLE_TEAM_ID', 'TEAMID1234'],
    ['APPLE_KEY_ID', 'KEYID12345'],
    ['APPLE_CLIENT_ID', 'com.damianmotylinski.nixapp'],
    ['APPLE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----'],
  ]);
  assertEquals(readAppleSecrets({ get: (key) => env.get(key) })?.clientId, 'com.damianmotylinski.nixapp');
  env.set('APPLE_CLIENT_ID', 'com.damianmotylinski.nixapp,host.exp.Exponent');
  assertEquals(readAppleSecrets({ get: (key) => env.get(key) }), null);
  env.delete('APPLE_PRIVATE_KEY');
  env.set('APPLE_CLIENT_ID', 'com.damianmotylinski.nixapp');
  assertEquals(readAppleSecrets({ get: (key) => env.get(key) }), null);
});

Deno.test('client secret JWT jest krótkotrwały i podpisany ES256', async () => {
  const secrets = await generateAppleSecrets();
  const now = 1_700_000_000;
  const created = await createAppleClientSecret(secrets, now);
  assertEquals(created.ok, true);
  if (!created.ok) return;
  const [headerPart, payloadPart] = created.token.split('.');
  const decode = (part: string) => {
    const padded = part.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(atob(padded));
  };
  const header = decode(headerPart);
  const payload = decode(payloadPart);
  assertEquals(header, { alg: 'ES256', kid: 'KEYID12345' });
  assertEquals(payload.iss, 'TEAMID1234');
  assertEquals(payload.sub, 'com.damianmotylinski.nixapp');
  assertEquals(payload.aud, APPLE_ISS);
  assertEquals(payload.iat, now);
  assertEquals(payload.exp, now + APPLE_CLIENT_SECRET_TTL_SECONDS);
});

Deno.test('weryfikuje iss, aud, exp i sub id_token Apple', async () => {
  const now = 1_700_000_000;
  const clientId = 'com.damianmotylinski.nixapp';
  const { token, jwks } = await generateRs256Jwt({
    iss: APPLE_ISS,
    aud: clientId,
    exp: now + 3600,
    sub: '001234.apple',
  });
  assertEquals(
    await verifyAppleIdToken({ idToken: token, clientId, jwks, nowSeconds: now }),
    { ok: true, sub: '001234.apple' }
  );
  assertEquals((await verifyAppleIdToken({
    idToken: token,
    clientId: 'other.bundle',
    jwks,
    nowSeconds: now,
  })).ok, false);
  assertEquals((await verifyAppleIdToken({
    idToken: token,
    clientId,
    jwks,
    nowSeconds: now + 4000,
  })).ok, false);
});

Deno.test('odrzuca id_token z obcym podpisem', async () => {
  const now = 1_700_000_000;
  const { token } = await generateRs256Jwt({
    iss: APPLE_ISS,
    aud: 'com.damianmotylinski.nixapp',
    exp: now + 3600,
    sub: '001234.apple',
  });
  const other = await generateRs256Jwt({
    iss: APPLE_ISS,
    aud: 'com.damianmotylinski.nixapp',
    exp: now + 3600,
    sub: '001234.apple',
  });
  assertEquals((await verifyAppleIdToken({
    idToken: token,
    clientId: 'com.damianmotylinski.nixapp',
    jwks: other.jwks,
    nowSeconds: now,
  })).ok, false);
});

Deno.test('token endpoint mapuje 4xx na invalid i 5xx na exchange failed', async () => {
  const invalid = await exchangeAppleAuthorizationCode({
    code: 'used-code',
    clientId: 'com.damianmotylinski.nixapp',
    clientSecret: 'secret',
    fetchImpl: () => Promise.resolve(new Response('{"error":"invalid_grant"}', { status: 400 })),
  });
  assertEquals(invalid, { ok: false, category: 'apple_token_invalid' });

  const unavailable = await exchangeAppleAuthorizationCode({
    code: 'fresh-code',
    clientId: 'com.damianmotylinski.nixapp',
    clientSecret: 'secret',
    fetchImpl: () => Promise.resolve(new Response('nope', { status: 503 })),
  });
  assertEquals(unavailable, { ok: false, category: 'apple_token_exchange_failed' });
});

Deno.test('wymiana kodu wymaga refresh_token i id_token', async () => {
  const result = await exchangeAppleAuthorizationCode({
    code: 'fresh-code',
    clientId: 'com.damianmotylinski.nixapp',
    clientSecret: 'secret',
    fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ access_token: 'a' }), { status: 200 })),
  });
  assertEquals(result, { ok: false, category: 'apple_token_invalid' });
});

Deno.test('revoke przechodzi wyłącznie przy HTTP 200', async () => {
  const ok = await revokeAppleRefreshToken({
    refreshToken: 'refresh',
    clientId: 'com.damianmotylinski.nixapp',
    clientSecret: 'secret',
    fetchImpl: (url) => {
      assertEquals(url, APPLE_REVOKE_URL);
      return Promise.resolve(new Response(null, { status: 200 }));
    },
  });
  assertEquals(ok, { ok: true });

  const failed = await revokeAppleRefreshToken({
    refreshToken: 'refresh',
    clientId: 'com.damianmotylinski.nixapp',
    clientSecret: 'secret',
    fetchImpl: () => Promise.resolve(new Response('{"error":"invalid_client"}', { status: 400 })),
  });
  assertEquals(failed, { ok: false, category: 'apple_revoke_failed' });
});

Deno.test('wymiana kodu woła wyłącznie /auth/token', async () => {
  let called = '';
  await exchangeAppleAuthorizationCode({
    code: 'fresh-code',
    clientId: 'com.damianmotylinski.nixapp',
    clientSecret: 'secret',
    fetchImpl: (url, init) => {
      called = String(url);
      assertEquals(init?.signal instanceof AbortSignal, true);
      return Promise.resolve(new Response(JSON.stringify({
        refresh_token: 'r',
        id_token: 't',
      }), { status: 200 }));
    },
  });
  assertEquals(called, APPLE_TOKEN_URL);
  assertExists(APPLE_TOKEN_URL);
});

function abortingFetch(): typeof fetch {
  return ((_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('Apple fetch is missing an abort signal'));
        return;
      }
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    })) as typeof fetch;
}

Deno.test('timeout /auth/token, /auth/keys i /auth/revoke jest fail-closed', async () => {
  const fetchImpl = abortingFetch();
  const timeoutMs = 20;
  assertEquals(
    await exchangeAppleAuthorizationCode({
      code: 'fresh-code',
      clientId: 'com.damianmotylinski.nixapp',
      clientSecret: 'secret',
      fetchImpl,
      timeoutMs,
    }),
    { ok: false, category: 'apple_token_exchange_failed' }
  );
  assertEquals(await fetchAppleJwks(fetchImpl, timeoutMs), null);
  assertEquals(
    await revokeAppleRefreshToken({
      refreshToken: 'refresh',
      clientId: 'com.damianmotylinski.nixapp',
      clientSecret: 'secret',
      fetchImpl,
      timeoutMs,
    }),
    { ok: false, category: 'apple_revoke_failed' }
  );
});
