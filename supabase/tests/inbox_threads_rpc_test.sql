BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(30);

-- Fixtures ------------------------------------------------------------------
-- b7..01 me, b7..02 friend, b7..03 friend blocked by me, b7..04 banned friend,
-- b7..05 someone who only talks to b7..02 (must never leak to me).
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('b7000000-0000-4000-8000-000000000001', 'inbox-me@example.invalid'),
  ('b7000000-0000-4000-8000-000000000002', 'inbox-friend@example.invalid'),
  ('b7000000-0000-4000-8000-000000000003', 'inbox-blocked@example.invalid'),
  ('b7000000-0000-4000-8000-000000000004', 'inbox-banned@example.invalid'),
  ('b7000000-0000-4000-8000-000000000005', 'inbox-other@example.invalid')
) AS u(id, email);

UPDATE public.profiles
SET username = CASE id
  WHEN 'b7000000-0000-4000-8000-000000000001'::UUID THEN 'inbox_me'
  WHEN 'b7000000-0000-4000-8000-000000000002'::UUID THEN 'inbox_friend'
  WHEN 'b7000000-0000-4000-8000-000000000003'::UUID THEN 'inbox_blocked'
  WHEN 'b7000000-0000-4000-8000-000000000004'::UUID THEN 'inbox_banned'
  WHEN 'b7000000-0000-4000-8000-000000000005'::UUID THEN 'inbox_other'
END,
display_name = 'Inbox ' || substr(id::TEXT, 36, 1)
WHERE id::TEXT LIKE 'b7000000-0000-4000-8000-00000000000_';

-- Keep the age gate out of the picture regardless of the configured mode.
INSERT INTO public.age_attestations(user_id, minimum_age, policy_version)
SELECT id, 16, '2026-07-15'
FROM public.profiles
WHERE id::TEXT LIKE 'b7000000-0000-4000-8000-00000000000_'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES
  ('b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'accepted'),
  ('b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000003', 'accepted'),
  ('b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000004', 'accepted'),
  ('b7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000005', 'accepted');

-- Direct nix fixtures need the legacy (non pre-delivery) path; rolled back.
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

INSERT INTO public.nixes(
  id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status,
  is_viewed, created_at, client_upload_id, thumbnail_b64
)
VALUES
  ('b7100000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001',
   'nixes/b7/friend-1.jpg', 'image', 5, 'sent', FALSE, now() - interval '50 minutes', NULL, 'data:image/jpeg;base64,AAAA'),
  ('b7100000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001',
   'nixes/b7/friend-2.mp4', 'video', 15, 'viewed', TRUE, now() - interval '40 minutes', NULL, NULL),
  ('b7100000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002',
   'nixes/b7/me-1.jpg', 'image', 5, 'sent', FALSE, now() - interval '30 minutes', 'upload-b7-1', NULL),
  ('b7100000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001',
   'nixes/b7/blocked-1.jpg', 'image', 5, 'sent', FALSE, now() - interval '20 minutes', NULL, NULL),
  ('b7100000-0000-4000-8000-000000000005', 'b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000003',
   'nixes/b7/me-blocked.jpg', 'image', 5, 'sent', FALSE, now() - interval '19 minutes', NULL, NULL),
  ('b7100000-0000-4000-8000-000000000006', 'b7000000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000001',
   'nixes/b7/banned-1.jpg', 'image', 5, 'sent', FALSE, now() - interval '10 minutes', NULL, NULL),
  ('b7100000-0000-4000-8000-000000000007', 'b7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000005',
   'nixes/b7/friend-other.jpg', 'image', 5, 'sent', FALSE, now() - interval '5 minutes', 'upload-b7-other', NULL);

INSERT INTO public.text_messages(id, sender_id, receiver_id, body, created_at, expires_at, client_message_id, metadata)
VALUES
  ('b7200000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001',
   'hej', now() - interval '45 minutes', now() + interval '23 hours', NULL, '{"k":"v"}'),
  ('b7200000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002',
   'czesc', now() - interval '35 minutes', now() + interval '23 hours', 'client-b7-1', NULL),
  ('b7200000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001',
   'wygasla', now() - interval '2 days', now() - interval '1 day', NULL, NULL),
  ('b7200000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001',
   'od zablokowanego', now() - interval '15 minutes', now() + interval '23 hours', NULL, NULL),
  ('b7200000-0000-4000-8000-000000000005', 'b7000000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000001',
   'od zbanowanego', now() - interval '12 minutes', now() + interval '23 hours', NULL, NULL),
  ('b7200000-0000-4000-8000-000000000006', 'b7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000005',
   'prywatne', now() - interval '3 minutes', now() + interval '23 hours', NULL, NULL);

INSERT INTO public.conversation_read_states(user_id, peer_id, last_read_at)
VALUES
  ('b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', now() - interval '50 minutes'),
  ('b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000005', now() - interval '50 minutes'),
  ('b7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', now());

INSERT INTO public.user_blocks(blocker_id, blocked_id)
VALUES ('b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000003');

INSERT INTO moderation.account_actions(target_user_id, action, reason)
VALUES ('b7000000-0000-4000-8000-000000000004', 'ban', 'inbox bundle test ban');

-- Contract ------------------------------------------------------------------
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_inbox_bundle(integer)'::regprocedure),
  FALSE,
  'get_inbox_bundle is SECURITY INVOKER'
);
SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.get_inbox_bundle(integer)'::regprocedure),
  'get_inbox_bundle pins an empty search_path'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_inbox_bundle(integer)', 'EXECUTE'),
  'authenticated can execute get_inbox_bundle'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.get_inbox_bundle(integer)', 'EXECUTE'),
  'anon cannot execute get_inbox_bundle'
);
SELECT ok(
  NOT has_function_privilege('service_role', 'public.get_inbox_bundle(integer)', 'EXECUTE'),
  'service_role is not granted get_inbox_bundle'
);

