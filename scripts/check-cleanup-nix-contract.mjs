import { readFileSync } from 'node:fs';

const edge = readFileSync('supabase/functions/cleanup-nix-due/index.ts', 'utf8');
const worker = readFileSync('supabase/functions/_shared/nix-cleanup.ts', 'utf8');
const schema = readFileSync('supabase/migrations/20261007120000_harden_media_friendships_and_cleanup.sql', 'utf8');
const required = [
  [edge, 'cleanupCanonicalNix'], [edge, 'hasServiceRoleBearer'],
  [worker, 'prepare_nix_cleanup'], [worker, 'finish_nix_cleanup'],
  [worker, 'remove([row.storage_path])'], [schema, 'request_nix_cleanup'],
  [schema, 'REPLAY_WINDOW_ACTIVE'], [schema, 'REVOKE INSERT, UPDATE, DELETE ON public.nix_cleanup_queue'],
];
const missing = required.filter(([source, token]) => !source.includes(token)).map(([, token]) => token);
if (missing.length) throw new Error(`Canonical cleanup contract is incomplete: ${missing.join(', ')}`);
if (/remove\(\[item\.media_path\]\)/.test(edge)) throw new Error('Cleanup uses an untrusted queue path');
console.log('Canonical cleanup static contract passed; SQL/RPC/Storage behavior is tested separately.');
