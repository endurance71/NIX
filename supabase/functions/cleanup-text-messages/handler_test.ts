import { handleCleanupTextMessages } from './handler.ts';

const KEY = 'service-role-test-key';

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: ${actual} !== ${expected}`);
}

function store(batches: string[][]) {
  const deleted: string[] = [];
  return {
    deleted,
    listExpiredIds: () => Promise.resolve(batches.shift() ?? []),
    deleteIds: (ids: string[]) => {
      deleted.push(...ids);
      return Promise.resolve(ids.length);
    },
  };
}

Deno.test('text cleanup rejects user tokens and non-POST requests', async () => {
  const s = store([['a']]);
  const user = await handleCleanupTextMessages(
    new Request('https://example.test', {
      method: 'POST',
      headers: { Authorization: 'Bearer authenticated-user-token' },
    }),
    KEY,
    s,
  );
  assertEquals(user.status, 401, 'user token rejected');
  const get = await handleCleanupTextMessages(new Request('https://example.test'), KEY, s);
  assertEquals(get.status, 405, 'GET rejected');
  assertEquals(s.deleted.length, 0, 'nothing deleted without service role');
});

Deno.test('text cleanup sweeps every full batch for the service role', async () => {
  const full = Array.from({ length: 500 }, (_, i) => `id-${i}`);
  const s = store([full, ['last']]);
  const response = await handleCleanupTextMessages(
    new Request('https://example.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
    }),
    KEY,
    s,
  );
  assertEquals(response.status, 200, 'service role accepted');
  assertEquals((await response.json()).deletedCount, 501, 'both batches deleted');
});
