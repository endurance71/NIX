BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

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
  0,
  'flag-off enqueue leaves moderation_jobs empty'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.moderation_text_payloads),
  0,
  'flag-off enqueue leaves moderation_text_payloads empty'
);

SELECT finish();
ROLLBACK;
