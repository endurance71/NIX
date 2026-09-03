-- C3B F0 budget + recovery grants/RLS (local pgTAP only — never prod push).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

SELECT has_table('private', 'moderation_f0_ledger', 'f0 ledger exists');
SELECT has_table('private', 'moderation_f0_reservations', 'f0 reservations exist');
SELECT has_column('public', 'moderation_jobs', 'waiting_reason', 'waiting_reason column');
SELECT has_column('public', 'moderation_jobs', 'materialized_at', 'materialized_at column');

SELECT is(
  (SELECT relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'private' AND c.relname = 'moderation_f0_ledger'),
  true,
  'ledger RLS enabled'
);

SELECT is(
  has_table_privilege('anon', 'private.moderation_f0_ledger', 'SELECT'),
  FALSE,
  'anon cannot read f0 ledger'
);

SELECT is(
  has_function_privilege(
    'anon',
    'public.reserve_moderation_budget(text, integer, uuid, text, integer, integer)',
    'EXECUTE'
  ),
  FALSE,
  'anon cannot reserve budget'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.reserve_moderation_budget(text, integer, uuid, text, integer, integer)',
    'EXECUTE'
  ),
  FALSE,
  'authenticated cannot reserve budget'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.claim_approved_unmaterialized_moderation_jobs(text, integer)',
    'EXECUTE'
  ),
  FALSE,
  'authenticated cannot claim recovery jobs'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.reserve_moderation_budget(text, integer, uuid, text, integer, integer)',
    'EXECUTE'
  ),
  TRUE,
  'service_role can reserve budget'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.claim_approved_unmaterialized_moderation_jobs(text, integer)',
    'EXECUTE'
  ),
  TRUE,
  'service_role can recover unmaterialized'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.mark_moderation_job_materialized(uuid)',
    'EXECUTE'
  ),
  TRUE,
  'service_role can mark materialized'
);

-- Atomic budget behaviour as service_role
SET LOCAL ROLE service_role;

SELECT ok(
  (public.reserve_moderation_budget('text', 1, NULL, 'attempt-full', 4000, 3999)->>'ok')::boolean = false,
  'reserve fails when external_used leaves no room'
);

SELECT ok(
  (public.reserve_moderation_budget('image', 1, NULL, 'attempt-ok', 10, 0)->>'ok')::boolean,
  'service_role reserves within budget'
);

SELECT ok(
  (public.reserve_moderation_budget('image', 1, NULL, 'attempt-d1', 1, 0)->>'ok')::boolean, 'first unit of hard_budget=1 ok'
);
SELECT ok(
  (public.reserve_moderation_budget('image', 1, NULL, 'attempt-d2', 1, 0)->>'ok')::boolean = false,
  'parallel oversubscription second unit exhausted'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
