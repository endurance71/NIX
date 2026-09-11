import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is required for the moderation SLA check.');
  process.exit(1);
}

const sql = `
SELECT json_build_object(
  'open_total', (
    SELECT COUNT(*) FROM public.content_reports
    WHERE status IN ('open', 'in_review', 'escalated', 'evidence_failed')
  ),
  'critical_ack_overdue', (
    SELECT COUNT(*) FROM public.content_reports
    WHERE priority = 'critical'
      AND status IN ('open', 'in_review', 'escalated', 'evidence_failed')
      AND created_at < NOW() - INTERVAL '2 hours'
      AND acknowledged_at IS NULL
  ),
  'critical_decision_overdue', (
    SELECT COUNT(*) FROM public.content_reports
    WHERE priority = 'critical'
      AND status IN ('open', 'in_review', 'escalated', 'evidence_failed')
      AND created_at < NOW() - INTERVAL '12 hours'
      AND resolved_at IS NULL
  ),
  'normal_ack_overdue', (
    SELECT COUNT(*) FROM public.content_reports
    WHERE priority = 'normal'
      AND status IN ('open', 'in_review', 'escalated', 'evidence_failed')
      AND created_at < NOW() - INTERVAL '24 hours'
      AND acknowledged_at IS NULL
  ),
  'normal_decision_overdue', (
    SELECT COUNT(*) FROM public.content_reports
    WHERE priority = 'normal'
      AND status IN ('open', 'in_review', 'escalated', 'evidence_failed')
      AND created_at < NOW() - INTERVAL '72 hours'
      AND resolved_at IS NULL
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
  console.error(`Could not parse SLA payload: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const criticalAck = Number(payload.critical_ack_overdue);
const criticalDecision = Number(payload.critical_decision_overdue);
const normalAck = Number(payload.normal_ack_overdue);
const normalDecision = Number(payload.normal_decision_overdue);

console.log(
  [
    `open_total=${payload.open_total}`,
    `critical_ack_overdue=${criticalAck}`,
    `critical_decision_overdue=${criticalDecision}`,
    `normal_ack_overdue=${normalAck}`,
    `normal_decision_overdue=${normalDecision}`,
  ].join(' ')
);

if (criticalAck + criticalDecision + normalAck + normalDecision > 0) {
  console.error('Release blocked: content reports are past the 1.2 SLA window.');
  console.error('Record counts only in ~/.nix-ops/ — never copy report bodies into Git.');
  process.exit(1);
}

console.log('Moderation SLA check passed: no open reports past ack/decision windows.');
