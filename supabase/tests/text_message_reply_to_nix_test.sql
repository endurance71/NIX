BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);

-- Fixtures ------------------------------------------------------------------
-- f7..01 = A (sends the NiX), f7..02 = B (receives it and replies), f7..03 = C (outsider friend of B).
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('f7000000-0000-4000-8000-000000000001', 'reply-a@example.invalid'),
  ('f7000000-0000-4000-8000-000000000002', 'reply-b@example.invalid'),
  ('f7000000-0000-4000-8000-000000000003', 'reply-c@example.invalid')
) AS u(id, email);

INSERT INTO public.age_attestations(user_id, minimum_age, policy_version)
SELECT id, 16, '2026-07-15'
FROM public.profiles
WHERE id::TEXT LIKE 'f7000000-0000-4000-8000-00000000000_'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES
  ('f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002', 'accepted'),
  ('f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000003', 'accepted');

-- Plain NiX rows need the legacy path (with moderation ON a NiX must come from a media asset).
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

INSERT INTO public.nixes(id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status)
VALUES
  -- A → B: the only valid reply target for B's texts to A.
  ('f7100000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001',
   'f7000000-0000-4000-8000-000000000002', 'nixes/f7/a-to-b.jpg', 'image', 5, 'viewed'),
  -- C → B: B received it, but from someone else.
  ('f7100000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000003',
   'f7000000-0000-4000-8000-000000000002', 'nixes/f7/c-to-b.jpg', 'image', 5, 'sent'),
  -- B → A: B's own sent NiX.
  ('f7100000-0000-4000-8000-000000000003', 'f7000000-0000-4000-8000-000000000002',
   'f7000000-0000-4000-8000-000000000001', 'nixes/f7/b-to-a.mp4', 'video', 5, 'sent'),
  -- A → B, a second one (video) for the direct-insert path.
  ('f7100000-0000-4000-8000-000000000004', 'f7000000-0000-4000-8000-000000000001',
   'f7000000-0000-4000-8000-000000000002', 'nixes/f7/a-to-b.mp4', 'video', 5, 'sent');

-- Schema --------------------------------------------------------------------
SELECT has_column('public', 'text_messages', 'reply_to_nix_id', 'text_messages.reply_to_nix_id exists');
SELECT has_column('public', 'moderation_jobs', 'reply_to_nix_id', 'moderation_jobs.reply_to_nix_id exists');

SELECT is(
  (SELECT array_agg(c.confdeltype::TEXT ORDER BY c.conrelid::regclass::TEXT)
   FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.confrelid = 'public.nixes'::regclass
     AND c.conrelid IN ('public.text_messages'::regclass, 'public.moderation_jobs'::regclass)),
  ARRAY['n', 'n'],
  'both reply_to_nix_id FKs are ON DELETE SET NULL'
);

-- Grants ---------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::INT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enqueue_own_text_moderation_job'),
  1,
  'enqueue_own_text_moderation_job has a single (non-ambiguous) signature'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.enqueue_own_text_moderation_job(uuid,text,text,uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.enqueue_own_text_moderation_job(uuid,text,text,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.enqueue_own_text_moderation_job(uuid,text,text,uuid,uuid)', 'EXECUTE'),
  'enqueue_own_text_moderation_job: authenticated + service_role only'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.fetch_text_messages_with_peer(uuid,timestamptz,integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.fetch_text_messages_with_peer(uuid,timestamptz,integer)', 'EXECUTE'),
  'fetch_text_messages_with_peer grants restored'
);

SELECT ok(
  has_function_privilege('service_role', 'public.materialize_approved_text_message(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.materialize_approved_text_message(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.materialize_approved_text_message(uuid)', 'EXECUTE'),
  'materialize_approved_text_message stays service_role only'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'private.is_valid_text_reply_nix(uuid,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.is_valid_text_reply_nix(uuid,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.validate_text_message_reply_to_nix()', 'EXECUTE'),
  'the reply validation helpers are not callable by clients'
);

-- Moderation ON: enqueue → materialize ---------------------------------------
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = TRUE WHERE singleton;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f7000000-0000-4000-8000-000000000002","role":"authenticated"}',
  TRUE
);

SELECT lives_ok(
  $$SELECT public.enqueue_own_text_moderation_job(
    p_receiver_id => 'f7000000-0000-4000-8000-000000000001',
    p_body => 'Super zdjęcie',
    p_client_message_id => 'reply-valid',
    p_reply_to_nix_id => 'f7100000-0000-4000-8000-000000000001'
  )$$,
  'B can enqueue a reply to the NiX A sent them'
);

SELECT lives_ok(
  $$SELECT public.enqueue_own_text_moderation_job(
    p_receiver_id => 'f7000000-0000-4000-8000-000000000001',
    p_body => 'Hej',
    p_client_message_id => 'reply-foreign',
    p_reply_to_nix_id => 'f7100000-0000-4000-8000-000000000002'
  )$$,
  'a reply pointing at a NiX from someone else is still delivered'
);

SELECT lives_ok(
  $$SELECT public.enqueue_own_text_moderation_job(
    p_receiver_id => 'f7000000-0000-4000-8000-000000000001',
    p_body => 'Hej',
    p_client_message_id => 'reply-own',
    p_reply_to_nix_id => 'f7100000-0000-4000-8000-000000000003'
  )$$,
  'a reply pointing at the sender''s own NiX is still delivered'
);