-- Caller: me ----------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b7000000-0000-4000-8000-000000000001","role":"authenticated"}',
  TRUE
);

CREATE TEMP TABLE bundle_me ON COMMIT DROP AS SELECT public.get_inbox_bundle() AS b;

-- Equality with the separate client queries, evaluated under the same RLS.
SELECT is(
  (SELECT b -> 'inbox' FROM bundle_me),
  (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC), '[]'::JSONB) FROM (
    SELECT id, sender_id, media_path, media_type, playback_duration_ms, created_at, is_viewed, status, view_duration_sec,
      is_replayed, replay_expires_at
    FROM public.nixes
    WHERE receiver_id = 'b7000000-0000-4000-8000-000000000001'
    ORDER BY created_at DESC, id DESC LIMIT 100
  ) x),
  'inbox equals the fetchInboxNixes select'
);
SELECT is(
  (SELECT b -> 'sent' FROM bundle_me),
  (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC), '[]'::JSONB) FROM (
    SELECT id, receiver_id, created_at, status, viewed_at, cleaned_at, client_upload_id,
      media_type, is_replayed, replay_expires_at, replayed_at, unplayable_at
    FROM public.nixes
    WHERE sender_id = 'b7000000-0000-4000-8000-000000000001'
    ORDER BY created_at DESC, id DESC LIMIT 100
  ) x),
  'sent equals the fetchSentNixes select'
);
SELECT is(
  (SELECT b -> 'texts' FROM bundle_me),
  (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC), '[]'::JSONB) FROM (
    SELECT id, sender_id, receiver_id, body, created_at, expires_at, client_message_id, is_system, metadata, read_at,
      CASE WHEN sender_id = 'b7000000-0000-4000-8000-000000000001' THEN receiver_id ELSE sender_id END AS peer_id
    FROM public.text_messages
    WHERE (sender_id = 'b7000000-0000-4000-8000-000000000001' OR receiver_id = 'b7000000-0000-4000-8000-000000000001')
      AND expires_at > now()
    ORDER BY created_at DESC, id DESC LIMIT 100
  ) x),
  'texts equal the fetchRecentTextMessagesForInbox select'
);
SELECT is(
  (SELECT (b ->> 'unread_count')::INTEGER FROM bundle_me),
  public.get_unread_inbox_count(),
  'unread_count equals get_unread_inbox_count()'
);
SELECT is(
  (SELECT jsonb_agg(p ORDER BY p ->> 'id') FROM bundle_me, jsonb_array_elements(b -> 'profiles') p),
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id::TEXT)
   FROM public.get_public_profiles_by_ids(ARRAY[
     'b7000000-0000-4000-8000-000000000002',
     'b7000000-0000-4000-8000-000000000004'
   ]::UUID[]) p),
  'profiles equal get_public_profiles_by_ids for the referenced peers'
);

