BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(36);

-- Fixtures ------------------------------------------------------------------
-- f8..01 = A, f8..02 = B (friends, the conversation), f8..03 = C (friend of B, another chat).
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('f8000000-0000-4000-8000-000000000001', 'edit-a@example.invalid'),
  ('f8000000-0000-4000-8000-000000000002', 'edit-b@example.invalid'),
  ('f8000000-0000-4000-8000-000000000003', 'edit-c@example.invalid')
) AS u(id, email);

INSERT INTO public.age_attestations(user_id, minimum_age, policy_version)
SELECT id, 16, '2026-07-15'
FROM public.profiles
WHERE id::TEXT LIKE 'f8000000-0000-4000-8000-00000000000_'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES
  ('f8000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000002', 'accepted'),
  ('f8000000-0000-4000-8000-000000000002', 'f8000000-0000-4000-8000-000000000003', 'accepted');

-- Seed messages as the table owner (bypasses the moderation switch for fixtures).
INSERT INTO public.text_messages(id, sender_id, receiver_id, body, created_at)
VALUES
  -- A → B, fresh: editable / unsendable by A.
  ('f8100000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000001',
   'f8000000-0000-4000-8000-000000000002', 'Pierwsza wersja', now()),
  -- A → B, 20 minutes old: outside both windows.
  ('f8100000-0000-4000-8000-000000000002', 'f8000000-0000-4000-8000-000000000001',
   'f8000000-0000-4000-8000-000000000002', 'Stara wiadomość', now() - interval '20 minutes'),
  -- B → A: the quoted message of a reply.
  ('f8100000-0000-4000-8000-000000000003', 'f8000000-0000-4000-8000-000000000002',
   'f8000000-0000-4000-8000-000000000001', 'Pytanie od B', now()),
  -- C → B: another conversation.
  ('f8100000-0000-4000-8000-000000000004', 'f8000000-0000-4000-8000-000000000003',
   'f8000000-0000-4000-8000-000000000002', 'Wiadomość od C', now()),
  -- A → B, 3 minutes old: unsendable, used by the moderation-ON edit.
  ('f8100000-0000-4000-8000-000000000005', 'f8000000-0000-4000-8000-000000000001',
   'f8000000-0000-4000-8000-000000000002', 'Do moderowanej edycji', now() - interval '3 minutes'),
  -- A → B, 8 minutes old: editable but no longer unsendable.
  ('f8100000-0000-4000-8000-000000000006', 'f8000000-0000-4000-8000-000000000001',
   'f8000000-0000-4000-8000-000000000002', 'Osiem minut temu', now() - interval '8 minutes');

-- Schema / grants -------------------------------------------------------------
SELECT has_column('public', 'text_messages', 'reply_to_message_id', 'text_messages.reply_to_message_id exists');
SELECT has_column('public', 'text_messages', 'edited_at', 'text_messages.edited_at exists');
SELECT has_column('public', 'moderation_jobs', 'edit_of_message_id', 'moderation_jobs.edit_of_message_id exists');

