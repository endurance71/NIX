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

test('loads project dotenv when invoked from ios using an explicit root', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'nix-release-env-'));
  try {
    await mkdir(join(root, 'ios'));
    await writeFile(join(root, '.env.production'),
      `EXPO_PUBLIC_SUPABASE_URL=${secretUrl}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${secretKey}\n`);
    const result = spawnSync(process.execPath,
      [validator, '--mode', 'production', '--project-root', root], {
        cwd: join(root, 'ios'),
        env: { PATH: process.env.PATH },
        encoding: 'utf8',
      });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /project-ref|test-public-anon-key/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('blocks telemetry enabled by a local override of production dotenv', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'nix-release-override-'));
  try {
    await writeFile(join(root, '.env.production'),
      `EXPO_PUBLIC_SUPABASE_URL=${secretUrl}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${secretKey}\nEXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=false\n`);
    await writeFile(join(root, '.env.local'), 'EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=true\n');
    const result = spawnSync(process.execPath,
      [validator, '--mode', 'production', '--project-root', root], {
        env: { PATH: process.env.PATH }, encoding: 'utf8',
      });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED must remain disabled/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /project-ref|test-public-anon-key/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const flag of ['EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED', 'EXPO_PUBLIC_SENTRY_ENABLED']) {
  test(`blocks explicit ${flag} in a release`, () => {
    const result = run({
      EXPO_PUBLIC_SUPABASE_URL: secretUrl,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: secretKey,
      [flag]: 'true',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must remain disabled/);
  });
}
