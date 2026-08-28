import { assertEquals } from 'jsr:@std/assert@1';
import { handleDeleteAccount, type DeleteAccountDeps, type DeletionErrorCategory } from './handler.ts';
import {
  exchangeAppleAuthorizationCode,
  fetchAppleJwks,
  revokeAppleRefreshToken,
  type AppleFailure,
  type AppleJwks,
  type AppleSecrets,
  type AppleTokenSuccess,
} from './apple.ts';
import type { AuthUser } from './identity.ts';

const APPLE_SUB = '001234.apple';
const SECRETS: AppleSecrets = {
  teamId: 'TEAMID1234',
  keyId: 'KEYID12345',
  clientId: 'com.damianmotylinski.nixapp',
  privateKey: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
};

function appleUser(): AuthUser {
  return {
    id: 'user-apple',
    identities: [{ provider: 'apple', identity_data: { sub: APPLE_SUB } }],
  };
}

function emailUser(): AuthUser {
  return {
    id: 'user-email',
    identities: [{ provider: 'email', identity_data: { sub: 'user-email' } }],
  };
}

function request(body: Record<string, unknown> = {}, userToken = 'user-jwt') {
  return new Request('https://example.test/delete-account', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function createDeps(options: {
  user: AuthUser | null;
  exchange?: AppleTokenSuccess | AppleFailure;
  verifySub?: string | false;
  revoke?: { ok: true } | AppleFailure;
  secrets?: AppleSecrets | null;
  jwks?: AppleJwks | null;
  cleanupError?: boolean;
}): { deps: DeleteAccountDeps; calls: string[]; categories: DeletionErrorCategory[] } {
  const calls: string[] = [];
  const categories: DeletionErrorCategory[] = [];
  const deps: DeleteAccountDeps = {
    getUser: async () => {
      calls.push('authenticate');
      return options.user;
    },
    readAppleSecrets: () => options.secrets === undefined ? SECRETS : options.secrets,
    createClientSecret: async () => {
      calls.push('create_client_secret');
      return { ok: true, token: 'client-secret-jwt' };
    },
    exchangeCode: async () => {
      calls.push('exchange');
      return options.exchange ?? {
        ok: true,
        refreshToken: 'refresh-token',
        idToken: 'id-token',
      };
    },
    fetchJwks: async () => {
      calls.push('jwks');
      return options.jwks === undefined ? { keys: [] } : options.jwks;
    },
    verifyIdToken: async () => {
      calls.push('verify_sub');
      if (options.verifySub === false) return { ok: false };
      return { ok: true, sub: options.verifySub ?? APPLE_SUB };
    },
    revokeToken: async () => {
      calls.push('revoke');
      return options.revoke ?? { ok: true };
    },
    cleanupDatabase: async () => {
      if (options.cleanupError) throw new Error('db exploded');
      calls.push('database_cleanup');
      return { mediaPaths: [], avatarPaths: [] };
    },
    cleanupStorage: async () => {
      calls.push('storage_cleanup');
    },
    deleteAuthUser: async () => {
      calls.push('delete_auth_user');
    },
    logError: (category) => {
      categories.push(category);
    },
  };
  return { deps, calls, categories };
}

Deno.test('Apple bez kodu zatrzymuje się przed wymianą i cleanupem', async () => {
  const { deps, calls, categories } = createDeps({ user: appleUser() });
  const response = await handleDeleteAccount(request({}), deps);
  assertEquals(response.status, 400);
  assertEquals(await readJson(response), {
    error: 'Apple authorization is required to delete this account.',
  });
  assertEquals(categories, ['missing_apple_authorization_code']);
  assertEquals(calls, ['authenticate']);
});

Deno.test('błędny lub zużyty kod nie uruchamia revoke ani cleanupu', async () => {
  const { deps, calls, categories } = createDeps({
    user: appleUser(),
    exchange: { ok: false, category: 'apple_token_invalid' },
  });
  const response = await handleDeleteAccount(
    request({ appleAuthorizationCode: 'used-code', appleId: 'attacker-sub' }),
    deps
  );
  assertEquals(response.status, 400);
  assertEquals(categories, ['apple_token_invalid']);
  assertEquals(calls, ['authenticate', 'create_client_secret', 'exchange']);
});

Deno.test('token endpoint 5xx jest retryable i nie czyści konta', async () => {
  const { deps, calls, categories } = createDeps({
    user: appleUser(),
    exchange: { ok: false, category: 'apple_token_exchange_failed' },
  });
  const response = await handleDeleteAccount(request({ appleAuthorizationCode: 'fresh-code' }), deps);
  assertEquals(response.status, 502);
  assertEquals(categories, ['apple_token_exchange_failed']);
  assertEquals(calls.includes('revoke'), false);
  assertEquals(calls.includes('database_cleanup'), false);
});

Deno.test('niezgodny sub z Auth nie robi revoke ani usunięcia', async () => {
  const { deps, calls, categories } = createDeps({
    user: appleUser(),
    verifySub: 'some-other-apple-user',
  });
  const response = await handleDeleteAccount(
    request({ appleAuthorizationCode: 'fresh-code', apple_id: 'some-other-apple-user' }),
    deps
  );
  assertEquals(response.status, 403);
  assertEquals(categories, ['apple_sub_mismatch']);
  assertEquals(calls, ['authenticate', 'create_client_secret', 'exchange', 'jwks', 'verify_sub']);
});

Deno.test('błąd revoke nie uruchamia cleanupu', async () => {
  const { deps, calls, categories } = createDeps({
    user: appleUser(),
    revoke: { ok: false, category: 'apple_revoke_failed' },
  });
  const response = await handleDeleteAccount(request({ appleAuthorizationCode: 'fresh-code' }), deps);
  assertEquals(response.status, 502);
  assertEquals(categories, ['apple_revoke_failed']);
  assertEquals(calls, [
    'authenticate',
    'create_client_secret',
    'exchange',
    'jwks',
    'verify_sub',
    'revoke',
  ]);
});

Deno.test('pełny sukces Apple zachowuje kolejność authenticate → exchange → verify → revoke → cleanup → delete', async () => {
  const { deps, calls, categories } = createDeps({ user: appleUser() });
  const response = await handleDeleteAccount(request({ appleAuthorizationCode: 'fresh-code' }), deps);
  assertEquals(response.status, 200);
  assertEquals(await readJson(response), { ok: true });
  assertEquals(categories, []);
  assertEquals(calls, [
    'authenticate',
    'create_client_secret',
    'exchange',
    'jwks',
    'verify_sub',
    'revoke',
    'database_cleanup',
    'storage_cleanup',
    'delete_auth_user',
  ]);
});

Deno.test('konto email-only usuwa się bez wywołań Apple', async () => {
  const { deps, calls } = createDeps({ user: emailUser() });
  const response = await handleDeleteAccount(request({ appleAuthorizationCode: 'should-be-ignored' }), deps);
  assertEquals(response.status, 200);
  assertEquals(calls, ['authenticate', 'database_cleanup', 'storage_cleanup', 'delete_auth_user']);
});

Deno.test('żadna ścieżka błędu przed revoke nie uruchamia cleanupu', async () => {
  const cases = [
    createDeps({ user: appleUser() }),
    createDeps({ user: appleUser(), secrets: null }),
    createDeps({ user: appleUser(), exchange: { ok: false, category: 'apple_token_invalid' } }),
    createDeps({ user: appleUser(), exchange: { ok: false, category: 'apple_token_exchange_failed' } }),
    createDeps({ user: appleUser(), jwks: null }),
    createDeps({ user: appleUser(), verifySub: false }),
    createDeps({ user: appleUser(), verifySub: 'mismatch' }),
    createDeps({ user: appleUser(), revoke: { ok: false, category: 'apple_revoke_failed' } }),
  ];
  const bodies = [
    {},
    { appleAuthorizationCode: 'fresh-code' },
    { appleAuthorizationCode: 'fresh-code' },
    { appleAuthorizationCode: 'fresh-code' },
    { appleAuthorizationCode: 'fresh-code' },
    { appleAuthorizationCode: 'fresh-code' },
    { appleAuthorizationCode: 'fresh-code' },
    { appleAuthorizationCode: 'fresh-code' },
  ];

  for (let i = 0; i < cases.length; i++) {
    const { deps, calls } = cases[i];
    const response = await handleDeleteAccount(request(bodies[i]), deps);
    assertEquals(response.status >= 400, true);
    assertEquals(calls.includes('database_cleanup'), false);
    assertEquals(calls.includes('storage_cleanup'), false);
    assertEquals(calls.includes('delete_auth_user'), false);
    if (calls.includes('revoke') === false) {
      assertEquals(calls.includes('database_cleanup'), false);
    }
  }
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

Deno.test('timeout każdego endpointu Apple nie uruchamia cleanupu', async () => {
  const timeoutMs = 20;
  const fetchImpl = abortingFetch();
  const endpoints: Array<{ name: string; patch: (deps: DeleteAccountDeps) => void }> = [
    {
      name: '/auth/token',
      patch: (deps) => {
        deps.exchangeCode = (input) =>
          exchangeAppleAuthorizationCode({ ...input, fetchImpl, timeoutMs });
      },
    },
    {
      name: '/auth/keys',
      patch: (deps) => {
        deps.fetchJwks = () => fetchAppleJwks(fetchImpl, timeoutMs);
      },
    },
    {
      name: '/auth/revoke',
      patch: (deps) => {
        deps.revokeToken = (input) =>
          revokeAppleRefreshToken({ ...input, fetchImpl, timeoutMs });
      },
    },
  ];

  for (const endpoint of endpoints) {
    const { deps, calls } = createDeps({ user: appleUser() });
    endpoint.patch(deps);
    const response = await handleDeleteAccount(request({ appleAuthorizationCode: 'fresh-code' }), deps);
    assertEquals(response.status >= 400, true, endpoint.name);
    assertEquals(calls.includes('database_cleanup'), false, endpoint.name);
    assertEquals(calls.includes('storage_cleanup'), false, endpoint.name);
    assertEquals(calls.includes('delete_auth_user'), false, endpoint.name);
  }
});
