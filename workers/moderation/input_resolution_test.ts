import { integrationRpcQueue, type Rpc } from './rpc-queue.ts';
import { downloadMediaVaultObject, InputResolutionError } from './download.ts';
import { MAX_IMAGE_BYTES } from '../../supabase/functions/_shared/media-limits.ts';
function assert(value: unknown): asserts value { if (!value) throw new Error('assertion_failed'); }
for (const terminal of [true, false]) {
  Deno.test(`claim-stage ${terminal ? 'permanent' : 'transient'} failure releases lease explicitly`, async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const rpc: Rpc = (name, args) => { calls.push({ name, args }); return Promise.resolve({ data: name === 'claim_moderation_jobs' ? [{ id: 'job', content_kind: 'media' }] : null, error: null }); };
    const queue = integrationRpcQueue(rpc, () => Promise.reject(new InputResolutionError('media_download_failed', !terminal)));
    const jobs = await queue.claim('owner', 1, 900);
    assert(jobs.length === 0 && calls.length === 2);
    assert(calls[1].name === 'complete_moderation_job' && calls[1].args.p_lease_owner === 'owner');
    assert(calls[1].args.p_status === (terminal ? 'error' : 'pending'));
    assert(calls[1].args.p_retry_delay_seconds === (terminal ? null : 30));
  });
}
Deno.test('approved recovery materializes by ID without re-downloading input', async () => {
  const rpc: Rpc = () => Promise.resolve({ data: [{ id: 'approved', content_kind: 'text' }], error: null });
  const queue = integrationRpcQueue(rpc, () => { throw new Error('resolver_must_not_run'); });
  const jobs = await queue.recoverApprovedUnmaterialized('owner');
  assert(jobs.length === 1 && jobs[0].id === 'approved');
});
Deno.test('download rejects actual bytes that differ from declared asset size and removes file', async () => {
  const dir = await Deno.makeTempDir(); const path = `${dir}/input`;
  try {
    let error = '';
    try { await downloadMediaVaultObject('https://local.invalid','test','nixes/owner/file',path,{
      knownSize: 4, maxBytes: MAX_IMAGE_BYTES,
      fetchImpl: () => Promise.resolve(new Response(new Uint8Array(8))),
    }); } catch (e) { error = (e as Error).message; }
    assert(error === 'OBJECT_SIZE_MISMATCH');
    let exists = true; try { await Deno.stat(path); } catch { exists = false; }
    assert(!exists);
  } finally { await Deno.remove(dir, { recursive: true }); }
});
Deno.test('image stream enforces actual 4MiB cap despite a forged Content-Length', async () => {
  const dir = await Deno.makeTempDir();
  try {
    let error = '';
    try { await downloadMediaVaultObject('https://local.invalid','test','nixes/owner/file',`${dir}/input`,{
      knownSize: 4, maxBytes: MAX_IMAGE_BYTES,
      fetchImpl: () => Promise.resolve(new Response(new Uint8Array(MAX_IMAGE_BYTES + 1),{ headers: { 'Content-Length': '4' } })),
    }); } catch (e) { error = (e as Error).message; }
    assert(error === 'input_size_limit');
  } finally { await Deno.remove(dir, { recursive: true }); }
});
Deno.test('exactly 4MiB downloaded image is accepted', async () => {
  const dir = await Deno.makeTempDir();
  try {
    const result = await downloadMediaVaultObject('https://local.invalid','test','nixes/owner/file',`${dir}/input`,{
      knownSize: MAX_IMAGE_BYTES, maxBytes: MAX_IMAGE_BYTES,
      fetchImpl: () => Promise.resolve(new Response(new Uint8Array(MAX_IMAGE_BYTES))),
    });
    assert(result.bytesWritten === MAX_IMAGE_BYTES && (await Deno.stat(result.path)).size === MAX_IMAGE_BYTES);
  } finally { await Deno.remove(dir, { recursive: true }); }
});
