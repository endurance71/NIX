BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(45);

-- A and B are accepted friends; C is a stranger; D is A's friend but blocked A.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  ('f5000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'chatsave-' || n || '@example.invalid', 'x', now(),
  '{}', '{}', now(), now()
FROM generate_series(1, 4) AS n;

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES
  ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'accepted'),
  ('f5000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000001', 'accepted');

INSERT INTO public.text_messages(id, sender_id, receiver_id, body)
VALUES
  ('f5100000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'save me'),
  ('f5100000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000001', 'blocked pair');
INSERT INTO public.text_messages(id, sender_id, receiver_id, body, created_at, expires_at)
VALUES ('f5100000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'old', now() - INTERVAL '2 days', now() - INTERVAL '1 day');
INSERT INTO public.user_blocks(blocker_id, blocked_id)
VALUES ('f5000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000001');
-- Direct client inserts exist only with pre-delivery moderation off; test the policy that way.
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

-- ------------------------------------------------------------------ catalog
SELECT has_column('public', 'text_messages', 'saved_at', 'text_messages.saved_at exists');
SELECT has_column('public', 'text_messages', 'saved_by', 'text_messages.saved_by exists');
SELECT has_column('public', 'text_messages', 'kind', 'text_messages.kind exists');
SELECT has_column('public', 'text_messages', 'voice_path', 'text_messages.voice_path exists');
SELECT ok(
  (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
   FROM pg_proc p WHERE p.oid = 'public.set_text_message_saved(uuid,boolean)'::regprocedure),
  'set_text_message_saved is SECURITY DEFINER, pins search_path, authenticated only'
);
SELECT ok(
  (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
   FROM pg_proc p WHERE p.oid = 'public.send_voice_message(uuid,text,integer,smallint[],text)'::regprocedure),
  'send_voice_message is SECURITY DEFINER, pins search_path, authenticated only'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.claim_voice_message_object_deletions(integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.complete_voice_message_object_deletions(text[])', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.claim_voice_message_object_deletions(integer)', 'EXECUTE'),
  'the deletion queue RPCs are service-role only'
);
SELECT is((SELECT public FROM storage.buckets WHERE id = 'voice-messages'), FALSE, 'voice-messages bucket is private');

-- ------------------------------------------------------------------ saving
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f5000000-0000-4000-8000-000000000002","role":"authenticated"}', TRUE);
SELECT is(
  (SELECT saved_by FROM public.set_text_message_saved('f5100000-0000-4000-8000-000000000001', TRUE)),
  'f5000000-0000-4000-8000-000000000002'::uuid,
  'the receiver can save a message'
);
SELECT is(
  (SELECT saved_by FROM public.set_text_message_saved('f5100000-0000-4000-8000-000000000001', TRUE)),
  'f5000000-0000-4000-8000-000000000002'::uuid,
  'saving again is idempotent'
);
-- No UPDATE policy: participants cannot touch the save columns directly.
UPDATE public.text_messages SET saved_at = NULL, saved_by = NULL WHERE id = 'f5100000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT ok(
  (SELECT saved_at IS NOT NULL AND expires_at > now() + INTERVAL '1000 years'
   FROM public.text_messages WHERE id = 'f5100000-0000-4000-8000-000000000001'),
  'a saved message does not expire and a direct UPDATE cannot unsave it'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT is(
  (SELECT saved_by FROM public.fetch_text_messages_with_peer('f5000000-0000-4000-8000-000000000002') WHERE id = 'f5100000-0000-4000-8000-000000000001'),
  'f5000000-0000-4000-8000-000000000002'::uuid,
  'the other participant sees who saved it'
);
SELECT is(
  (SELECT count(*)::integer FROM public.fetch_text_messages_with_peer('f5000000-0000-4000-8000-000000000002') WHERE id = 'f5100000-0000-4000-8000-000000000003'),
  0,
  'expired messages stay hidden'
);
SELECT ok(
  (SELECT s.saved_by IS NULL AND s.expires_at BETWEEN now() + INTERVAL '23 hours' AND now() + INTERVAL '25 hours'
   FROM public.set_text_message_saved('f5100000-0000-4000-8000-000000000001', FALSE) s),
  'either participant can unsave; it then expires 24 h later'
);
SELECT throws_ok(
  $$SELECT * FROM public.set_text_message_saved('f5100000-0000-4000-8000-000000000003', TRUE)$$,
  'P0002', 'NOT_FOUND', 'an expired message cannot be saved'
);
SELECT throws_ok(
  $$SELECT * FROM public.set_text_message_saved('f5100000-0000-4000-8000-000000000002', TRUE)$$,
  'P0002', 'NOT_FOUND', 'a blocked pair cannot save'
);
SELECT throws_ok(
  $$INSERT INTO public.text_messages(sender_id, receiver_id, body, saved_at, saved_by)
    VALUES ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'x', now(), 'f5000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'a client cannot insert a pre-saved message'
);
SELECT throws_ok(
  $$INSERT INTO public.text_messages(sender_id, receiver_id, body, expires_at)
    VALUES ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'x', now() + INTERVAL '30 days')$$,
  '42501', NULL, 'a client cannot insert a long-lived message'
);
SELECT lives_ok(
  $$INSERT INTO public.text_messages(sender_id, receiver_id, body)
    VALUES ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'plain text still works')$$,
  'plain text inserts keep working'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f5000000-0000-4000-8000-000000000003","role":"authenticated"}', TRUE);
SELECT throws_ok(
  $$SELECT * FROM public.set_text_message_saved('f5100000-0000-4000-8000-000000000001', TRUE)$$,
  'P0002', 'NOT_FOUND', 'a stranger cannot save someone else''s message'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.set_text_message_saved('f5100000-0000-4000-8000-000000000001', TRUE)$$,
  '42501', NULL, 'anon cannot call set_text_message_saved'
);
RESET ROLE;

-- ------------------------------------------------------------------ voice storage
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT lives_ok(
  $$INSERT INTO storage.objects(bucket_id, name, owner_id)
    VALUES ('voice-messages', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a', 'f5000000-0000-4000-8000-000000000001')$$,
  'a sender can upload into <me>/<friend>/'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects(bucket_id, name) VALUES ('voice-messages', 'f5000000-0000-4000-8000-000000000002/f5000000-0000-4000-8000-000000000001/f5200000-0000-4000-8000-000000000002.m4a')$$,
  '42501', NULL, 'nobody can upload into someone else''s folder'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects(bucket_id, name) VALUES ('voice-messages', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000003/f5200000-0000-4000-8000-000000000003.m4a')$$,
  '42501', NULL, 'nobody can upload a voice note for a stranger'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects(bucket_id, name) VALUES ('voice-messages', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000004/f5200000-0000-4000-8000-000000000004.m4a')$$,
  '42501', NULL, 'nobody can upload a voice note for a blocked pair'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects(bucket_id, name) VALUES ('voice-messages', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/../evil.m4a')$$,
  '42501', NULL, 'malformed paths are rejected'
);
SELECT throws_ok(
  $$SELECT * FROM public.send_voice_message('f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000009.m4a', 4000)$$,
  'P0002', 'VOICE_OBJECT_MISSING', 'a voice message needs an uploaded object'
);
SELECT throws_ok(
  $$SELECT * FROM public.send_voice_message('f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a', 4000, ARRAY[1, 200]::smallint[])$$,
  '22023', 'INVALID_INPUT', 'waveform samples are bounded'
);
SELECT throws_ok(
  $$SELECT * FROM public.send_voice_message('f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a', 120000)$$,
  '22023', 'INVALID_INPUT', 'voice messages are at most a minute'
);
SELECT is(
  (SELECT body || '|' || kind FROM public.send_voice_message(
    'f5000000-0000-4000-8000-000000000002',
    'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a',
    12400, ARRAY[10, 55, 100, 0]::smallint[], 'voice-client-1')),
  '🎤 0:12|voice',
  'a friend can send a voice message (placeholder body, kind voice)'
);
SELECT is(
  (SELECT voice_duration_ms FROM public.send_voice_message(
    'f5000000-0000-4000-8000-000000000002',
    'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a',
    12400, NULL, 'voice-client-1')),
  12400,
  'retrying with the same client id returns the existing message'
);
SELECT throws_ok(
  $$INSERT INTO public.text_messages(sender_id, receiver_id, body, kind, voice_path, voice_duration_ms)
    VALUES ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'x', 'voice', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a', 1000)$$,
  '42501', NULL, 'voice rows cannot be inserted directly'
);
SELECT is(
  (SELECT count(*)::integer FROM public.fetch_text_messages_with_peer('f5000000-0000-4000-8000-000000000002') WHERE kind = 'voice' AND voice_waveform = ARRAY[10, 55, 100, 0]::smallint[]),
  1,
  'the fetch RPC returns the voice columns'
);
SELECT ok(
  (SELECT s.saved_by = 'f5000000-0000-4000-8000-000000000001'::uuid FROM public.set_text_message_saved(
    (SELECT id FROM public.text_messages WHERE client_message_id = 'voice-client-1'), TRUE) s),
  'a voice message can be saved too'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f5000000-0000-4000-8000-000000000002","role":"authenticated"}', TRUE);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'voice-messages' AND name LIKE 'f5000000-0000-4000-8000-000000000001/%'),
  1,
  'the receiver can read the audio of a message sent to them'
);
SELECT throws_ok(
  $$SELECT * FROM public.send_voice_message('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a', 4000)$$,
  '22023', 'INVALID_INPUT', 'nobody can send someone else''s object'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f5000000-0000-4000-8000-000000000003","role":"authenticated"}', TRUE);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'voice-messages'),
  0,
  'a stranger cannot read any voice audio'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'voice-messages'),
  0,
  'anon cannot read any voice audio'
);
RESET ROLE;

-- Blocking hides the audio from both sides.
INSERT INTO public.user_blocks(blocker_id, blocked_id)
VALUES ('f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f5000000-0000-4000-8000-000000000002","role":"authenticated"}', TRUE);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'voice-messages'),
  0,
  'a blocked pair loses access to the audio'
);
RESET ROLE;
DELETE FROM public.user_blocks
WHERE blocker_id = 'f5000000-0000-4000-8000-000000000002' AND blocked_id = 'f5000000-0000-4000-8000-000000000001';

-- ------------------------------------------------------------------ deletion queue
DELETE FROM public.text_messages WHERE client_message_id = 'voice-client-1';
SELECT is(
  (SELECT count(*)::integer FROM private.voice_message_object_deletions
   WHERE object_path = 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a'),
  1,
  'deleting a voice message queues its audio for removal'
);

-- An upload that never became a message is swept after an hour.
INSERT INTO storage.objects(bucket_id, name, created_at)
VALUES ('voice-messages', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000005.m4a', now() - INTERVAL '2 hours'),
       ('voice-messages', 'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000006.m4a', now());

SET LOCAL ROLE service_role;
SELECT ok(
  (SELECT public.claim_voice_message_object_deletions(10)) @> ARRAY[
    'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a',
    'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000005.m4a'
  ],
  'the cleanup claims deleted and abandoned audio'
);
SELECT ok(
  NOT ((SELECT public.claim_voice_message_object_deletions(10)) @> ARRAY[
    'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000006.m4a'
  ]),
  'a fresh upload is not swept'
);
SELECT is(
  public.complete_voice_message_object_deletions(ARRAY[
    'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000001.m4a',
    'f5000000-0000-4000-8000-000000000001/f5000000-0000-4000-8000-000000000002/f5200000-0000-4000-8000-000000000005.m4a'
  ]),
  2,
  'completing removes the paths from the queue'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT throws_ok(
  $$SELECT public.claim_voice_message_object_deletions(10)$$,
  '42501', NULL, 'users cannot claim the deletion queue'
);
SELECT is(
  (public.get_chat_capabilities() ->> 'voice_messages')::boolean,
  TRUE,
  'the capability probe reports voice messages'
);
RESET ROLE;

SELECT finish();
ROLLBACK;
