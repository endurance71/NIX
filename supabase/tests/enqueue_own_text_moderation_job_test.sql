BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

-- Upgrade path B deliberately preserves a pre-existing job and its payload.
-- Check that rejected requests add nothing instead of requiring an empty DB.
CREATE TEMP TABLE enqueue_before AS SELECT
  (SELECT COUNT(*)::integer FROM public.moderation_jobs) AS jobs,
  (SELECT COUNT(*)::integer FROM public.moderation_text_payloads) AS payloads;

SELECT throws_ok(
  $$SELECT public.enqueue_own_text_moderation_job(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Cześć',
    NULL
  )$$,
  'P0001',
  'UNAUTHORIZED',
  'enqueue_own without JWT is unauthorized'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  TRUE
);

SELECT throws_ok(
  $$SELECT public.enqueue_own_text_moderation_job(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Cześć',
    'client-1'
  )$$,
  'P0001',
  'MODERATION_DISABLED',
  'flag off raises MODERATION_DISABLED before inserting a job'
);

RESET ROLE;

SELECT is(
  (SELECT COUNT(*)::integer FROM public.moderation_jobs),
  (SELECT jobs FROM enqueue_before),
  'flag-off enqueue preserves the moderation_jobs count'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.moderation_text_payloads),
  (SELECT payloads FROM enqueue_before),
  'flag-off enqueue preserves the moderation_text_payloads count'
);

SELECT finish();
ROLLBACK;
