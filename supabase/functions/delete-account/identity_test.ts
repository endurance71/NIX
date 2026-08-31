import { assertEquals } from 'jsr:@std/assert@1';
import { resolveAppleIdentity, readAppleAuthorizationCode, type AuthUser } from './identity.ts';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: 'user-1', identities: [], app_metadata: {}, ...overrides };
}

Deno.test('email-only użytkownik bez identity Apple nie wymaga kodu', () => {
  assertEquals(resolveAppleIdentity(user({
    identities: [{ provider: 'email', identity_data: { sub: 'user-1' } }],
  })), { kind: 'none' });
});

Deno.test('identity apple z sub z Auth jest jedynym źródłem Apple ID', () => {
  assertEquals(
    resolveAppleIdentity(user({
      identities: [{
        provider: 'apple',
        identity_data: { sub: '001234.apple', email: 'hidden@privaterelay.appleid.com' },
      }],
    })),
    { kind: 'ok', sub: '001234.apple' }
  );
});

Deno.test('hint Apple w app_metadata bez identity_data.sub jest zawodny', () => {
  assertEquals(
    resolveAppleIdentity(user({
      identities: [],
      app_metadata: { provider: 'apple', providers: ['apple'] },
    })),
    { kind: 'unreliable' }
  );
});

Deno.test('identity apple bez sub jest zawodna', () => {
  assertEquals(
    resolveAppleIdentity(user({
      identities: [{ provider: 'apple', identity_data: { email: 'a@b.c' } }],
    })),
    { kind: 'unreliable' }
  );
});

Deno.test('rozbieżne sub w identity Apple są zawodne', () => {
  assertEquals(
    resolveAppleIdentity(user({
      identities: [
        { provider: 'apple', identity_data: { sub: 'aaa' } },
        { provider: 'apple', identity_data: { sub: 'bbb' } },
      ],
    })),
    { kind: 'unreliable' }
  );
});

Deno.test('czyta wyłącznie appleAuthorizationCode z body i ignoruje flagi klienta', () => {
  assertEquals(readAppleAuthorizationCode({ appleAuthorizationCode: '  code-1  ' }), 'code-1');
  assertEquals(readAppleAuthorizationCode({
    appleAuthorizationCode: 1,
    appleId: '001234.apple',
    apple_id: '001234.apple',
    hasApple: true,
  }), null);
});