SELECT is(
  (SELECT count(*)::INT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enqueue_own_text_moderation_job'),
  1,
  'enqueue_own_text_moderation_job keeps a single signature'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.edit_own_text_message(uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.unsend_own_text_message(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.edit_own_text_message(uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.unsend_own_text_message(uuid)', 'EXECUTE'),
  'edit / unsend: authenticated only (not anon)'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'private.apply_text_message_edit(uuid,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.broadcast_text_message_edited(uuid,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.is_valid_text_reply_message(uuid,uuid,uuid)', 'EXECUTE'),
  'edit / reply helpers are not callable by clients'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.text_message_edits', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.text_message_edits', 'SELECT'),
  'edit history is not readable by clients'
);

-- Moderation OFF: replies by direct insert, edit applied at once ---------------
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);

INSERT INTO public.text_messages(sender_id, receiver_id, body, client_message_id, reply_to_message_id)
VALUES
  ('f8000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000002', 'Odpowiedź',
   'reply-valid', 'f8100000-0000-4000-8000-000000000003'),
  ('f8000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000002', 'Odpowiedź 2',
   'reply-foreign', 'f8100000-0000-4000-8000-000000000004');

SELECT throws_ok(
  $$INSERT INTO public.text_messages(sender_id, receiver_id, body, edited_at, edit_count)
    VALUES ('f8000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000002', 'x', now(), 1)$$,
  '42501',
  NULL,
  'a client cannot insert a message marked as edited'
);

SELECT is(
  (SELECT reply_to_message_id FROM public.text_messages WHERE client_message_id = 'reply-valid'),
  'f8100000-0000-4000-8000-000000000003'::UUID,
  'a reply keeps a message of the same conversation'
);

SELECT is(
  (SELECT reply_to_message_id FROM public.text_messages WHERE client_message_id = 'reply-foreign'),
  NULL,
  'a reply to another conversation is stored without the quote'
);

SELECT results_eq(
  $$SELECT reply_to_message_id, reply_to_message_sender_id, reply_to_message_kind, reply_to_message_body
    FROM public.fetch_text_messages_with_peer('f8000000-0000-4000-8000-000000000002')
    WHERE client_message_id = 'reply-valid'$$,
  $$VALUES ('f8100000-0000-4000-8000-000000000003'::UUID, 'f8000000-0000-4000-8000-000000000002'::UUID,
            'text'::TEXT, 'Pytanie od B'::TEXT)$$,
  'fetch returns the quoted message preview'
);

SELECT is(
  public.edit_own_text_message('f8100000-0000-4000-8000-000000000001', '  Druga wersja  ') ->> 'status',
  'applied',
  'moderation OFF: the edit is applied at once'
);

SELECT results_eq(
  $$SELECT body, edited_at IS NOT NULL FROM public.fetch_text_messages_with_peer('f8000000-0000-4000-8000-000000000002')
    WHERE id = 'f8100000-0000-4000-8000-000000000001'$$,
  $$VALUES ('Druga wersja'::TEXT, TRUE)$$,
  'the edited body (trimmed) and edited_at are returned'
);

SELECT is(
  public.edit_own_text_message('f8100000-0000-4000-8000-000000000001', 'Druga wersja') ->> 'status',
  'unchanged',
  'the same body is a no-op'
);

SELECT throws_ok(
  $$SELECT public.edit_own_text_message('f8100000-0000-4000-8000-000000000002', 'Za późno')$$,
  'EDIT_WINDOW_CLOSED',
  'a message older than 15 minutes cannot be edited'
);

SELECT throws_ok(
  $$SELECT public.edit_own_text_message('f8100000-0000-4000-8000-000000000003', 'Nie moja')$$,
  'NOT_FOUND',
  'the receiver cannot edit the sender''s message'
);

SELECT throws_ok(
  $$SELECT public.edit_own_text_message('f8100000-0000-4000-8000-000000000001', '   ')$$,
  'INVALID_INPUT',
  'an empty edit is rejected'
);

RESET ROLE;

SELECT is(
  (SELECT previous_body FROM public.text_message_edits WHERE message_id = 'f8100000-0000-4000-8000-000000000001'),
  'Pierwsza wersja',
  'the previous body is kept as evidence'
);

-- Edit limit: 4 more edits reach 5, the 6th fails.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT public.edit_own_text_message('f8100000-0000-4000-8000-000000000001', 'v' || n) FROM generate_series(3, 6) AS n;
SELECT throws_ok(
  $$SELECT public.edit_own_text_message('f8100000-0000-4000-8000-000000000001', 'v7')$$,
  'EDIT_LIMIT_REACHED',
  'at most five edits'
);
RESET ROLE;

SELECT is(
  (SELECT edit_count::INT FROM public.text_messages WHERE id = 'f8100000-0000-4000-8000-000000000001'),
  5,
  'edit_count counts applied edits'
);

-- Moderation ON: edits go through the queue -------------------------------------
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = TRUE WHERE singleton;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);

SELECT is(
  public.edit_own_text_message('f8100000-0000-4000-8000-000000000005', 'Pierwsza poprawka') ->> 'status',
  'pending',
  'moderation ON: the edit is queued'
);
SELECT is(
  public.edit_own_text_message('f8100000-0000-4000-8000-000000000005', 'Druga poprawka') ->> 'status',
  'pending',
  'a second edit is queued too'
);

