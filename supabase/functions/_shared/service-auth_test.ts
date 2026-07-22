import { hasServiceRoleBearer } from './service-auth.ts';

function b64url(value: string) {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fakeJwt(payload: Record<string, unknown>) {
  return `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify(payload))}.sig`;
}

Deno.test('administrative requests require the service-role bearer token', () => {
  const key = 'service-role-test-key';
  const valid = new Request('https://example.test', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const missing = new Request('https://example.test');
  const wrong = new Request('https://example.test', {
    headers: { Authorization: 'Bearer authenticated-user-token' },
  });
  const serviceJwt = new Request('https://example.test', {
    headers: {
      Authorization: `Bearer ${fakeJwt({ iss: 'supabase', role: 'service_role' })}`,
    },
  });
  const userJwt = new Request('https://example.test', {
    headers: {
      Authorization: `Bearer ${fakeJwt({ iss: 'supabase', role: 'authenticated' })}`,
    },
  });

  if (!hasServiceRoleBearer(valid, key)) throw new Error('valid service-role token was rejected');
  if (hasServiceRoleBearer(missing, key)) throw new Error('missing bearer token was accepted');
  if (hasServiceRoleBearer(wrong, key)) throw new Error('user bearer token was accepted');
  if (!hasServiceRoleBearer(serviceJwt, 'other-injected-key')) {
    throw new Error('service_role JWT was rejected after key rotation mismatch');
  }
  if (hasServiceRoleBearer(userJwt, 'other-injected-key')) {
    throw new Error('authenticated JWT was accepted as service role');
  }
});
