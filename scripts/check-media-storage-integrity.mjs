import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is required for the production media integrity release check.');
  process.exit(1);
}

const sql = `select count(*) from public.nixes n
join public.media_assets a on a.id = n.asset_id
left join storage.objects o on o.bucket_id = 'media-vault' and o.name = a.storage_path
where n.asset_id is not null and n.status in ('sent','viewed','cleanup_failed') and o.id is null;`;
const result = spawnSync('psql', [databaseUrl, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
const count = Number(result.stdout.trim());
if (count !== 0) {
  console.error(`Release blocked: ${count} active NiX record(s) have no Storage object.`);
  process.exit(1);
}
console.log('Media/Storage integrity passed: zero active NiX records without objects.');
