import { hasServiceRoleBearer } from './service-auth.ts';

Deno.test('administrative requests require the service-role bearer token', () => {
  const key = 'service-role-test-key';
  const valid = new Request('https://example.test', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const missing = new Request('https://example.test');
  const wrong = new Request('https://example.test', {
    headers: { Authorization: 'Bearer authenticated-user-token' },
  });

  if (!hasServiceRoleBearer(valid, key)) throw new Error('valid service-role token was rejected');
  if (hasServiceRoleBearer(missing, key)) throw new Error('missing bearer token was accepted');
  if (hasServiceRoleBearer(wrong, key)) throw new Error('user bearer token was accepted');
});
