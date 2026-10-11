BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);

-- A and B talk to each other; C is an unrelated user.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    'f1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'broadcast-a@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'broadcast-b@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'f1000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'broadcast-c@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  );

INSERT INTO public.text_messages(id, sender_id, receiver_id, body)
VALUES
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002',
    'broadcast body one'
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002',
    'broadcast body two'
  ),
  (
    'f2000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'broadcast body three'
  );

-- Only messages written by this test are inspected (read as postgres, which bypasses RLS).
CREATE TEMP VIEW test_broadcasts AS
SELECT topic, event, payload, private, extension
FROM realtime.messages
WHERE topic IN (
  'user:f1000000-0000-4000-8000-000000000001',
  'user:f1000000-0000-4000-8000-000000000002',
  'user:f1000000-0000-4000-8000-000000000003'
);

-- ------------------------------------------------------------------------------------------
-- Schema objects
-- ------------------------------------------------------------------------------------------
SELECT policy_cmd_is(
  'realtime', 'messages', 'realtime_user_topic_receive', 'select',
  'realtime.messages has a SELECT-only receive policy'
);
SELECT policy_roles_are(
  'realtime', 'messages', 'realtime_user_topic_receive', ARRAY['authenticated'],
  'the receive policy applies only to authenticated users'
);
SELECT has_trigger('public', 'message_reactions', 'broadcast_message_reaction_inserts', 'reaction INSERT broadcast trigger exists');
SELECT has_trigger('public', 'message_reactions', 'broadcast_message_reaction_updates', 'reaction UPDATE broadcast trigger exists');
SELECT has_trigger('public', 'message_reactions', 'broadcast_message_reaction_deletes', 'reaction DELETE broadcast trigger exists');
SELECT has_trigger('public', 'text_messages', 'broadcast_text_message_removals', 'text message DELETE broadcast trigger exists');

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_proc p
    WHERE p.pronamespace = 'private'::regnamespace
      AND p.proname IN ('broadcast_message_reaction_changes', 'broadcast_text_message_removals')
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=""']
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  2,
  'broadcast trigger functions are SECURITY DEFINER, pin search_path and are not callable by clients'
);

-- ------------------------------------------------------------------------------------------
-- Reaction writes by a normal user broadcast to both participants
-- ------------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  TRUE
);
SELECT lives_ok(
  $$INSERT INTO public.message_reactions(message_id, user_id, emoji)
    VALUES
      ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'heart'),
      ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'heart')$$,
  'an authenticated user can still react (broadcast does not break the write)'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT topic, (payload ->> 'op'), jsonb_array_length(payload -> 'message_ids'), payload -> 'peer_ids'
    FROM test_broadcasts WHERE event = 'reaction_changed' ORDER BY topic$$,
  $$VALUES
      ('user:f1000000-0000-4000-8000-000000000001', 'INSERT', 2, '["f1000000-0000-4000-8000-000000000002"]'::jsonb),
      ('user:f1000000-0000-4000-8000-000000000002', 'INSERT', 2, '["f1000000-0000-4000-8000-000000000001"]'::jsonb)$$,
  'a two-row reaction INSERT sends one grouped broadcast per participant'
);
SELECT is(
  (SELECT count(*)::integer FROM test_broadcasts WHERE NOT private OR extension <> 'broadcast'),
  0,
  'broadcasts are private broadcast messages'
);
SELECT is(
  (SELECT count(*)::integer FROM test_broadcasts WHERE payload::text LIKE '%broadcast body%' OR payload ? 'body'),
  0,
  'broadcast payloads never contain message bodies'
);
SELECT is(
  (SELECT count(*)::integer FROM test_broadcasts WHERE topic = 'user:f1000000-0000-4000-8000-000000000003'),
  0,
  'an unrelated user receives nothing'
);

