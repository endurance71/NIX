import { cleanupCanonicalNix, type CleanupService } from './nix-cleanup.ts';
function assert(value: unknown): asserts value { if (!value) throw new Error('assertion_failed'); }
function harness(shouldDelete = true, removeError = false, prepareError = false) {
  const paths: string[] = [];
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const service: CleanupService = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data: name === 'prepare_nix_cleanup'
        ? [{ storage_path: 'nixes/canonical/object.jpg', should_delete: shouldDelete, asset_id: 'asset' }] : null,
        error: prepareError && name === 'prepare_nix_cleanup' ? { message: 'REPLAY_WINDOW_ACTIVE' } : null });
    },
    storage: { from: () => ({ remove(input) { paths.push(...input); return Promise.resolve({ error: removeError ? { message: 'network' } : null }); } }) },
  };
  return { service, paths, calls };
}
Deno.test('canonical cleanup removes only server-derived target and ACKs after Storage', async () => {
  const h = harness();
  const result = await cleanupCanonicalNix(h.service, 'nix');
  assert(result.deleted && h.paths.join() === 'nixes/canonical/object.jpg');
  assert(h.calls[1].name === 'finish_nix_cleanup' && h.calls[1].args.p_removed === true);
});
Deno.test('shared active reference archives without physical deletion', async () => {
  const h = harness(false);
  assert(!(await cleanupCanonicalNix(h.service, 'nix')).deleted);
  assert(h.paths.length === 0 && h.calls[1].args.p_removed === false);
});
Deno.test('Storage failure persists retry without success ACK', async () => {
  const h = harness(true, true);
  let failed = false;
  try { await cleanupCanonicalNix(h.service, 'nix'); } catch { failed = true; }
  assert(failed && h.calls[1].args.p_removed === false && h.calls[1].args.p_error === 'network');
});
Deno.test('replay guard failure never reaches Storage', async () => {
  const h = harness(true, false, true);
  try { await cleanupCanonicalNix(h.service, 'nix'); } catch { /* expected */ }
  assert(h.paths.length === 0 && h.calls.length === 1);
});