SELECT lives_ok(
  $$SELECT public.enqueue_own_text_moderation_job(
    p_receiver_id => 'f8000000-0000-4000-8000-000000000002',
    p_body => 'Odpowiedź moderowana',
    p_client_message_id => 'reply-moderated',
    p_reply_to_message_id => 'f8100000-0000-4000-8000-000000000003'
  )$$,
  'a reply can be enqueued with the quoted message'
);

RESET ROLE;

SELECT is(
  (SELECT body FROM public.text_messages WHERE id = 'f8100000-0000-4000-8000-000000000005'),
  'Do moderowanej edycji',
  'a queued edit is invisible until approved'
);

SELECT is(
  (SELECT count(*)::INT FROM public.moderation_jobs
   WHERE edit_of_message_id = 'f8100000-0000-4000-8000-000000000005' AND status = 'pending'),
  1,
  'the newer edit supersedes the unclaimed older one'
);

UPDATE public.moderation_jobs SET status = 'approved'
WHERE (edit_of_message_id = 'f8100000-0000-4000-8000-000000000005' AND status = 'pending')
   OR client_message_id = 'reply-moderated';

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.materialize_approved_text_message(id) FROM public.moderation_jobs
    WHERE status = 'approved' AND materialized_at IS NULL
      AND (edit_of_message_id = 'f8100000-0000-4000-8000-000000000005' OR client_message_id = 'reply-moderated')$$,
  'the worker materializes the approved edit and reply'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT body, edit_count::INT FROM public.text_messages WHERE id = 'f8100000-0000-4000-8000-000000000005'$$,
  $$VALUES ('Druga poprawka'::TEXT, 1)$$,
  'materialize applies the edit to the existing message'
);

SELECT is(
  (SELECT reply_to_message_id FROM public.text_messages WHERE client_message_id = 'reply-moderated'),
  'f8100000-0000-4000-8000-000000000003'::UUID,
  'materialize carries the quoted message'
);

SELECT set_config('test.edit_job', (
  SELECT id::TEXT FROM public.moderation_jobs
  WHERE edit_of_message_id = 'f8100000-0000-4000-8000-000000000005' AND status = 'approved'
), TRUE);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT is(
  (public.get_own_text_moderation_job(current_setting('test.edit_job')::UUID) ->> 'messageId')::UUID,
  'f8100000-0000-4000-8000-000000000005'::UUID,
  'the sender''s job view reports the edited message'
);

-- Unsend -------------------------------------------------------------------------
SELECT is(
  public.unsend_own_text_message('f8100000-0000-4000-8000-000000000006'),
  'window_closed',
  'a message older than 5 minutes cannot be unsent'
);
SELECT is(
  public.unsend_own_text_message('f8100000-0000-4000-8000-000000000003'),
  'not_found',
  'the receiver cannot unsend the sender''s message'
);
SELECT is(
  public.unsend_own_text_message('f8100000-0000-4000-8000-000000000005'),
  'unsent',
  'the sender unsends a fresh message'
);
RESET ROLE;

SELECT is(
  (SELECT count(*)::INT FROM public.text_messages WHERE id = 'f8100000-0000-4000-8000-000000000005'),
  0,
  'the unsent message is deleted'
);

SELECT is(
  (SELECT count(*)::INT FROM public.text_message_edits WHERE message_id = 'f8100000-0000-4000-8000-000000000005'),
  0,
  'its edit history goes with it'
);

-- The quoted message is unsent: the reply keeps its text, the quote disappears.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000002","role":"authenticated"}', TRUE);
SELECT is(
  public.unsend_own_text_message('f8100000-0000-4000-8000-000000000003'),
  'unsent',
  'B unsends the quoted message'
);
RESET ROLE;

SELECT is(
  (SELECT count(*)::INT FROM public.text_messages
   WHERE client_message_id IN ('reply-valid', 'reply-moderated') AND reply_to_message_id IS NULL),
  2,
  'replies to an unsent message stay, without the quote'
);

SELECT * FROM finish();
ROLLBACK;
