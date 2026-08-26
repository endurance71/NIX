import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is required for the moderation evidence integrity check.');
  process.exit(1);
}

const sql = `
SELECT json_build_object(
  'missing_expiry', (
    SELECT COUNT(*) FROM public.content_reports
    WHERE evidence_path IS NOT NULL AND evidence_expires_at IS NULL
  ),
  'expired_with_file', (
    SELECT COUNT(*) FROM public.content_reports
    WHERE evidence_path IS NOT NULL
      AND evidence_deleted_at IS NULL
      AND evidence_expires_at <= NOW()
  ),
  'evidence_failed', (
    SELECT COUNT(*) FROM public.content_reports
    WHERE status = 'evidence_failed'
  ),
  'old_orphans', (
    SELECT COUNT(*) FROM storage.objects o
    WHERE o.bucket_id = 'moderation-evidence'
      AND o.created_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.content_reports r
        WHERE r.evidence_path = o.name
      )
  )
);
`;

const result = spawnSync('psql', [databaseUrl, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

let payload;
try {
  payload = JSON.parse(result.stdout.trim());
} catch (error) {
  console.error(`Could not parse integrity payload: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const missingExpiry = Number(payload.missing_expiry);
const expiredWithFile = Number(payload.expired_with_file);
const evidenceFailed = Number(payload.evidence_failed);
const oldOrphans = Number(payload.old_orphans);

console.log(
  [
    `missing_expiry=${missingExpiry}`,
    `expired_with_file=${expiredWithFile}`,
    `evidence_failed=${evidenceFailed}`,
    `old_orphans=${oldOrphans}`,
  ].join(' ')
);

if (missingExpiry !== 0) {
  console.error(`Release blocked: ${missingExpiry} evidence row(s) have a path without evidence_expires_at.`);
  process.exit(1);
}

console.log('Moderation evidence integrity passed: every stored proof has an expiry.');
