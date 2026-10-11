-- SEND-8: client creation time of a media send is clamped on begin and used
-- for the delivered nix timestamp; older clients (no value) keep server time.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(24);

INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
VALUES
('5e8d0000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','send8-a@example.invalid','x',now(),'{}','{}'),
('5e8d0000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','send8-b@example.invalid','x',now(),'{}','{}'),
('5e8d0000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','send8-c@example.invalid','x',now(),'{}','{}');
INSERT INTO public.friendships(user_id,friend_id,status) VALUES
('5e8d0000-0000-4000-8000-000000000001','5e8d0000-0000-4000-8000-000000000002','accepted'),
('5e8d0000-0000-4000-8000-000000000001','5e8d0000-0000-4000-8000-000000000003','accepted');

SELECT has_column('public','media_upload_batches','client_created_at','batches store the client creation time');
SELECT col_is_null('public','media_upload_batches','client_created_at','client creation time is optional');
SELECT has_function('public','begin_media_upload_batch',
  ARRAY['text','text','text','text','bigint','text','integer','text','jsonb','timestamp with time zone'],
  'begin accepts p_client_created_at');
SELECT hasnt_function('public','begin_media_upload_batch',
  ARRAY['text','text','text','text','bigint','text','integer','text','jsonb'],
  'no ambiguous nine-argument overload remains');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"5e8d0000-0000-4000-8000-000000000001","role":"authenticated"}',true);

SELECT lives_ok($$SELECT * FROM public.begin_media_upload_batch('send8-in-window',repeat('b',64),'image','image/jpeg',32,'jpg',NULL,NULL,
  '[{"receiverId":"5e8d0000-0000-4000-8000-000000000002","viewDurationSec":5,"sequenceIndex":0},{"receiverId":"5e8d0000-0000-4000-8000-000000000003","viewDurationSec":5,"sequenceIndex":1}]',
  NOW() - INTERVAL '5 minutes')$$,'begin with an in-window client time');
SELECT lives_ok($$SELECT * FROM public.begin_media_upload_batch('send8-too-old',repeat('b',64),'image','image/jpeg',32,'jpg',NULL,NULL,
  '[{"receiverId":"5e8d0000-0000-4000-8000-000000000002","viewDurationSec":5}]',
  NOW() - INTERVAL '1 hour')$$,'begin with a stale client time');
SELECT lives_ok($$SELECT * FROM public.begin_media_upload_batch('send8-future',repeat('b',64),'image','image/jpeg',32,'jpg',NULL,NULL,
  '[{"receiverId":"5e8d0000-0000-4000-8000-000000000002","viewDurationSec":5}]',
  NOW() + INTERVAL '1 hour')$$,'begin with a future client time');
SELECT lives_ok($$SELECT * FROM public.begin_media_upload_batch('send8-legacy',repeat('b',64),'image','image/jpeg',32,'jpg',NULL,NULL,
  '[{"receiverId":"5e8d0000-0000-4000-8000-000000000002","viewDurationSec":5}]')$$,'older Edge call with nine arguments still works');
SELECT lives_ok($$SELECT * FROM public.begin_media_upload_batch('send8-in-window',repeat('b',64),'image','image/jpeg',32,'jpg',NULL,NULL,
  '[{"receiverId":"5e8d0000-0000-4000-8000-000000000002","viewDurationSec":5,"sequenceIndex":0},{"receiverId":"5e8d0000-0000-4000-8000-000000000003","viewDurationSec":5,"sequenceIndex":1}]',
  NOW() - INTERVAL '1 minute')$$,'idempotent begin retry');
RESET ROLE;

SELECT is((SELECT client_created_at FROM public.media_upload_batches WHERE idempotency_key='send8-in-window'),
  NOW() - INTERVAL '5 minutes','in-window client time is stored as sent and a retry does not move it');
SELECT is((SELECT client_created_at FROM public.media_upload_batches WHERE idempotency_key='send8-too-old'),
  NOW() - INTERVAL '15 minutes','stale client time is clamped to now() - 15 minutes');
SELECT is((SELECT client_created_at FROM public.media_upload_batches WHERE idempotency_key='send8-future'),
  NOW(),'future client time is clamped to now()');
SELECT is((SELECT client_created_at FROM public.media_upload_batches WHERE idempotency_key='send8-legacy'),
  NULL::timestamptz,'no client time keeps NULL');
SELECT throws_ok($$UPDATE public.media_upload_batches SET client_created_at = created_at - INTERVAL '16 minutes' WHERE idempotency_key='send8-legacy'$$,
  '23514',NULL,'the table rejects a client time outside the window');

-- Moderation on: approved jobs materialize through materialize_approved_media_batch.
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled=true WHERE singleton;
UPDATE public.media_assets a SET status='moderation_pending'
FROM public.media_upload_batches b
WHERE b.asset_id = a.id AND b.idempotency_key IN ('send8-in-window','send8-legacy');
UPDATE public.media_upload_batches SET status='moderation_pending'
WHERE idempotency_key IN ('send8-in-window','send8-legacy')
  AND sender_id='5e8d0000-0000-4000-8000-000000000001';