DELETE FROM realtime.messages WHERE topic LIKE 'user:f1000000-0000-4000-8000-00000000000_';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  TRUE
);
SELECT lives_ok(
  $$UPDATE public.message_reactions SET emoji = 'thumbsup'
    WHERE message_id = 'f2000000-0000-4000-8000-000000000001'
      AND user_id = 'f1000000-0000-4000-8000-000000000002'$$,
  'an authenticated user can change a reaction'
);
SELECT lives_ok(
  $$DELETE FROM public.message_reactions
    WHERE message_id = 'f2000000-0000-4000-8000-000000000002'
      AND user_id = 'f1000000-0000-4000-8000-000000000002'$$,
  'an authenticated user can remove a reaction'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT topic, payload ->> 'op', payload -> 'message_ids'
    FROM test_broadcasts WHERE event = 'reaction_changed' ORDER BY topic, payload ->> 'op'$$,
  $$VALUES
      ('user:f1000000-0000-4000-8000-000000000001', 'DELETE', '["f2000000-0000-4000-8000-000000000002"]'::jsonb),
      ('user:f1000000-0000-4000-8000-000000000001', 'UPDATE', '["f2000000-0000-4000-8000-000000000001"]'::jsonb),
      ('user:f1000000-0000-4000-8000-000000000002', 'DELETE', '["f2000000-0000-4000-8000-000000000002"]'::jsonb),
      ('user:f1000000-0000-4000-8000-000000000002', 'UPDATE', '["f2000000-0000-4000-8000-000000000001"]'::jsonb)$$,
  'reaction UPDATE and DELETE broadcast to both participants'
);

-- ------------------------------------------------------------------------------------------
-- Receive policy: own topic only, no client writes
-- ------------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  TRUE
);
SELECT set_config('realtime.topic', 'user:f1000000-0000-4000-8000-000000000001', TRUE);
SELECT is(
  (SELECT array_agg(DISTINCT topic) FROM realtime.messages WHERE topic LIKE 'user:f1000000-0000-4000-8000-00000000000_'),
  ARRAY['user:f1000000-0000-4000-8000-000000000001'],
  'a user can read broadcasts on their own topic only'
);
SELECT set_config('realtime.topic', 'user:f1000000-0000-4000-8000-000000000002', TRUE);
SELECT is(
  (SELECT count(*)::integer FROM realtime.messages WHERE topic LIKE 'user:f1000000-0000-4000-8000-00000000000_'),
  0,
  'a user cannot join another user''s topic'
);
SELECT throws_ok(
  $$INSERT INTO realtime.messages(topic, extension, event, payload, private)
    VALUES ('user:f1000000-0000-4000-8000-000000000001', 'broadcast', 'reaction_changed', '{}'::jsonb, true)$$,
  '42501',
  NULL,
  'clients cannot broadcast on a private user topic, not even their own'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
SELECT set_config('realtime.topic', 'user:f1000000-0000-4000-8000-000000000001', TRUE);
SELECT is(
  (SELECT count(*)::integer FROM realtime.messages WHERE topic LIKE 'user:f1000000-0000-4000-8000-00000000000_'),
  0,
  'anon cannot read private user topics'
);
RESET ROLE;

-- ------------------------------------------------------------------------------------------
-- Bulk message removal (cron expiry) groups recipients; cascaded reaction deletes stay silent
-- ------------------------------------------------------------------------------------------
DELETE FROM realtime.messages WHERE topic LIKE 'user:f1000000-0000-4000-8000-00000000000_';

SELECT lives_ok(
  $$DELETE FROM public.text_messages
    WHERE id IN (
      'f2000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000002',
      'f2000000-0000-4000-8000-000000000003'
    )$$,
  'deleting messages (and cascading their reactions) does not error'
);
SELECT results_eq(
  $$SELECT topic, jsonb_array_length(payload -> 'message_ids'), payload -> 'peer_ids', (payload ->> 'truncated')::boolean
    FROM test_broadcasts WHERE event = 'messages_removed' ORDER BY topic$$,
  $$VALUES
      ('user:f1000000-0000-4000-8000-000000000001', 3, '["f1000000-0000-4000-8000-000000000002"]'::jsonb, false),
      ('user:f1000000-0000-4000-8000-000000000002', 3, '["f1000000-0000-4000-8000-000000000001"]'::jsonb, false)$$,
  'one bulk DELETE sends exactly one messages_removed broadcast per participant'
);
SELECT is(
  (SELECT count(*)::integer FROM test_broadcasts WHERE event = 'reaction_changed'),
  0,
  'reactions removed by cascade do not produce extra broadcasts'
);
SELECT is(
  (SELECT count(*)::integer FROM test_broadcasts),
  2,
  'nothing else is broadcast for the bulk removal'
);

SELECT * FROM finish();
ROLLBACK;
