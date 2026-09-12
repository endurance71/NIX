BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

SELECT is(
  (
    SELECT pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conname = 'moderation_jobs_target_chk'
      AND conrelid = 'public.moderation_jobs'::regclass
  ) LIKE '%approved%',
  true,
  'text jobs may drop payload after a terminal moderation status'
);

SELECT is(
  pg_get_functiondef('public.finalize_media_upload_batch(uuid, text)'::regprocedure)
    ~* 'UPDATE\s+public\.media_assets[\s\S]*?SET\s+[^;]*updated_at',
  false,
  'finalize does not set media_assets.updated_at'
);

SELECT is(
  pg_get_functiondef('public.materialize_approved_text_message(uuid)'::regprocedure)
    LIKE '%materialized_at = NOW()%',
  true,
  'text materialize stamps materialized_at before deleting payload'
);

SELECT is(
  (
    SELECT pg_get_functiondef('public.get_own_text_moderation_job(uuid)'::regprocedure)
      LIKE '%materialized_at IS NOT NULL%'
  ),
  false,
  'get_own returns a delivered messageId without requiring materialized_at'
);

SELECT * FROM finish();
ROLLBACK;
