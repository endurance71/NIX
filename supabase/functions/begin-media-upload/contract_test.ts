import { assertEquals } from 'jsr:@std/assert@1';
import { parseClientCreatedAt, verifiedJwtSubject } from './contract.ts';

const USER_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function base64Url(value: unknown) {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function token(claims: Record<string, unknown>) {
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url(claims)}.signature`;
}

Deno.test('reads the subject of an authenticated gateway-verified token', () => {
  const now = Date.UTC(2026, 9, 10, 12);
  assertEquals(
    verifiedJwtSubject(token({ sub: USER_ID, role: 'authenticated', exp: now / 1000 + 60 }), now),
    USER_ID
  );
});

Deno.test('rejects anon, service, expired and malformed tokens', () => {
  const now = Date.UTC(2026, 9, 10, 12);
  assertEquals(verifiedJwtSubject(token({ role: 'anon' }), now), null);
  assertEquals(verifiedJwtSubject(token({ sub: USER_ID, role: 'service_role' }), now), null);
  assertEquals(
    verifiedJwtSubject(token({ sub: USER_ID, role: 'authenticated', exp: now / 1000 - 1 }), now),
    null
  );
  assertEquals(verifiedJwtSubject(token({ sub: 'not-a-uuid', role: 'authenticated' }), now), null);
  assertEquals(verifiedJwtSubject('only.two', now), null);
  assertEquals(verifiedJwtSubject('a.%%%.c', now), null);
});

Deno.test('normalizes client creation time from ISO strings and epoch milliseconds', () => {
  const ms = Date.UTC(2026, 9, 10, 11, 58, 30, 125);
  assertEquals(parseClientCreatedAt(ms), '2026-10-10T11:58:30.125Z');
  assertEquals(parseClientCreatedAt('2026-10-10T13:58:30.125+02:00'), '2026-10-10T11:58:30.125Z');
});

Deno.test('ignores missing or invalid client creation time', () => {
  assertEquals(parseClientCreatedAt(undefined), null);
  assertEquals(parseClientCreatedAt(null), null);
  assertEquals(parseClientCreatedAt(''), null);
  assertEquals(parseClientCreatedAt('yesterday-ish'), null);
  assertEquals(parseClientCreatedAt(Number.NaN), null);
  assertEquals(parseClientCreatedAt(8.64e15 + 1), null);
  assertEquals(parseClientCreatedAt({ at: 1 }), null);
  assertEquals(parseClientCreatedAt('x'.repeat(65)), null);
});
