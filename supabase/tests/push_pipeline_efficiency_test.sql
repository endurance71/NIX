BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(19);

-- Cron commands point at the guarded wrappers, same names and schedules.
SELECT is(
  (SELECT schedule || ' ' || command FROM cron.job WHERE jobname = 'push-dispatch'),
  '* * * * * SELECT private.invoke_push_dispatch_if_due();',
  'push-dispatch cron only posts when jobs are due'
);
SELECT is(
  (SELECT schedule || ' ' || command FROM cron.job WHERE jobname = 'push-receipts'),
  '*/5 * * * * SELECT private.invoke_push_receipts_if_due();',
  'push-receipts cron only posts when receipts are due'
);
SELECT is(
  (SELECT schedule || ' ' || command FROM cron.job WHERE jobname = 'cleanup-nix-due'),
  '*/2 * * * * SELECT private.invoke_cleanup_nix_due_if_due();',
  'cleanup-nix-due cron only posts when cleanup is due'
);
SELECT is(
  (SELECT count(*)::integer FROM cron.job WHERE jobname IN ('push-dispatch', 'push-receipts', 'cleanup-nix-due')),
  3,
  'no duplicate cron jobs'
);

-- Wrappers are invoker functions callable only by the owner (cron runs as postgres).
SELECT is(
  (SELECT bool_or(p.prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'private' AND p.proname IN (
     'push_dispatch_has_due_jobs', 'push_receipts_has_due_deliveries', 'cleanup_nix_has_due_items',
     'invoke_push_dispatch_if_due', 'invoke_push_receipts_if_due', 'invoke_cleanup_nix_due_if_due')),
  false,
  'guard functions are SECURITY INVOKER'
);
SELECT is(has_function_privilege('anon', 'private.invoke_push_dispatch_if_due()', 'EXECUTE'), false, 'anon cannot invoke push dispatch guard');
SELECT is(has_function_privilege('authenticated', 'private.invoke_cleanup_nix_due_if_due()', 'EXECUTE'), false, 'authenticated cannot invoke cleanup guard');
SELECT is(has_function_privilege('authenticated', 'private.push_dispatch_has_due_jobs()', 'EXECUTE'), false, 'authenticated cannot probe push queue');

-- When nothing is due the guard returns NULL without calling net.http_post.
-- (Guarded by CASE so a row from another local test never triggers a POST.)
SELECT ok(
  CASE WHEN private.push_dispatch_has_due_jobs() THEN true ELSE private.invoke_push_dispatch_if_due() IS NULL END,
  'idle push-dispatch guard does not post'
);
SELECT ok(
  CASE WHEN private.push_receipts_has_due_deliveries() THEN true ELSE private.invoke_push_receipts_if_due() IS NULL END,
  'idle push-receipts guard does not post'
);
SELECT ok(
  CASE WHEN private.cleanup_nix_has_due_items() THEN true ELSE private.invoke_cleanup_nix_due_if_due() IS NULL END,
  'idle cleanup guard does not post'
);

-- Predicates mirror the Edge Function queries.
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
VALUES
('f9100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-eff-a@example.invalid','x',now(),'{}','{}'),
('f9100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-eff-b@example.invalid','x',now(),'{}','{}');

-- Skip the INSERT webhook trigger (it would queue a pg_net call) for fixtures.
SET LOCAL session_replication_role = replica;

INSERT INTO public.push_notification_jobs(id,event_type,event_key,recipient_id,actor_id,entity_id,status,attempts,next_attempt_at,locked_at)
VALUES
('f9200000-0000-4000-8000-000000000001','new_text_message','push-eff:future','f9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002',gen_random_uuid(),'pending',0,now() + interval '10 minutes',NULL),
('f9200000-0000-4000-8000-000000000002','new_text_message','push-eff:exhausted','f9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002',gen_random_uuid(),'failed',5,now() - interval '1 minute',NULL),
('f9200000-0000-4000-8000-000000000003','new_text_message','push-eff:fresh-lock','f9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002',gen_random_uuid(),'processing',1,now() - interval '1 minute',now() - interval '1 minute');

-- Future, exhausted (attempts = 5) and freshly locked jobs are not due.
-- Rows from other local fixtures (none expected) would make this vacuous, not flaky.
SELECT ok(
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.push_notification_jobs j
      WHERE j.id::text NOT LIKE 'f92%'
        AND j.attempts < 5
        AND ((j.status IN ('pending','failed') AND j.next_attempt_at <= now())
          OR (j.status = 'processing' AND j.locked_at < now() - interval '5 minutes'))
    ) THEN true
    ELSE NOT private.push_dispatch_has_due_jobs()
  END,
  'future, exhausted and freshly locked jobs are not due'
);

UPDATE public.push_notification_jobs SET locked_at = now() - interval '6 minutes'
WHERE id = 'f9200000-0000-4000-8000-000000000003';
SELECT ok(private.push_dispatch_has_due_jobs(), 'stale processing lock counts as due (same as claim)');

UPDATE public.push_notification_jobs SET status = 'dispatched', locked_at = NULL
WHERE id = 'f9200000-0000-4000-8000-000000000003';
UPDATE public.push_notification_jobs SET next_attempt_at = now() - interval '1 second'
WHERE id = 'f9200000-0000-4000-8000-000000000001';
SELECT ok(private.push_dispatch_has_due_jobs(), 'pending job past next_attempt_at is due');

INSERT INTO public.push_devices(id,installation_id,user_id,expo_push_token,platform,locale)
VALUES('f9300000-0000-4000-8000-000000000001',gen_random_uuid(),'f9100000-0000-4000-8000-000000000001','ExponentPushToken[push-eff-fixture-0001]','ios','pl');
INSERT INTO public.push_notification_deliveries(job_id,device_id,status,next_receipt_check_at)
VALUES('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','ticketed',now() - interval '1 second');
SELECT ok(private.push_receipts_has_due_deliveries(), 'ticketed delivery past its receipt check is due');

INSERT INTO public.nixes(id,sender_id,receiver_id,media_path)
VALUES('f9400000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002','f9100000-0000-4000-8000-000000000001','nixes/f9100000-0000-4000-8000-000000000002/push-eff.jpg');
INSERT INTO public.nix_cleanup_queue(nix_id,receiver_id,media_path,next_attempt_at)
VALUES('f9400000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','nixes/f9100000-0000-4000-8000-000000000002/push-eff.jpg',now() - interval '1 second');
SELECT ok(private.cleanup_nix_has_due_items(), 'cleanup row past next_attempt_at is due');

SELECT has_index('public', 'nix_cleanup_queue', 'nix_cleanup_queue_next_attempt_idx', 'cleanup queue has a next_attempt_at index');

-- The INSERT webhook path is untouched.
SELECT is(
  (SELECT p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.push_notification_jobs'::regclass AND t.tgname = 'push_jobs_dispatch_webhook'),
  'trigger_push_dispatch',
  'insert webhook still calls the unguarded dispatcher'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'private' AND p.proname IN ('invoke_push_dispatch', 'invoke_push_receipts', 'invoke_cleanup_nix_due') AND p.prosecdef),
  3,
  'underlying http_post invokers are unchanged'
);

SELECT * FROM finish();
ROLLBACK;
