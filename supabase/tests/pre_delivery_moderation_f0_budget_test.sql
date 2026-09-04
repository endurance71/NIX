-- C3B F0 budget + recovery grants/RLS (local pgTAP only — never prod push).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(21);

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

-- Isolate ledger state for budget cases (do not inherit prior test residue).
DELETE FROM private.moderation_f0_reservations;
DELETE FROM private.moderation_f0_ledger;

SET LOCAL ROLE service_role;

-- Boundary: external_used=3999 → first unit ok, second exhausted.
SELECT ok(
  (public.reserve_moderation_budget('text', 1, NULL, 'bound-a', 4000, 3999)->>'ok')::boolean,
  '3999 + 1 reserve succeeds'
);

SELECT ok(
  (public.reserve_moderation_budget('text', 1, NULL, 'bound-b', 4000, 3999)->>'ok')::boolean = false,
  'next transaction after 3999+1 is exhausted'
);

-- Fresh ledger for small-cap oversubscription (hard_budget=1).
RESET ROLE;
DELETE FROM private.moderation_f0_reservations;
DELETE FROM private.moderation_f0_ledger;
SET LOCAL ROLE service_role;

SELECT ok(
  (public.reserve_moderation_budget('image', 1, NULL, 'cap-d1', 1, 0)->>'ok')::boolean,
  'first unit of hard_budget=1 ok'
);
SELECT ok(
  (public.reserve_moderation_budget('image', 1, NULL, 'cap-d2', 1, 0)->>'ok')::boolean = false,
  'second unit of hard_budget=1 exhausted'
);

-- Open-attempt idempotency vs free-retry after confirm.
RESET ROLE;
DELETE FROM private.moderation_f0_reservations;
DELETE FROM private.moderation_f0_ledger;
SET LOCAL ROLE service_role;

SELECT ok(
  (public.reserve_moderation_budget('text', 1, NULL, 'idem-open', 10, 0)->>'ok')::boolean,
  'initial reserve ok'
);

SELECT ok(
  COALESCE(
    (public.reserve_moderation_budget('text', 1, NULL, 'idem-open', 10, 0)->>'idempotent')::boolean,
    false
  ),
  'open attempt reserve is idempotent'
);

SELECT lives_ok(
  $$SELECT public.confirm_moderation_budget(
    (public.reserve_moderation_budget('text', 1, NULL, 'idem-open', 10, 0)->>'reservation_id')::uuid
  )$$,
  'confirm open reservation'
);

SELECT ok(
  (public.reserve_moderation_budget('text', 1, NULL, 'idem-open', 10, 0)->>'ok')::boolean = false,
  'confirmed attempt cannot free-retry'
);

SELECT is(
  public.reserve_moderation_budget('text', 1, NULL, 'idem-open', 10, 0)->>'reason',
  'attempt_already_terminal',
  'terminal attempt returns attempt_already_terminal'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
