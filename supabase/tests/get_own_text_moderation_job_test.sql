BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

SELECT throws_ok(
  $$SELECT public.get_own_text_moderation_job('00000000-0000-0000-0000-000000000001')$$,
  'UNAUTHORIZED',
  'anon/no jwt cannot read a moderation job'
);

SELECT is(
  has_function_privilege('anon', 'public.get_own_text_moderation_job(uuid)', 'EXECUTE'),
  false,
  'anon cannot EXECUTE get_own_text_moderation_job'
);

SELECT is(
  has_function_privilege('authenticated', 'public.get_own_text_moderation_job(uuid)', 'EXECUTE'),
  true,
  'authenticated can EXECUTE get_own_text_moderation_job'
);

SELECT is(
  (
    SELECT pg_get_functiondef('public.get_own_text_moderation_job(uuid)'::regprocedure)
    NOT LIKE '%p_body%'
    AND pg_get_functiondef('public.get_own_text_moderation_job(uuid)'::regprocedure)
    NOT LIKE '%selected.body%'
  ),
  true,
  'get_own_text_moderation_job definition does not return a body column'
);

SELECT * FROM finish();
ROLLBACK;
