import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const expected = [
  '20260714104841_remote_baseline.sql',
  '20260714220500_prepare_account_deletion.sql',
  '20260714221000_record_legal_acceptance.sql',
  '20260715095155_add_safety_moderation_and_age_gate.sql',
  '20260715160000_add_push_notifications.sql',
];

const actual = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
const failures = [];
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  failures.push(`active migration set differs: ${actual.join(', ')}`);
}

for (const file of actual) {
  const sql = await readFile(path.join(migrationsDir, file), 'utf8');
  if (/\bTRUNCATE\b/i.test(sql)) failures.push(`${file}: TRUNCATE is forbidden`);
  for (const match of sql.matchAll(/\bDELETE\s+FROM\b[\s\S]*?;/gi)) {
    if (!/\bWHERE\b/i.test(match[0])) failures.push(`${file}: DELETE without WHERE is forbidden`);
  }
}

const baseline = await readFile(path.join(migrationsDir, expected[0]), 'utf8');
for (const marker of [
  'on_auth_user_created',
  "'avatars', 'avatars'",
  "'media-vault', 'media-vault'",
  'supabase_realtime ADD TABLE public.friendships',
  'supabase_realtime ADD TABLE public.nixes',
]) {
  if (!baseline.includes(marker)) failures.push(`baseline is missing ${marker}`);
}

const safety = await readFile(path.join(migrationsDir, expected[3]), 'utf8');
for (const marker of [
  'private.safety_policy_config',
  'private.safety_policy_cohort',
  "DEFAULT 'cohort'",
  "age_gate_mode IN ('cohort', 'all')",
]) {
  if (!safety.includes(marker)) failures.push(`safety migration is missing ${marker}`);
}

const config = await readFile(path.join(root, 'supabase', 'config.toml'), 'utf8');
for (const name of [
  'cleanup-nix',
  'delete-account',
  'report-content',
  'block-user',
  'moderation-admin',
  'cleanup-moderation-evidence',
  'push-dispatch',
  'push-receipts',
]) {
  const escaped = name.replaceAll('-', '\\-');
  const section = new RegExp(`\\[functions\\.${escaped}\\][\\s\\S]*?verify_jwt\\s*=\\s*true`);
  if (!section.test(config)) failures.push(`config.toml must explicitly verify JWT for ${name}`);
}

const seed = await readFile(path.join(root, 'supabase', 'seed.sql'), 'utf8');
if (/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(seed)) failures.push('seed.sql must remain data-free');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Supabase migration safety checks passed.');
