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
  '20260715170000_remove_redundant_service_role_policies.sql',
  '20260722193000_enable_push_dispatch_pipeline.sql',
  '20260723193000_profile_display_name_and_privacy.sql',
  '20260724092500_update_public_profile_rpcs_add_display_name.sql',
  '20260724120000_add_text_messages_realtime_chat.sql',
  '20260724123000_schedule_cleanup_text_messages.sql',
  '20260724150000_add_message_reactions.sql',
  '20260724160000_add_message_reaction_push.sql',
  '20260724170000_fix_enqueue_push_nested_table_guards.sql',
  '20260725124500_capture_attempt.sql',
  '20260725184349_replay_and_cleanup.sql',
  '20260725184405_replay_and_cleanup_cron.sql',
  '20260725184420_fix_replay_unlimited.sql',
  '20260728120000_durable_shared_media_uploads.sql',
  '20260728121000_schedule_media_upload_orphan_cleanup.sql',
  '20260728122000_fix_capture_attempt_idempotency.sql',
  '20260729120000_ios_product_roadmap.sql',
  '20260729121000_schedule_data_export_worker.sql',
  '20260729122000_fix_read_state_rpc.sql',
  '20260729123000_harden_product_analytics_properties.sql',
  '20260801120000_profile_bio.sql',
  '20260810190000_stable_push_device_registration.sql',
  '20260810194500_mark_nix_unplayable.sql',
  '20260820080300_repair_missing_shared_media_references.sql',
  '20260825195500_text_message_safety_filter.sql',
  '20260826120000_content_report_text_target_and_evidence_retention.sql',
  '20260827104500_moderation_evidence_allow_json.sql',
  '20260827120000_content_report_evidence_expiry_check_and_drop_v1.sql',
  '20260827125000_schedule_cleanup_moderation_evidence.sql',
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

const captureAttemptFix = await readFile(
  path.join(migrationsDir, '20260728122000_fix_capture_attempt_idempotency.sql'),
  'utf8'
);
for (const marker of [
  'CREATE OR REPLACE FUNCTION public.report_capture_attempt',
  'ON CONFLICT (sender_id, receiver_id, client_message_id)',
  'WHERE client_message_id IS NOT NULL',
]) {
  if (!captureAttemptFix.includes(marker)) {
    failures.push(`capture-attempt idempotency fix is missing ${marker}`);
  }
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

const hardening = await readFile(path.join(migrationsDir, expected[5]), 'utf8');
for (const policy of [
  'friend_invites_update',
  'nix_cleanup_audit_insert',
  'nix_cleanup_audit_select',
  'nix_cleanup_queue_delete',
  'upload_logs_delete',
  'storage_delete',
]) {
  if (!hardening.includes(`DROP POLICY IF EXISTS ${policy}`)) {
    failures.push(`service-role hardening migration does not remove ${policy}`);
  }
}
if (/auth\.role\(\)\s*=\s*'service_role'/i.test(hardening)) {
  failures.push('service-role hardening migration must not recreate service-role RLS predicates');
}
for (const marker of [
  'CREATE OR REPLACE FUNCTION public.delete_my_conversation_with_peer',
  'DELETE FROM public.nixes',
  'CREATE OR REPLACE FUNCTION public.get_capture_policy_for_sender',
  'FROM public.nix_capture_prefs',
]) {
  if (!hardening.includes(marker)) failures.push(`RPC rename hardening is missing ${marker}`);
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
  'cleanup-text-messages',
  'cleanup-nix-due',
  'begin-media-upload',
  'finalize-media-upload',
  'cancel-media-upload',
  'cleanup-media-upload-orphans',
  'data-export-download',
  'process-data-exports',
]) {
  const escaped = name.replaceAll('-', '\\-');
  const section = new RegExp(`\\[functions\\.${escaped}\\][\\s\\S]*?verify_jwt\\s*=\\s*true`);
  if (!section.test(config)) failures.push(`config.toml must explicitly verify JWT for ${name}`);
}

const durableUploads = await readFile(
  path.join(migrationsDir, '20260728120000_durable_shared_media_uploads.sql'),
  'utf8'
);
for (const marker of [
  'CREATE TABLE IF NOT EXISTS public.media_assets',
  'CREATE TABLE IF NOT EXISTS public.media_upload_batches',
  'CREATE TABLE IF NOT EXISTS public.media_upload_recipients',
  'CREATE OR REPLACE FUNCTION public.begin_media_upload_batch',
  'CREATE OR REPLACE FUNCTION public.finalize_media_upload_batch',
  'CREATE OR REPLACE FUNCTION public.archive_shared_media_nix',
  'CREATE OR REPLACE FUNCTION public.archive_blocked_shared_media',
  "n.status IN ('sent', 'viewed', 'cleanup_failed')",
  'ADD COLUMN IF NOT EXISTS asset_id',
]) {
  if (!durableUploads.includes(marker)) {
    failures.push(`durable upload migration is missing ${marker}`);
  }
}

