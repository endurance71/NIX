import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const validator = fileURLToPath(new URL('./validate-release-env.mjs', import.meta.url));
const secretUrl = 'https://project-ref.supabase.co';
const secretKey = 'test-public-anon-key-that-must-not-be-logged';

function run(overrides = {}) {
  return spawnSync(process.execPath, [validator, '--mode', 'production'], {
    env: { PATH: process.env.PATH, EXPO_NO_DOTENV: '1', ...overrides },
    encoding: 'utf8',
  });
}

for (const [name, env] of [
  ['both values missing', {}],
  ['URL missing', { EXPO_PUBLIC_SUPABASE_ANON_KEY: secretKey }],
  ['key missing', { EXPO_PUBLIC_SUPABASE_URL: secretUrl }],
  ['URL malformed', { EXPO_PUBLIC_SUPABASE_URL: 'not-a-url', EXPO_PUBLIC_SUPABASE_ANON_KEY: secretKey }],
  ['URL is not HTTPS', { EXPO_PUBLIC_SUPABASE_URL: 'http://project-ref.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: secretKey }],
  ['key empty', { EXPO_PUBLIC_SUPABASE_URL: secretUrl, EXPO_PUBLIC_SUPABASE_ANON_KEY: '   ' }],
]) {
  test(`fails closed when ${name}`, () => {
    const result = run(env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Release environment validation failed/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /project-ref|test-public-anon-key/);
  });
}

test('accepts a valid release configuration without printing values', () => {
  const result = run({
    EXPO_PUBLIC_SUPABASE_URL: secretUrl,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: secretKey,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validation passed/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /project-ref|test-public-anon-key/);
});
