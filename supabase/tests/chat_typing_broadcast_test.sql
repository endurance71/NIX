BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(18);

-- A and B are accepted friends; C is a stranger; D is A's friend but blocked; E has a pending invite.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  ('f3000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'typing-' || n || '@example.invalid', 'x', now(),
  '{}', '{}', now(), now()
FROM generate_series(1, 5) AS n;

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES
  ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'accepted'),
  ('f3000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000001', 'accepted'),
  ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000005', 'pending');
INSERT INTO public.user_blocks(blocker_id, blocked_id) VALUES ('f3000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000001');

-- Realtime authorizes a join by reading (receive) and writing (send) a probe row on the joined
-- topic with `realtime.topic` set; the probes below mirror that.
INSERT INTO realtime.messages(topic, extension, event, payload, private)
SELECT t, 'broadcast', 'typing', '{}'::jsonb, true
FROM unnest(ARRAY[
  'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002',
  'typing:f3000000-0000-4000-8000-000000000002:f3000000-0000-4000-8000-000000000001',
  'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000003',
  'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000004',
  'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000005'
]) AS t;

SELECT policy_cmd_is('realtime', 'messages', 'realtime_chat_typing_receive', 'select', 'typing receive policy is SELECT');
SELECT policy_cmd_is('realtime', 'messages', 'realtime_chat_typing_send', 'insert', 'typing send policy is INSERT');
SELECT policy_roles_are('realtime', 'messages', 'realtime_chat_typing_receive', ARRAY['authenticated'], 'typing receive is for authenticated users only');
SELECT policy_roles_are('realtime', 'messages', 'realtime_chat_typing_send', ARRAY['authenticated'], 'typing send is for authenticated users only');
SELECT ok(
  (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
   FROM pg_proc p
   WHERE p.oid = 'private.can_use_chat_typing_topic(text)'::regprocedure),
  'the topic gate is SECURITY DEFINER, pins search_path and is not callable by anon'
);

-- Friends on their canonical pair topic
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', TRUE);
SELECT is((SELECT count(*)::integer FROM realtime.messages WHERE topic = 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002'), 1, 'a participant can join the pair topic (lower id)');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000002","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', TRUE);
SELECT is((SELECT count(*)::integer FROM realtime.messages WHERE topic = 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002'), 1, 'the other participant can join the same pair topic (higher id)');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', TRUE);
SELECT lives_ok(
  $$INSERT INTO realtime.messages(topic, extension, event, payload, private)
    VALUES ('typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', 'broadcast', 'typing', '{"v":1,"typing":true}'::jsonb, true)$$,
  'a participant can broadcast typing on the pair topic'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000002","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', TRUE);
SELECT lives_ok(
  $$INSERT INTO realtime.messages(topic, extension, event, payload, private)
    VALUES ('typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', 'broadcast', 'typing', '{"v":1,"typing":true}'::jsonb, true)$$,
  'the other participant can broadcast typing too'
);
RESET ROLE;

-- Everyone and everything else is rejected
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000003","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', TRUE);
SELECT is((SELECT count(*)::integer FROM realtime.messages WHERE topic = 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002'), 0, 'a stranger cannot join a pair topic');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000003","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', TRUE);
SELECT throws_ok(
  $$INSERT INTO realtime.messages(topic, extension, event, payload, private)
    VALUES ('typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', 'broadcast', 'typing', '{"v":1,"typing":true}'::jsonb, true)$$,
  '42501',
  NULL,
  'a stranger cannot broadcast on a pair topic'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000002:f3000000-0000-4000-8000-000000000001', TRUE);
SELECT is((SELECT count(*)::integer FROM realtime.messages WHERE topic = 'typing:f3000000-0000-4000-8000-000000000002:f3000000-0000-4000-8000-000000000001'), 0, 'a non-canonical (reversed) topic is rejected');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000003', TRUE);
SELECT is((SELECT count(*)::integer FROM realtime.messages WHERE topic = 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000003'), 0, 'users who are not friends get no topic');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000004', TRUE);
SELECT is((SELECT count(*)::integer FROM realtime.messages WHERE topic = 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000004'), 0, 'a blocked pair gets no topic');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000004', TRUE);
SELECT throws_ok(
  $$INSERT INTO realtime.messages(topic, extension, event, payload, private)
    VALUES ('typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000004', 'broadcast', 'typing', '{"v":1,"typing":true}'::jsonb, true)$$,
  '42501',
  NULL,
  'a blocked pair cannot broadcast'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000005', TRUE);
SELECT is((SELECT count(*)::integer FROM realtime.messages WHERE topic = 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000005'), 0, 'a pending invite is not a friendship');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT set_config('realtime.topic', 'user:f3000000-0000-4000-8000-000000000001', TRUE);
SELECT throws_ok(
  $$INSERT INTO realtime.messages(topic, extension, event, payload, private)
    VALUES ('user:f3000000-0000-4000-8000-000000000001', 'broadcast', 'typing', '{"v":1,"typing":true}'::jsonb, true)$$,
  '42501',
  NULL,
  'the typing send policy does not open private user topics'
);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
SELECT set_config('realtime.topic', 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002', TRUE);
SELECT is((SELECT count(*)::integer FROM realtime.messages WHERE topic = 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002'), 0, 'anon cannot join a pair topic');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