-- Exact expectations for the fixture.
SELECT is(
  (SELECT array_agg(e ->> 'id' ORDER BY e ->> 'id') FROM bundle_me, jsonb_array_elements(b -> 'inbox') e),
  ARRAY[
    'b7100000-0000-4000-8000-000000000001',
    'b7100000-0000-4000-8000-000000000002',
    'b7100000-0000-4000-8000-000000000006'
  ],
  'inbox hides the blocked sender and keeps the banned sender row like nixes_select'
);
SELECT is(
  (SELECT array_agg(e ->> 'id') FROM bundle_me, jsonb_array_elements(b -> 'sent') e),
  ARRAY['b7100000-0000-4000-8000-000000000003'],
  'sent hides nixes sent to a blocked user'
);
SELECT is(
  (SELECT b -> 'sent' -> 0 ->> 'client_upload_id' FROM bundle_me),
  'upload-b7-1',
  'sent rows carry client_upload_id'
);
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM bundle_me, jsonb_object_keys(b -> 'inbox' -> 0) k),
  ARRAY['created_at', 'id', 'is_replayed', 'is_viewed', 'media_path', 'media_type', 'playback_duration_ms',
        'replay_expires_at', 'sender_id', 'status', 'view_duration_sec'],
  'inbox rows expose exactly the list columns (no thumbnail_b64)'
);
SELECT is(
  (SELECT array_agg(e ->> 'id' ORDER BY e ->> 'id') FROM bundle_me, jsonb_array_elements(b -> 'texts') e),
  ARRAY[
    'b7200000-0000-4000-8000-000000000001',
    'b7200000-0000-4000-8000-000000000002',
    'b7200000-0000-4000-8000-000000000005'
  ],
  'texts hide expired, blocked and third-party messages'
);
SELECT is(
  (SELECT b -> 'texts' -> 0 ->> 'peer_id' FROM bundle_me),
  'b7000000-0000-4000-8000-000000000004',
  'texts carry the peer id of the conversation'
);
SELECT is(
  (SELECT array_agg(e ->> 'id' ORDER BY e ->> 'id') FROM bundle_me, jsonb_array_elements(b -> 'profiles') e),
  ARRAY['b7000000-0000-4000-8000-000000000002'],
  'profiles exclude blocked and restricted peers'
);
SELECT is(
  (SELECT array_agg(e ->> 'peer_id') FROM bundle_me, jsonb_array_elements(b -> 'read_states') e),
  ARRAY['b7000000-0000-4000-8000-000000000002'],
  'read states are the caller''s own and only for peers present in texts'
);
SELECT is(
  (SELECT count(*) FROM bundle_me, jsonb_array_elements((b -> 'inbox') || (b -> 'sent') || (b -> 'texts')) e
   WHERE COALESCE(e ->> 'sender_id', 'b7000000-0000-4000-8000-000000000001') <> 'b7000000-0000-4000-8000-000000000001'
     AND COALESCE(e ->> 'receiver_id', 'b7000000-0000-4000-8000-000000000001') <> 'b7000000-0000-4000-8000-000000000001'),
  0::BIGINT,
  'no row in the bundle belongs to a conversation the caller is not part of'
);
SELECT is(
  (SELECT jsonb_array_length(public.get_inbox_bundle(1) -> 'inbox')),
  1,
  'p_limit limits each list'
);
SELECT is(
  (SELECT jsonb_array_length(public.get_inbox_bundle(0) -> 'inbox')),
  1,
  'p_limit is clamped to at least one row'
);
SELECT is(
  public.get_inbox_bundle(1000),
  (SELECT b FROM bundle_me),
  'p_limit is clamped to at most 100 rows (same as default)'
);

-- Caller: the third party ---------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b7000000-0000-4000-8000-000000000005","role":"authenticated"}',
  TRUE
);
SELECT is(
  (SELECT array_agg(e ->> 'id') FROM jsonb_array_elements(public.get_inbox_bundle() -> 'inbox') e),
  ARRAY['b7100000-0000-4000-8000-000000000007'],
  'another user sees only their own inbox'
);
SELECT is(
  (SELECT jsonb_array_length(public.get_inbox_bundle() -> 'sent')),
  0,
  'another user sees none of my sent nixes'
);
SELECT is(
  (SELECT array_agg(e ->> 'id') FROM jsonb_array_elements(public.get_inbox_bundle() -> 'texts') e),
  ARRAY['b7200000-0000-4000-8000-000000000006'],
  'another user sees only their own texts'
);
SELECT is(
  (SELECT jsonb_array_length(public.get_inbox_bundle() -> 'read_states')),
  0,
  'another user never sees my read states'
);

-- Caller: restricted (banned) account ---------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b7000000-0000-4000-8000-000000000004","role":"authenticated"}',
  TRUE
);
SELECT is(
  (SELECT jsonb_array_length(public.get_inbox_bundle() -> 'sent')),
  (SELECT count(*)::INTEGER FROM public.nixes WHERE sender_id = 'b7000000-0000-4000-8000-000000000004'),
  'restricted caller gets the same (empty) nix view as nixes_select'
);
SELECT is(
  (SELECT jsonb_array_length(public.get_inbox_bundle() -> 'profiles')),
  0,
  'restricted caller gets no public profiles, like get_public_profiles_by_ids'
);

-- Missing identity ----------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', TRUE);
SELECT throws_ok(
  $$SELECT public.get_inbox_bundle()$$,
  '42501',
  'UNAUTHORIZED',
  'a request without a user id is rejected'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.get_inbox_bundle()$$,
  '42501',
  NULL,
  'anon cannot call get_inbox_bundle'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
