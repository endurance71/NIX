import { spawnSync } from 'node:child_process';

function resolveLocalDatabaseUrl() {
  const explicit = process.env.SUPABASE_DB_URL?.trim();
  if (explicit) return explicit;

  const status = spawnSync('npx', ['-y', 'supabase@latest', 'status', '--output', 'json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (status.status !== 0) {
    console.error('Local Supabase is not running and SUPABASE_DB_URL is unset.');
    process.exit(1);
  }

  try {
    const parsed = JSON.parse(status.stdout);
    const dbUrl = parsed.DB_URL?.trim();
    if (!dbUrl) throw new Error('missing DB_URL');
    console.warn(`Using local Supabase DB from CLI status: ${dbUrl}`);
    return dbUrl;
  } catch (error) {
    console.error(`Could not parse local Supabase status: ${error.message}`);
    process.exit(1);
  }
}

process.env.SUPABASE_DB_URL = resolveLocalDatabaseUrl();
await import('./check-media-storage-integrity.mjs');
