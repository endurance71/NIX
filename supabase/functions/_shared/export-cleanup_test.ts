import { cleanupExportArchives } from './export-cleanup.ts';
function assert(value: unknown): asserts value { if (!value) throw new Error('assertion_failed'); }
const rows = [{ id: 'export', storage_path: 'owner/export.zip' }];
Deno.test('export Storage failure retains retry path, then success clears it', async () => {
  let path: string | null = rows[0].storage_path;
  const ack = async (_id: string, error: string | null) => { if (!error) path = null; };
  const first = await cleanupExportArchives(rows, () => Promise.resolve({ error: { message: 'network' } }), ack);
  assert(first.retry === 1 && path === 'owner/export.zip');
  const second = await cleanupExportArchives(rows, () => Promise.resolve({ error: null }), ack);
  assert(second.removed === 1 && path === null);
});
Deno.test('export remove exception never clears path', async () => {
  let ack = 0;
  const result = await cleanupExportArchives(rows, () => Promise.reject(new Error('offline')), async () => { ack++; });
  assert(result.retry === 1 && ack === 0);
});
Deno.test('export ACK failure stays retryable after idempotent Storage delete', async () => {
  const result = await cleanupExportArchives(rows, () => Promise.resolve({ error: null }), () => Promise.reject(new Error('database')));
  assert(result.retry === 1 && result.removed === 0);
});
