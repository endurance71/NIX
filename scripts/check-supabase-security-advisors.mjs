import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is required for the production Supabase security advisors check.');
  process.exit(1);
}

const sql = `
WITH security_definer_functions AS (
  SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS fqname,
    p.oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private', 'moderation')
    AND p.prokind = 'f'
    AND p.prosecdef = true
),
violations AS (
  SELECT
    f.fqname,
    grantee.rolname AS grantee
  FROM security_definer_functions f
  CROSS JOIN (VALUES ('anon'), ('PUBLIC')) AS grantees(grantee)
  JOIN pg_roles grantee ON grantee.rolname = grantees.grantee
  WHERE has_function_privilege(grantee.oid, f.oid, 'EXECUTE')
  UNION ALL
  SELECT
    f.fqname,
    'authenticated'::name AS grantee
  FROM security_definer_functions f
  WHERE f.function_name = 'enqueue_push_notification_job'
    AND has_function_privilege('authenticated', f.oid, 'EXECUTE')
)
SELECT COALESCE(json_agg(json_build_object('function', fqname, 'grantee', grantee)), '[]'::json)::text
FROM violations;
`;

const result = spawnSync('psql', [databaseUrl, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const violations = JSON.parse(result.stdout.trim() || '[]');
if (violations.length > 0) {
  console.error('Release blocked: SECURITY DEFINER functions with forbidden EXECUTE grants:');
  for (const violation of violations) {
    console.error(`- ${violation.function} granted to ${violation.grantee}`);
  }
  process.exit(1);
}

console.log('Supabase security advisors check passed: no anon/PUBLIC SECURITY DEFINER EXECUTE grants.');
