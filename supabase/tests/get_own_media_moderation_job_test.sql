BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

SELECT throws_ok(
  $$SELECT public.get_own_media_moderation_job('00000000-0000-0000-0000-000000000001')$$,
  'UNAUTHORIZED',
  'anon/no jwt cannot read a media moderation job'
);

SELECT is(
  has_function_privilege('anon', 'public.get_own_media_moderation_job(uuid)', 'EXECUTE'),
  false,
  'anon cannot EXECUTE get_own_media_moderation_job'
);

SELECT is(
  has_function_privilege('authenticated', 'public.get_own_media_moderation_job(uuid)', 'EXECUTE'),
  true,
  'authenticated can EXECUTE get_own_media_moderation_job'
);

SELECT is(
  (
    SELECT pg_get_functiondef('public.get_own_media_moderation_job(uuid)'::regprocedure)
    NOT LIKE '%storage_path%'
    AND pg_get_functiondef('public.get_own_media_moderation_job(uuid)'::regprocedure)
    NOT LIKE '%thumbnail_b64%'
  ),
  true,
  'get_own_media_moderation_job definition does not return media bytes'
);

SELECT * FROM finish();
ROLLBACK;
