BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(9);

INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
VALUES
('f8100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','claim-prio-a@example.invalid','x',now(),'{}','{}'),
('f8100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','claim-prio-b@example.invalid','x',now(),'{}','{}');

INSERT INTO public.media_assets(id,owner_id,storage_path,media_type,content_type,size_bytes)
VALUES('f8200000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000001','nixes/f8100000-0000-4000-8000-000000000001/prio.mp4','video','video/mp4',4);
INSERT INTO public.media_upload_batches(id,sender_id,asset_id,idempotency_key,finalize_token_hash)
VALUES('f8300000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000001','f8200000-0000-4000-8000-000000000001','claim-prio-fixture',repeat('c',64));

INSERT INTO public.moderation_text_payloads(id,body,expires_at) VALUES
('f8500000-0000-4000-8000-000000000001','first text',NOW()+INTERVAL '1 hour'),
('f8500000-0000-4000-8000-000000000002','second text',NOW()+INTERVAL '1 hour');

-- The media job is due long before the texts; FIFO would hand it out first.
-- Timestamps far in the past keep fixture rows ahead of any other due rows.
INSERT INTO public.moderation_jobs(id,content_kind,batch_id,asset_id,sender_id,status,next_attempt_at,created_at)
VALUES('f8400000-0000-4000-8000-000000000001','media','f8300000-0000-4000-8000-000000000001','f8200000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000001','pending','1999-01-01','1999-01-01');
INSERT INTO public.moderation_jobs(id,content_kind,text_payload_id,sender_id,receiver_id,client_message_id,status,next_attempt_at,created_at)
VALUES
('f8400000-0000-4000-8000-000000000002','text','f8500000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002','claim-prio-1','pending','2000-01-01','2000-01-01'),
('f8400000-0000-4000-8000-000000000003','text','f8500000-0000-4000-8000-000000000002','f8100000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002','claim-prio-2','pending','2000-01-02','2000-01-02');

SELECT is(
  (SELECT id FROM public.claim_moderation_jobs(1,'claim-prio-test',900)),
  'f8400000-0000-4000-8000-000000000002'::uuid,
  'due text job is claimed before an older due media job'
);

SELECT is(
  (SELECT id FROM public.claim_moderation_jobs(1,'claim-prio-test',900)),
  'f8400000-0000-4000-8000-000000000003'::uuid,
  'text jobs keep FIFO order among themselves'
);

SELECT is(
  (SELECT status::text || ':' || lease_owner || ':' || attempt_count FROM public.moderation_jobs WHERE id='f8400000-0000-4000-8000-000000000002'),
  'processing:claim-prio-test:1',
  'claim still leases the row and increments attempt_count'
);

SELECT is(
  (SELECT status::text FROM public.moderation_jobs WHERE id='f8400000-0000-4000-8000-000000000001'),
  'pending',
  'media job waits while text jobs are claimed'
);

-- An expired lease on a text job is reclaimed before the pending media job.
UPDATE public.moderation_jobs
SET lease_expires_at = NOW() - INTERVAL '1 second'
WHERE id = 'f8400000-0000-4000-8000-000000000002';

SELECT is(
  (SELECT id FROM public.claim_moderation_jobs(1,'claim-prio-test-2',900)),
  'f8400000-0000-4000-8000-000000000002'::uuid,
  'expired text lease is reclaimed ahead of media'
);

-- With no due text job left in the fixture set, media is next.
UPDATE public.moderation_jobs
SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL, next_attempt_at = NOW() + INTERVAL '1 hour'
WHERE id IN ('f8400000-0000-4000-8000-000000000002','f8400000-0000-4000-8000-000000000003');

SELECT ok(
  'f8400000-0000-4000-8000-000000000001'::uuid IN (SELECT id FROM public.claim_moderation_jobs(20,'claim-prio-test',900)),
  'media job is claimed once no text job is due'
);

SELECT ok(
  pg_get_functiondef('public.claim_moderation_jobs(integer, text, integer)'::regprocedure) ~ 'FOR UPDATE SKIP LOCKED',
  'claim keeps FOR UPDATE SKIP LOCKED'
);

SELECT is(
  has_function_privilege('authenticated', 'public.claim_moderation_jobs(integer, text, integer)', 'EXECUTE'),
  false,
  'authenticated still cannot claim moderation jobs'
);

SELECT has_index('public', 'moderation_jobs', 'moderation_jobs_claim_priority_idx', 'priority claim index exists');

SELECT * FROM finish();
ROLLBACK;
