BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
VALUES
('e1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','trust-a@example.invalid','x',now(),'{}','{}'),
('e1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','trust-b@example.invalid','x',now(),'{}','{}'),
('e1000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','trust-c@example.invalid','x',now(),'{}','{}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($$INSERT INTO public.friendships(user_id,friend_id,status) VALUES('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','accepted')$$,'42501',NULL,'sender cannot insert accepted friendship');
SELECT lives_ok($$INSERT INTO public.friendships(user_id,friend_id,status) VALUES('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','pending')$$,'sender creates pending invitation');
WITH changed AS (UPDATE public.friendships SET status='accepted' WHERE user_id='e1000000-0000-4000-8000-000000000001' RETURNING id) SELECT is((SELECT count(*) FROM changed),0::bigint,'sender cannot accept own invitation');
SELECT set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT throws_ok($$UPDATE public.friendships SET user_id='e1000000-0000-4000-8000-000000000003',status='accepted' WHERE friend_id='e1000000-0000-4000-8000-000000000002'$$,'P0001','FRIENDSHIP_IDENTITY_IMMUTABLE','recipient cannot change inviter');
SELECT lives_ok($$UPDATE public.friendships SET status='accepted' WHERE friend_id='e1000000-0000-4000-8000-000000000002'$$,'recipient accepts pending invitation');
RESET ROLE;
INSERT INTO public.friendships(user_id,friend_id,status) VALUES('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','accepted');
INSERT INTO public.media_assets(id,owner_id,storage_path,media_type,content_type,size_bytes)
VALUES('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','nixes/e1000000-0000-4000-8000-000000000001/trust.jpg','image','image/jpeg',4);
INSERT INTO public.media_upload_batches(id,sender_id,asset_id,idempotency_key,finalize_token_hash)
VALUES('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','trust-fixture',repeat('a',64));
UPDATE public.media_assets SET upload_batch_id='e3000000-0000-4000-8000-000000000001' WHERE id='e2000000-0000-4000-8000-000000000001';
INSERT INTO storage.objects(bucket_id,name,owner,metadata) VALUES('media-vault','nixes/e1000000-0000-4000-8000-000000000001/trust.jpg','e1000000-0000-4000-8000-000000000001','{"size":4,"mimetype":"image/jpeg"}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
WITH changed AS (UPDATE storage.objects SET metadata=metadata||'{"uploading":true}'::jsonb WHERE name='nixes/e1000000-0000-4000-8000-000000000001/trust.jpg' RETURNING id) SELECT is((SELECT count(*) FROM changed),1::bigint,'own pending upload metadata can progress for TUS');
RESET ROLE;
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled=true WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO public.nixes(sender_id,receiver_id,media_path,media_type,view_duration_sec) VALUES('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','nixes/e1000000-0000-4000-8000-000000000001/trust.jpg','image',5)$$,'42501',NULL,'authenticated direct media insertion denied with moderation ON');
SELECT throws_ok($$SELECT * FROM public.begin_media_upload_batch('oversize-fixture',repeat('b',64),'image','image/jpeg',4194305,'jpg',NULL,NULL,'[{"receiverId":"e1000000-0000-4000-8000-000000000002","viewDurationSec":5}]')$$,'P0001','INVALID_SIZE','4MiB plus one byte denied at SQL boundary');
SELECT lives_ok($$SELECT * FROM public.begin_media_upload_batch('exactcap-fixture',repeat('b',64),'image','image/jpeg',4194304,'jpg',NULL,NULL,'[{"receiverId":"e1000000-0000-4000-8000-000000000002","viewDurationSec":5}]')$$,'exact 4MiB image allowed');
RESET ROLE;
INSERT INTO public.media_upload_recipients(batch_id,receiver_id) VALUES
('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002'),
('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003');
UPDATE public.media_assets SET status='moderation_pending' WHERE id='e2000000-0000-4000-8000-000000000001';
UPDATE public.media_upload_batches SET status='moderation_pending' WHERE id='e3000000-0000-4000-8000-000000000001';
INSERT INTO public.moderation_jobs(id,content_kind,batch_id,asset_id,sender_id,status) VALUES('e4000000-0000-4000-8000-000000000001','media','e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','approved');
SELECT lives_ok($$SELECT public.materialize_approved_media_batch('e4000000-0000-4000-8000-000000000001')$$,'approved service materialization delivers shared media');
SELECT is((SELECT count(*) FROM public.nixes WHERE asset_id='e2000000-0000-4000-8000-000000000001'),2::bigint,'both canonical recipients materialized');
SELECT throws_ok($$UPDATE storage.objects SET metadata='{"size":5}' WHERE name='nixes/e1000000-0000-4000-8000-000000000001/trust.jpg'$$,'P0001','MEDIA_OBJECT_IMMUTABLE','Storage freeze also applies to signed/service writes');
SET LOCAL ROLE authenticated;
WITH changed AS (UPDATE storage.objects SET metadata='{"size":5}' WHERE name='nixes/e1000000-0000-4000-8000-000000000001/trust.jpg' RETURNING id) SELECT is((SELECT count(*) FROM changed),0::bigint,'approved object update denied to owner by RLS');
SELECT set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT throws_ok($$UPDATE public.nixes SET media_path='nixes/e1000000-0000-4000-8000-000000000001/foreign.jpg' WHERE asset_id='e2000000-0000-4000-8000-000000000001'$$,'P0001','NIX_IDENTITY_IMMUTABLE','receiver cannot rewrite canonical cleanup target');
SELECT throws_ok($$INSERT INTO public.nix_cleanup_queue(nix_id,receiver_id,media_path) SELECT id,receiver_id,'foreign/path' FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000002'$$,'42501',NULL,'forged direct cleanup queue writes denied');
SELECT throws_ok($$SELECT * FROM public.request_nix_cleanup((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000002'))$$,'P0001','REPLAY_WINDOW_ACTIVE','unviewed nix cannot be queued');
SELECT public.mark_nix_viewed_for_replay((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000002'));
SELECT throws_ok($$SELECT * FROM public.request_nix_cleanup((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000002'))$$,'P0001','REPLAY_WINDOW_ACTIVE','active replay deadline cannot be bypassed');
SELECT public.mark_nix_replayed((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000002'));
SELECT lives_ok($$SELECT * FROM public.request_nix_cleanup((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000002'))$$,'consumed replay queues canonical cleanup');
RESET ROLE;
SELECT is((SELECT should_delete FROM public.prepare_nix_cleanup((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000002'))),false,'first recipient cleanup retains active shared reference');
SELECT public.finish_nix_cleanup((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000002'),false,NULL);
SELECT is((SELECT status FROM public.media_assets WHERE id='e2000000-0000-4000-8000-000000000001'),'ready','shared asset stays ready');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT public.mark_nix_viewed_for_replay((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000003'));
SELECT public.mark_nix_replayed((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000003'));
SELECT * FROM public.request_nix_cleanup((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000003'));
RESET ROLE;
SELECT is((SELECT should_delete FROM public.prepare_nix_cleanup((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000003'))),true,'last recipient can remove shared object');
SELECT public.finish_nix_cleanup((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000003'),false,'simulated_storage_failure');
SELECT is((SELECT media_path FROM public.nix_cleanup_queue WHERE receiver_id='e1000000-0000-4000-8000-000000000003'),'nixes/e1000000-0000-4000-8000-000000000001/trust.jpg','failed cleanup preserves canonical retry target');
SELECT is((SELECT status FROM public.media_assets WHERE id='e2000000-0000-4000-8000-000000000001'),'deleting','failed Storage removal does not mark deleted');
SELECT public.finish_nix_cleanup((SELECT id FROM public.nixes WHERE receiver_id='e1000000-0000-4000-8000-000000000003'),true,NULL);
SELECT is((SELECT status FROM public.media_assets WHERE id='e2000000-0000-4000-8000-000000000001'),'deleted','successful removal ACK marks deleted');

INSERT INTO public.moderation_text_payloads(id,body,expires_at) VALUES('e5000000-0000-4000-8000-000000000001','expired secret',NOW()-INTERVAL '1 minute');
INSERT INTO public.moderation_jobs(id,content_kind,text_payload_id,sender_id,receiver_id,status) VALUES('e4000000-0000-4000-8000-000000000002','text','e5000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','pending');
SELECT lives_ok($$SELECT public.cleanup_expired_moderation_quarantine()$$,'expired pending payload cleanup respects CHECK/FK');
SELECT is((SELECT status::text FROM public.moderation_jobs WHERE id='e4000000-0000-4000-8000-000000000002'),'error','expired pending text terminalized before FK SET NULL');
SELECT is((SELECT text_payload_id FROM public.moderation_jobs WHERE id='e4000000-0000-4000-8000-000000000002'),NULL::uuid,'expired text payload removed');
SELECT is(public.cleanup_expired_moderation_quarantine(),0,'quarantine cleanup idempotent');

INSERT INTO public.media_assets(id,owner_id,storage_path,media_type,content_type,size_bytes,status)
VALUES
('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','nixes/e1000000-0000-4000-8000-000000000001/expired.jpg','image','image/jpeg',4,'moderation_pending'),
('e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','nixes/e1000000-0000-4000-8000-000000000001/rejected.jpg','image','image/jpeg',4,'moderation_pending');
INSERT INTO public.media_upload_batches(id,sender_id,asset_id,idempotency_key,finalize_token_hash,status)
VALUES
('e3000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','expired-fixture',repeat('a',64),'moderation_pending'),
('e3000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000003','rejected-fixture',repeat('a',64),'moderation_pending');
INSERT INTO public.moderation_jobs(id,content_kind,batch_id,asset_id,sender_id,status,created_at)
VALUES
('e4000000-0000-4000-8000-000000000003','media','e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','pending',NOW()-INTERVAL '25 hours'),
('e4000000-0000-4000-8000-000000000004','media','e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','rejected',NOW());
SELECT public.cleanup_expired_moderation_quarantine();
SELECT is((SELECT status::text FROM public.moderation_jobs WHERE id='e4000000-0000-4000-8000-000000000003'),'error','expired pending media terminalized');
SELECT is((SELECT count(*) FROM public.media_assets WHERE id IN ('e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000003') AND status='deleting'),2::bigint,'expired and rejected quarantine media qualify for physical cleanup');
SELECT is((SELECT count(*) FROM public.mark_expired_media_uploads() WHERE asset_id IN ('e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000003')),2::bigint,'physical sweeper receives both terminal media paths');

INSERT INTO public.data_export_jobs(id,user_id,status,storage_path,requested_at,expires_at) VALUES('e6000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','ready','e1000000-0000-4000-8000-000000000001/e6000000-0000-4000-8000-000000000001.zip',NOW()-INTERVAL '31 days',NOW()-INTERVAL '1 day');
SELECT public.cleanup_expired_data_exports();
SELECT is((SELECT status FROM public.data_export_jobs WHERE id='e6000000-0000-4000-8000-000000000001'),'expired','old export expires before deletion');
SELECT ok((SELECT storage_path IS NOT NULL FROM public.data_export_jobs WHERE id='e6000000-0000-4000-8000-000000000001'),'30day cleanup retains archive path until Storage ACK');
SELECT public.finish_data_export_cleanup('e6000000-0000-4000-8000-000000000001','storage_failure');
SELECT ok((SELECT storage_path IS NOT NULL FROM public.data_export_jobs WHERE id='e6000000-0000-4000-8000-000000000001'),'export Storage error preserves path for retry');
SELECT public.finish_data_export_cleanup('e6000000-0000-4000-8000-000000000001',NULL);
SELECT public.cleanup_expired_data_exports();
SELECT is((SELECT count(*) FROM public.data_export_jobs WHERE id='e6000000-0000-4000-8000-000000000001'),0::bigint,'export metadata deleted only after archive ACK');
SELECT is((SELECT schedule FROM cron.job WHERE jobname='moderation-quarantine-cleanup'),'*/5 * * * *','quarantine scheduler runs every five minutes');
SELECT is((SELECT schedule FROM cron.job WHERE jobname='cleanup-media-upload-orphans'),'*/5 * * * *','physical orphan sweeper runs every five minutes');
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled=false WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT lives_ok($$INSERT INTO public.text_messages(sender_id,receiver_id,body,client_message_id) VALUES('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','ordinary safe text','flag-off-trust')$$,'moderation OFF text policy helpers executable for authenticated caller');
RESET ROLE;
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled=true WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO public.text_messages(sender_id,receiver_id,body,client_message_id) VALUES('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','ordinary safe text','flag-on-trust')$$,'42501',NULL,'moderation ON still denies direct text insertion');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
