import { readFileSync } from 'node:fs';

const source = readFileSync('supabase/functions/cleanup-nix-due/index.ts', 'utf8');
const required = ['asset_id', 'archive_shared_media_nix', 'hasServiceRoleBearer'];
const missing = required.filter((token) => !source.includes(token));

if (missing.length) {
  console.error(`cleanup-nix-due contract is incomplete: ${missing.join(', ')}`);
  process.exit(1);
}
if (/storage\.from\([^)]*\)\.remove\(mediaPaths\)/s.test(source)) {
  console.error('cleanup-nix-due contains the legacy bulk media-path deletion.');
  process.exit(1);
}
console.log('cleanup-nix-due asset-aware/service-role contract passed.');
