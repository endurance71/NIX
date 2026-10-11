BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

-- Fixtures ------------------------------------------------------------------
-- d9..01 sender, d9..02 receiver, d9..03 outsider.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('d9000000-0000-4000-8000-000000000001', 'status-sender@example.invalid'),
  ('d9000000-0000-4000-8000-000000000002', 'status-receiver@example.invalid'),
  ('d9000000-0000-4000-8000-000000000003', 'status-outsider@example.invalid')
) AS u(id, email);

INSERT INTO public.age_attestations(user_id, minimum_age, policy_version)
SELECT id, 16, '2026-07-15'
FROM public.profiles
WHERE id::TEXT LIKE 'd9000000-0000-4000-8000-00000000000_'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES ('d9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002', 'accepted');

UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

INSERT INTO public.text_messages(id, sender_id, receiver_id, body, created_at, expires_at)
VALUES
  ('d9200000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002',
   'first', now() - interval '10 minutes', now() + interval '23 hours'),
  ('d9200000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002',
   'second', now() - interval '5 minutes', now() + interval '23 hours'),
  -- The receiver's own reply must never get read_at from their own read.
  ('d9200000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001',
   'reply', now() - interval '4 minutes', now() + interval '23 hours');

INSERT INTO public.nixes(
  id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status,
  is_viewed, viewed_at, replay_expires_at, created_at
)
VALUES
  -- Viewed, replay window open: will be replayed.
  ('d9100000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002',
   'nixes/d9/replayed.jpg', 'image', 5, 'viewed', TRUE, now() - interval '1 minute', now() + interval '9 minutes',
   now() - interval '3 minutes'),
  -- Unread: the viewer will fail to load it.
  ('d9100000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002',
   'nixes/d9/broken.jpg', 'image', 5, 'sent', FALSE, NULL, NULL, now() - interval '2 minutes');

-- Receiver ------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d9000000-0000-4000-8000-000000000002","role":"authenticated"}',
  TRUE
);

SELECT lives_ok(
  $$SELECT public.mark_text_conversation_read('d9000000-0000-4000-8000-000000000001', now())$$,
  'the receiver can mark the conversation read'
);

SELECT lives_ok(
  $$SELECT public.mark_nix_replayed('d9100000-0000-4000-8000-000000000001')$$,
  'the receiver can use the replay'
);

SELECT lives_ok(
  $$SELECT public.mark_nix_unplayable('d9100000-0000-4000-8000-000000000002')$$,
  'the receiver can report unplayable media'
);

-- No direct writes: there is no UPDATE policy for text_messages.
UPDATE public.text_messages SET read_at = NULL WHERE id = 'd9200000-0000-4000-8000-000000000001';

-- Sender --------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d9000000-0000-4000-8000-000000000001","role":"authenticated"}',
  TRUE
);

SELECT is(
  (SELECT count(*)::INT FROM public.fetch_text_messages_with_peer('d9000000-0000-4000-8000-000000000002')
   WHERE sender_id = 'd9000000-0000-4000-8000-000000000001' AND read_at IS NOT NULL),
  2,
  'the sender sees read_at on both messages the receiver read (and the direct UPDATE changed nothing)'
);

SELECT is(
  (SELECT read_at FROM public.fetch_text_messages_with_peer('d9000000-0000-4000-8000-000000000002')
   WHERE id = 'd9200000-0000-4000-8000-000000000003'),
  NULL,
  'reading a conversation never stamps the reader''s own messages'
);

SELECT ok(
  (SELECT bool_and((t ->> 'read_at') IS NOT NULL)
   FROM jsonb_array_elements(public.get_inbox_bundle() -> 'texts') t
   WHERE t ->> 'sender_id' = 'd9000000-0000-4000-8000-000000000001'),
  'the inbox bundle carries read_at for the sender'
);

SELECT isnt(
  (SELECT replayed_at FROM public.get_chat_nixes_with_peer('d9000000-0000-4000-8000-000000000002')
   WHERE id = 'd9100000-0000-4000-8000-000000000001'),
  NULL,
  'the sender sees when the NiX was replayed'
);

SELECT is(
  (SELECT unplayable_at IS NOT NULL AND replayed_at IS NULL
   FROM public.get_chat_nixes_with_peer('d9000000-0000-4000-8000-000000000002')
   WHERE id = 'd9100000-0000-4000-8000-000000000002'),
  TRUE,
  'unplayable media is flagged and never counts as a replay'
);

SELECT ok(
  (SELECT (s ->> 'replayed_at') IS NOT NULL AND (s ->> 'unplayable_at') IS NULL
   FROM jsonb_array_elements(public.get_inbox_bundle() -> 'sent') s
   WHERE s ->> 'id' = 'd9100000-0000-4000-8000-000000000001'),
  'the inbox bundle carries replayed_at for the sender'
);

SELECT ok(
  (SELECT (s ->> 'unplayable_at') IS NOT NULL
   FROM jsonb_array_elements(public.get_inbox_bundle() -> 'sent') s
   WHERE s ->> 'id' = 'd9100000-0000-4000-8000-000000000002'),
  'the inbox bundle carries unplayable_at for the sender'
);

SELECT throws_ok(
  $$SELECT public.mark_nix_replayed('d9100000-0000-4000-8000-000000000001')$$,
  'Nix not found or unauthorized',
  'the sender cannot mark their own NiX replayed'
);

-- Outsider ------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d9000000-0000-4000-8000-000000000003","role":"authenticated"}',
  TRUE
);

SELECT is(
  (SELECT count(*)::INT FROM public.fetch_text_messages_with_peer('d9000000-0000-4000-8000-000000000002')),
  0,
  'an outsider sees none of the pair''s messages'
);

SELECT is(
  (SELECT count(*)::INT FROM public.get_chat_nixes_with_peer('d9000000-0000-4000-8000-000000000001')),
  0,
  'an outsider sees none of the pair''s NiXes'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::INT FROM public.text_messages
   WHERE id IN ('d9200000-0000-4000-8000-000000000001', 'd9200000-0000-4000-8000-000000000002')
     AND read_at IS NOT NULL),
  2,
  'read_at is stored on the rows'
);

SELECT * FROM finish();
ROLLBACK;
