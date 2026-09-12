BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

SELECT is(
  has_table_privilege('anon', 'public.moderation_jobs', 'SELECT'),
  FALSE,
  'anon cannot read moderation_jobs'
);

SELECT is(
  has_table_privilege('authenticated', 'public.moderation_jobs', 'SELECT'),
  FALSE,
  'authenticated cannot read moderation_jobs'
);

SELECT is(
  has_table_privilege('anon', 'public.moderation_text_payloads', 'SELECT'),
  FALSE,
  'anon cannot read moderation_text_payloads'
);

SELECT is(
  has_function_privilege('anon', 'public.enqueue_text_moderation_job(uuid, uuid, text, text)', 'EXECUTE'),
  FALSE,
  'anon cannot enqueue text moderation'
);

SELECT is(
  has_function_privilege('authenticated', 'public.claim_moderation_jobs(integer, text, integer)', 'EXECUTE'),
  FALSE,
  'authenticated cannot claim moderation jobs'
);

SELECT is(
  (SELECT private.pre_delivery_moderation_enabled()),
  FALSE,
  'pre_delivery_moderation defaults to disabled'
);

SELECT is(
  (
    SELECT COUNT(*)::integer
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND c.relname IN (
        'moderation_jobs',
        'moderation_text_payloads',
        'media_assets',
        'media_upload_batches'
      )
      AND p.proname = 'enqueue_push_notification_job'
  ),
  0,
  'pending/rejected/error moderation tables never enqueue push jobs'
);

SELECT cmp_ok(
  (
    SELECT COUNT(*)::integer
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND c.relname = 'nixes'
      AND p.proname = 'enqueue_push_notification_job'
  ),
  '>=',
  1,
  'nixes still enqueue push only after materialize INSERT'
);

SELECT cmp_ok(
  (
    SELECT COUNT(*)::integer
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND c.relname = 'text_messages'
      AND p.proname = 'enqueue_push_notification_job'
  ),
  '>=',
  1,
  'text_messages still enqueue push only after materialize INSERT'
);

SELECT is(
  has_function_privilege('authenticated', 'public.materialize_approved_media_batch(uuid)', 'EXECUTE'),
  FALSE,
  'clients cannot materialize approved media themselves'
);

SELECT is(
  has_function_privilege('anon', 'public.enqueue_own_text_moderation_job(uuid, text, text)', 'EXECUTE'),
  FALSE,
  'anon cannot enqueue own text moderation'
);

SELECT is(
  has_function_privilege('authenticated', 'public.enqueue_own_text_moderation_job(uuid, text, text)', 'EXECUTE'),
  TRUE,
  'authenticated can enqueue own text moderation'
);

SELECT is(
  has_function_privilege('authenticated', 'public.enqueue_text_moderation_job(uuid, uuid, text, text)', 'EXECUTE'),
  FALSE,
  'authenticated cannot call sender-spoofable enqueue_text_moderation_job'
);

SELECT is(
  (
    SELECT p.pronargs::integer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'enqueue_own_text_moderation_job'
      AND p.prosecdef
  ),
  3,
  'own enqueue has no p_sender_id argument'
);

SELECT finish();
ROLLBACK;