INSERT INTO public.moderation_jobs(id,content_kind,batch_id,asset_id,sender_id,status)
SELECT CASE b.idempotency_key
    WHEN 'send8-in-window' THEN '5e8d4000-0000-4000-8000-000000000001'::uuid
    ELSE '5e8d4000-0000-4000-8000-000000000002'::uuid
  END,
  'media',b.id,b.asset_id,b.sender_id,'approved'
FROM public.media_upload_batches b
WHERE b.idempotency_key IN ('send8-in-window','send8-legacy')
  AND b.sender_id='5e8d0000-0000-4000-8000-000000000001';

SELECT lives_ok($$SELECT public.materialize_approved_media_batch('5e8d4000-0000-4000-8000-000000000001')$$,'client-dated batch materializes');
SELECT lives_ok($$SELECT public.materialize_approved_media_batch('5e8d4000-0000-4000-8000-000000000002')$$,'legacy batch materializes');

SELECT is((SELECT n.created_at FROM public.nixes n JOIN public.media_upload_batches b ON n.client_upload_id = b.id::text
    WHERE b.idempotency_key='send8-in-window' AND n.receiver_id='5e8d0000-0000-4000-8000-000000000002'),
  NOW() - INTERVAL '5 minutes','nix is stamped with the client creation time');
SELECT is((SELECT n.created_at FROM public.nixes n JOIN public.media_upload_batches b ON n.client_upload_id = b.id::text
    WHERE b.idempotency_key='send8-in-window' AND n.receiver_id='5e8d0000-0000-4000-8000-000000000003'),
  NOW() - INTERVAL '5 minutes' + INTERVAL '1 millisecond','sequence index still orders recipients after the client time');
SELECT ok((SELECT n.created_at < b.created_at - INTERVAL '4 minutes' FROM public.nixes n JOIN public.media_upload_batches b ON n.client_upload_id = b.id::text
    WHERE b.idempotency_key='send8-in-window' AND n.receiver_id='5e8d0000-0000-4000-8000-000000000002'),
  'client-dated nix sorts before anything sent while it was compressing');
SELECT is((SELECT n.created_at FROM public.nixes n JOIN public.media_upload_batches b ON n.client_upload_id = b.id::text
    WHERE b.idempotency_key='send8-legacy'),
  NOW(),'older clients keep the server begin time');

-- Moderation off: finalize goes through private.finalize_media_upload_batch_legacy.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"5e8d0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT * FROM public.begin_media_upload_batch('send8-moderation-off',repeat('b',64),'image','image/jpeg',32,'jpg',NULL,NULL,
  '[{"receiverId":"5e8d0000-0000-4000-8000-000000000003","viewDurationSec":5}]',
  NOW() - INTERVAL '3 minutes');
RESET ROLE;
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled=false WHERE singleton;
INSERT INTO storage.objects(bucket_id,name,owner,metadata)
SELECT 'media-vault',a.storage_path,a.owner_id,'{"size":32,"mimetype":"image/jpeg"}'
FROM public.media_assets a JOIN public.media_upload_batches b ON b.asset_id = a.id
WHERE b.idempotency_key='send8-moderation-off';
SELECT is((SELECT public.finalize_media_upload_batch(b.id, repeat('b',64))->>'status' FROM public.media_upload_batches b
    WHERE b.idempotency_key='send8-moderation-off'),
  'completed','moderation-off finalize delivers');
SELECT is((SELECT n.created_at FROM public.nixes n JOIN public.media_upload_batches b ON n.client_upload_id = b.id::text
    WHERE b.idempotency_key='send8-moderation-off'),
  NOW() - INTERVAL '3 minutes','moderation-off path also uses the client creation time');

-- Rate limit: one server-dated nix plus three client-dated nixes whose batches
-- began inside the last minute count as four recent sends.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"5e8d0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($$SELECT * FROM public.begin_media_upload_batch('send8-rate-17',repeat('b',64),'image','image/jpeg',32,'jpg',NULL,NULL,
  (SELECT jsonb_agg(jsonb_build_object('receiverId',gen_random_uuid(),'viewDurationSec',5)) FROM generate_series(1,17)),
  NOW())$$,'P0001','RATE_LIMITED','backdated nixes still count toward the one-minute limit');
SELECT throws_ok($$SELECT * FROM public.begin_media_upload_batch('send8-rate-16',repeat('b',64),'image','image/jpeg',32,'jpg',NULL,NULL,
  (SELECT jsonb_agg(jsonb_build_object('receiverId',gen_random_uuid(),'viewDurationSec',5)) FROM generate_series(1,16)),
  NOW())$$,'P0001','NOT_FRIEND','exactly four recent sends are counted (16 more stay under the limit)');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