-- Shipped clients (1.0.12 / 1.0.13 JS): three named args, no reply parameter.
SELECT lives_ok(
  $$SELECT public.enqueue_own_text_moderation_job(
    p_receiver_id => 'f7000000-0000-4000-8000-000000000001',
    p_body => 'Stary klient',
    p_client_message_id => 'reply-legacy'
  )$$,
  'the old three-argument call still resolves'
);

RESET ROLE;

SELECT is(
  (SELECT reply_to_nix_id FROM public.moderation_jobs
   WHERE sender_id = 'f7000000-0000-4000-8000-000000000002' AND client_message_id = 'reply-valid'),
  'f7100000-0000-4000-8000-000000000001'::UUID,
  'the job carries the valid reply target'
);

SELECT is(
  (SELECT count(*)::INT FROM public.moderation_jobs
   WHERE sender_id = 'f7000000-0000-4000-8000-000000000002'
     AND client_message_id IN ('reply-foreign', 'reply-own', 'reply-legacy')
     AND reply_to_nix_id IS NULL),
  3,
  'foreign, own and missing reply targets are stored as NULL'
);

UPDATE public.moderation_jobs SET status = 'approved'
WHERE sender_id = 'f7000000-0000-4000-8000-000000000002'
  AND client_message_id IN ('reply-valid', 'reply-legacy');

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.materialize_approved_text_message(id) FROM public.moderation_jobs
    WHERE sender_id = 'f7000000-0000-4000-8000-000000000002'
      AND client_message_id IN ('reply-valid', 'reply-legacy')$$,
  'the worker materializes approved replies by job id'
);
RESET ROLE;

SELECT is(
  (SELECT reply_to_nix_id FROM public.text_messages
   WHERE sender_id = 'f7000000-0000-4000-8000-000000000002' AND client_message_id = 'reply-valid'),
  'f7100000-0000-4000-8000-000000000001'::UUID,
  'materialize copies the reply target into text_messages'
);

SELECT is(
  (SELECT reply_to_nix_id FROM public.text_messages
   WHERE sender_id = 'f7000000-0000-4000-8000-000000000002' AND client_message_id = 'reply-legacy'),
  NULL,
  'an old-style text materializes without a reply target'
);

-- A (the NiX sender) reads the chat.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f7000000-0000-4000-8000-000000000001","role":"authenticated"}',
  TRUE
);

SELECT results_eq(
  $$SELECT reply_to_nix_id, reply_to_nix_media_type
    FROM public.fetch_text_messages_with_peer('f7000000-0000-4000-8000-000000000002')
    WHERE client_message_id = 'reply-valid'$$,
  $$VALUES ('f7100000-0000-4000-8000-000000000001'::UUID, 'image'::TEXT)$$,
  'fetch_text_messages_with_peer returns the reply target and its media type'
);

-- Moderation OFF: direct insert through RLS ----------------------------------
RESET ROLE;
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f7000000-0000-4000-8000-000000000002","role":"authenticated"}',
  TRUE
);

INSERT INTO public.text_messages(sender_id, receiver_id, body, client_message_id, reply_to_nix_id)
VALUES
  ('f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001', 'Wow',
   'direct-valid', 'f7100000-0000-4000-8000-000000000004'),
  ('f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001', 'Hej',
   'direct-foreign', 'f7100000-0000-4000-8000-000000000002'),
  ('f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001', 'Hej',
   'direct-own', 'f7100000-0000-4000-8000-000000000003');

RESET ROLE;

SELECT is(
  (SELECT reply_to_nix_id FROM public.text_messages
   WHERE sender_id = 'f7000000-0000-4000-8000-000000000002' AND client_message_id = 'direct-valid'),
  'f7100000-0000-4000-8000-000000000004'::UUID,
  'a direct insert keeps a valid reply target'
);

SELECT is(
  (SELECT count(*)::INT FROM public.text_messages
   WHERE sender_id = 'f7000000-0000-4000-8000-000000000002'
     AND client_message_id IN ('direct-foreign', 'direct-own')
     AND reply_to_nix_id IS NULL),
  2,
  'a direct insert with a foreign or own NiX stores NULL (text still delivered)'
);

UPDATE public.text_messages SET reply_to_nix_id = 'f7100000-0000-4000-8000-000000000002'
WHERE sender_id = 'f7000000-0000-4000-8000-000000000002' AND client_message_id = 'direct-valid';

SELECT is(
  (SELECT reply_to_nix_id FROM public.text_messages
   WHERE sender_id = 'f7000000-0000-4000-8000-000000000002' AND client_message_id = 'direct-valid'),
  NULL,
  'an update to a foreign NiX is nulled by the trigger too'
);

-- NiX deleted ---------------------------------------------------------------
DELETE FROM public.nixes WHERE id = 'f7100000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT reply_to_nix_id FROM public.text_messages
   WHERE sender_id = 'f7000000-0000-4000-8000-000000000002' AND client_message_id = 'reply-valid'),
  NULL,
  'deleting the NiX keeps the reply text and clears its target'
);

SELECT is(
  (SELECT reply_to_nix_id FROM public.moderation_jobs
   WHERE sender_id = 'f7000000-0000-4000-8000-000000000002' AND client_message_id = 'reply-valid'),
  NULL,
  'deleting the NiX clears the job''s reply target'
);

SELECT * FROM finish();
ROLLBACK;
