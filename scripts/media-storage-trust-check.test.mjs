import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyMediaStorageTrust } from './lib/media-storage-trust-check.mjs';

test('trust check requires pending write, approval, denied overwrite and unchanged bytes', async () => {
  const calls = [];
  await verifyMediaStorageTrust(async (method, body) => {
    calls.push([method, body]);
    if (method === 'GET') return { status: 200, body: 'safe-replaced' };
    return { status: body === 'unsafe-change' ? 403 : 200 };
  }, async () => { calls.push(['approve']); });
  assert.deepEqual(calls, [['POST', 'safe-original'], ['PUT', 'safe-replaced'], ['approve'], ['PUT', 'unsafe-change'], ['GET', undefined]]);
});

test('successful overwrite blocks the gate', async () => {
  await assert.rejects(verifyMediaStorageTrust(async () => ({ status: 200 }), async () => {}), /not denied/);
});

test('a denied metadata update that changed underlying bytes blocks the gate', async () => {
  await assert.rejects(verifyMediaStorageTrust(async (method, body) =>
    method === 'GET' ? { status: 200, body: 'unsafe-change' } : { status: body === 'unsafe-change' ? 403 : 200 },
  async () => {}), /bytes changed/);
});
