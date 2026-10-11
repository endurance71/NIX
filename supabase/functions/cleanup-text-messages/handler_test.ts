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

Deno.test('text cleanup removes queued voice audio before completing the queue', async () => {
  const calls: string[] = [];
  const queue = [['a/b/1.m4a', 'a/b/2.m4a']];
  const response = await handleCleanupTextMessages(
    new Request('https://example.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
    }),
    KEY,
    {
      listExpiredIds: () => Promise.resolve([]),
      deleteIds: () => Promise.resolve(0),
      claimVoiceObjects: () => Promise.resolve(queue.shift() ?? []),
      removeVoiceObjects: (paths) => {
        calls.push(`remove:${paths.join(',')}`);
        return Promise.resolve();
      },
      completeVoiceObjects: (paths) => {
        calls.push(`complete:${paths.join(',')}`);
        return Promise.resolve();
      },
    },
  );
  assertEquals(response.status, 200, 'sweep succeeded');
  assertEquals((await response.json()).voiceObjectsRemoved, 2, 'both objects removed');
  assertEquals(calls.join('|'), 'remove:a/b/1.m4a,a/b/2.m4a|complete:a/b/1.m4a,a/b/2.m4a', 'storage first');
});

Deno.test('text cleanup keeps working when voice is not deployed or storage fails', async () => {
  const missing = await handleCleanupTextMessages(
    new Request('https://example.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
    }),
    KEY,
    {
      listExpiredIds: () => Promise.resolve([]),
      deleteIds: () => Promise.resolve(0),
      claimVoiceObjects: () => Promise.resolve(null),
      removeVoiceObjects: () => Promise.reject(new Error('must not run')),
      completeVoiceObjects: () => Promise.reject(new Error('must not run')),
    },
  );
  assertEquals(missing.status, 200, 'missing voice RPC is not an error');

  let completed = false;
  const failing = await handleCleanupTextMessages(
    new Request('https://example.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
    }),
    KEY,
    {
      listExpiredIds: () => Promise.resolve([]),
      deleteIds: () => Promise.resolve(0),
      claimVoiceObjects: () => Promise.resolve(['a/b/1.m4a']),
      removeVoiceObjects: () => Promise.reject(new Error('storage down')),
      completeVoiceObjects: () => {
        completed = true;
        return Promise.resolve();
      },
    },
  );
  assertEquals(failing.status, 200, 'text expiry still reports success');
  assertEquals(completed, false, 'a failed removal stays queued');
});