const analyticsHardening = await readFile(
  path.join(migrationsDir, '20260729123000_harden_product_analytics_properties.sql'),
  'utf8'
);
for (const marker of [
  'CREATE OR REPLACE FUNCTION public.record_product_analytics_event',
  "property.key NOT IN ('channel', 'enabled', 'has_results', 'outcome', 'source', 'step')",
  "jsonb_typeof(property.value) NOT IN ('null', 'boolean', 'number', 'string')",
  "RAISE EXCEPTION 'Unsupported analytics properties'",
]) {
  if (!analyticsHardening.includes(marker)) {
    failures.push(`analytics hardening migration is missing ${marker}`);
  }
}

const textSafetyFilter = await readFile(
  path.join(migrationsDir, '20260825195500_text_message_safety_filter.sql'),
  'utf8'
);
for (const marker of [
  'CREATE OR REPLACE FUNCTION private.text_message_passes_safety_filter',
  'text_messages_safety_filter_chk',
  'CHECK (private.text_message_passes_safety_filter(body))',
  "COMMENT ON FUNCTION private.text_message_passes_safety_filter(text) IS",
]) {
  if (!textSafetyFilter.includes(marker)) {
    failures.push(`text message safety filter migration is missing ${marker}`);
  }
}

const reportV2 = await readFile(
  path.join(migrationsDir, '20260826120000_content_report_text_target_and_evidence_retention.sql'),
  'utf8'
);
for (const marker of [
  'ADD COLUMN IF NOT EXISTS text_message_id',
  'REFERENCES public.text_messages(id) ON DELETE SET NULL',
  'idx_content_reports_reporter_text_message_unique',
  'content_reports_single_content_target',
  'CREATE OR REPLACE FUNCTION public.create_content_report_v2',
  'Invalid legacy reported user',
  'CREATE OR REPLACE FUNCTION public.list_moderation_evidence_orphans',
  "evidence_expires_at = created_at + INTERVAL '30 days'",
  'ORDER BY o.created_at ASC',
  'LIMIT 200',
]) {
  if (!reportV2.includes(marker)) {
    failures.push(`content report v2 migration is missing ${marker}`);
  }
}
if (/ADD CONSTRAINT\s+content_reports_evidence_requires_expiry/i.test(reportV2)) {
  failures.push(
    'expand must not add content_reports_evidence_requires_expiry (ships in follow-up contract PR)'
  );
}

const moderationCleanupCron = await readFile(
  path.join(migrationsDir, '20260827125000_schedule_cleanup_moderation_evidence.sql'),
  'utf8'
);
for (const marker of [
  'CREATE OR REPLACE FUNCTION private.moderation_cleanup_auth_headers',
  'CREATE OR REPLACE FUNCTION private.invoke_cleanup_moderation_evidence',
  "WHERE ds.name = 'moderation_cleanup_secret'",
  'x-cleanup-secret',
  "jobname = 'cleanup-moderation-evidence'",
  "'27 4 * * *'",
]) {
  if (!moderationCleanupCron.includes(marker)) {
    failures.push(`moderation cleanup cron migration is missing ${marker}`);
  }
}
if (
  /vault\.create_secret/i.test(moderationCleanupCron) ||
  /MODERATION_CLEANUP_SECRET\s*=/i.test(moderationCleanupCron)
) {
  failures.push('moderation cleanup cron must not embed Vault or Edge secret values');
}

const evidenceJsonMime = await readFile(
  path.join(migrationsDir, '20260827104500_moderation_evidence_allow_json.sql'),
  'utf8'
);
for (const marker of [
  "WHERE id = 'moderation-evidence'",
  "'application/json'",
]) {
  if (!evidenceJsonMime.includes(marker)) {
    failures.push(`moderation-evidence JSON mime migration is missing ${marker}`);
  }
}
if (evidenceJsonMime.includes('application/json') === false) {
  failures.push('moderation-evidence JSON mime migration is missing application/json');
}

const contract = await readFile(
  path.join(migrationsDir, '20260827120000_content_report_evidence_expiry_check_and_drop_v1.sql'),
  'utf8'
);
for (const marker of [
  'content_reports_evidence_requires_expiry',
  'CHECK (evidence_path IS NULL OR evidence_expires_at IS NOT NULL)',
  'DROP FUNCTION IF EXISTS public.create_content_report(TEXT, UUID, UUID, TEXT)',
]) {
  if (!contract.includes(marker)) {
    failures.push(`content report contract migration is missing ${marker}`);
  }
}

const seed = await readFile(path.join(root, 'supabase', 'seed.sql'), 'utf8');
if (/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(seed)) failures.push('seed.sql must remain data-free');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Supabase migration safety checks passed.');
