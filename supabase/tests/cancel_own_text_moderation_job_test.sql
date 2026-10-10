BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(9);

INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
VALUES
('c1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-a@example.invalid','x',now(),'{}','{}'),
('c1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-b@example.invalid','x',now(),'{}','{}');
INSERT INTO public.friendships(user_id,friend_id,status)
VALUES('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','accepted');
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = true WHERE singleton;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT public.enqueue_own_text_moderation_job('c1000000-0000-4000-8000-000000000002','do anulowania','cancel-client-1');
SELECT public.enqueue_own_text_moderation_job('c1000000-0000-4000-8000-000000000002','zatwierdzona','cancel-client-2');

SELECT is(public.cancel_own_text_moderation_job('c1000000-0000-4000-8000-000000000002','missing-client'),'not_found','unknown client message id is not found');

SELECT set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT is(public.cancel_own_text_moderation_job('c1000000-0000-4000-8000-000000000001','cancel-client-1'),'not_found','another user cannot cancel the sender''s job');

SELECT set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT is(public.cancel_own_text_moderation_job('c1000000-0000-4000-8000-000000000002','cancel-client-1'),'cancelled','pending job is cancelled');
RESET ROLE;

SELECT is((SELECT status::text FROM public.moderation_jobs WHERE client_message_id='cancel-client-1'),'error','cancelled job is terminal');
SELECT is((SELECT last_error FROM public.moderation_jobs WHERE client_message_id='cancel-client-1'),'cancelled_by_sender','cancellation is recorded');
SELECT is((SELECT text_payload_id FROM public.moderation_jobs WHERE client_message_id='cancel-client-1'),NULL::uuid,'cancelled payload is deleted');

UPDATE public.moderation_jobs SET status='approved', decision='approved' WHERE client_message_id='cancel-client-2';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT is(public.cancel_own_text_moderation_job('c1000000-0000-4000-8000-000000000002','cancel-client-1'),'not_sent','repeated cancel reports the job as not sent');
SELECT is(public.cancel_own_text_moderation_job('c1000000-0000-4000-8000-000000000002','cancel-client-2'),'already_sent','approved job cannot be cancelled');
RESET ROLE;

SELECT set_config('request.jwt.claims','',true);
SELECT throws_ok($$SELECT public.cancel_own_text_moderation_job('c1000000-0000-4000-8000-000000000002','cancel-client-1')$$,'P0001','UNAUTHORIZED','cancel without JWT is unauthorized');

SELECT * FROM finish();
ROLLBACK;
