BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);

-- Fixtures ------------------------------------------------------------------
-- c8..01 me, c8..02 friend, c8..03 friend blocked by me, c8..04 someone who
-- only talks to c8..02 (must never leak to me), c8..05 banned user.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('c8000000-0000-4000-8000-000000000001', 'chatrpc-me@example.invalid'),
  ('c8000000-0000-4000-8000-000000000002', 'chatrpc-friend@example.invalid'),
  ('c8000000-0000-4000-8000-000000000003', 'chatrpc-blocked@example.invalid'),
  ('c8000000-0000-4000-8000-000000000004', 'chatrpc-other@example.invalid'),
  ('c8000000-0000-4000-8000-000000000005', 'chatrpc-banned@example.invalid')
) AS u(id, email);

INSERT INTO public.age_attestations(user_id, minimum_age, policy_version)
SELECT id, 16, '2026-07-15'
FROM public.profiles
WHERE id::TEXT LIKE 'c8000000-0000-4000-8000-00000000000_'
ON CONFLICT (user_id) DO NOTHING;

-- Direct nix fixtures need the legacy (non pre-delivery) path; rolled back.
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

-- 60 rows between me and friend (alternating direction, distinct timestamps,
-- thumbnails present) so the default limit of 50 actually cuts the list.
INSERT INTO public.nixes(
  id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status,
  is_viewed, created_at, client_upload_id, thumbnail_b64, playback_duration_ms
)
SELECT
  ('c8100000-0000-4000-8000-' || lpad(g::TEXT, 12, '0'))::UUID,
  CASE WHEN g % 2 = 0 THEN 'c8000000-0000-4000-8000-000000000001' ELSE 'c8000000-0000-4000-8000-000000000002' END::UUID,
  CASE WHEN g % 2 = 0 THEN 'c8000000-0000-4000-8000-000000000002' ELSE 'c8000000-0000-4000-8000-000000000001' END::UUID,
  'nixes/c8/pair-' || g || CASE WHEN g % 5 = 0 THEN '.mp4' ELSE '.jpg' END,
  CASE WHEN g % 5 = 0 THEN 'video' ELSE 'image' END,
  5,
  CASE WHEN g % 3 = 0 THEN 'viewed' ELSE 'sent' END,
  g % 3 = 0,
  now() - (g || ' minutes')::INTERVAL,
  CASE WHEN g % 2 = 0 THEN 'upload-c8-' || g END,
  'data:image/jpeg;base64,AAAA',
  CASE WHEN g % 5 = 0 THEN 4000 END
FROM generate_series(1, 60) g;

INSERT INTO public.nixes(
  id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status,
  is_viewed, created_at
)
VALUES
  -- Blocked pair, both directions.
  ('c8200000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001',
   'nixes/c8/blocked-in.jpg', 'image', 5, 'sent', FALSE, now() - interval '3 minutes'),
  ('c8200000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000003',
   'nixes/c8/blocked-out.jpg', 'image', 5, 'sent', FALSE, now() - interval '4 minutes'),
  -- friend <-> other: never visible to me.
  ('c8200000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000004',
   'nixes/c8/friend-other.jpg', 'image', 5, 'sent', FALSE, now() - interval '30 seconds'),
  ('c8200000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000002',
   'nixes/c8/other-friend.jpg', 'image', 5, 'sent', FALSE, now() - interval '20 seconds'),
  -- banned <-> friend.
  ('c8200000-0000-4000-8000-000000000005', 'c8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000005',
   'nixes/c8/friend-banned.jpg', 'image', 5, 'sent', FALSE, now() - interval '10 seconds');

-- Self-addressed row (the app cannot create one; the push trigger rejects
-- actor = recipient, so triggers are skipped): must come back once, not twice.
SET LOCAL session_replication_role = replica;
INSERT INTO public.nixes(
  id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status,
  is_viewed, created_at
)
VALUES ('c8200000-0000-4000-8000-000000000006', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001',
   'nixes/c8/self.jpg', 'image', 5, 'sent', FALSE, now() - interval '5 seconds');
SET LOCAL session_replication_role = origin;

INSERT INTO public.user_blocks(blocker_id, blocked_id)
VALUES ('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000003');

INSERT INTO moderation.account_actions(target_user_id, action, reason)
VALUES ('c8000000-0000-4000-8000-000000000005', 'ban', 'chat nixes rpc test ban');

-- Contract ------------------------------------------------------------------
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_chat_nixes_with_peer(uuid,integer)'::regprocedure),
  FALSE,
  'get_chat_nixes_with_peer is SECURITY INVOKER'
);
SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.get_chat_nixes_with_peer(uuid,integer)'::regprocedure),
  'get_chat_nixes_with_peer pins an empty search_path'
);
SELECT ok(
  (SELECT proconfig @> ARRAY['enable_sort=off'] FROM pg_proc WHERE oid = 'public.get_chat_nixes_with_peer(uuid,integer)'::regprocedure),
  'get_chat_nixes_with_peer keeps the ordered index plan (no explicit sort over the pair)'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_chat_nixes_with_peer(uuid,integer)', 'EXECUTE'),
  'authenticated can execute get_chat_nixes_with_peer'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.get_chat_nixes_with_peer(uuid,integer)', 'EXECUTE'),
  'anon cannot execute get_chat_nixes_with_peer'
);
SELECT ok(
  NOT has_function_privilege('service_role', 'public.get_chat_nixes_with_peer(uuid,integer)', 'EXECUTE'),
  'service_role is not granted get_chat_nixes_with_peer'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p, unnest(p.proargnames) AS arg(name)
    WHERE p.oid = 'public.get_chat_nixes_with_peer(uuid,integer)'::regprocedure
      AND arg.name = 'thumbnail_b64'
  ),
  'get_chat_nixes_with_peer does not return thumbnail_b64'
);

-- Caller: me ----------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c8000000-0000-4000-8000-000000000001","role":"authenticated"}',
  TRUE
);

-- Equality with the old PostgREST `.or(...)` select, evaluated under the same RLS.
SELECT results_eq(
  $$SELECT * FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000002')$$,
  $$SELECT id, sender_id, receiver_id, created_at, media_path, media_type, is_viewed, is_replayed,
           replay_expires_at, status, view_duration_sec, playback_duration_ms, client_upload_id,
           viewed_at, replayed_at, unplayable_at
    FROM public.nixes
    WHERE (sender_id = 'c8000000-0000-4000-8000-000000000001' AND receiver_id = 'c8000000-0000-4000-8000-000000000002')
       OR (sender_id = 'c8000000-0000-4000-8000-000000000002' AND receiver_id = 'c8000000-0000-4000-8000-000000000001')
    ORDER BY created_at DESC
    LIMIT 50$$,
  'default page equals the old fetchChatNixesWithPeer query'
);
SELECT results_eq(
  $$SELECT * FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000002', 7)$$,
  $$SELECT id, sender_id, receiver_id, created_at, media_path, media_type, is_viewed, is_replayed,
           replay_expires_at, status, view_duration_sec, playback_duration_ms, client_upload_id,
           viewed_at, replayed_at, unplayable_at
    FROM public.nixes
    WHERE (sender_id = 'c8000000-0000-4000-8000-000000000001' AND receiver_id = 'c8000000-0000-4000-8000-000000000002')
       OR (sender_id = 'c8000000-0000-4000-8000-000000000002' AND receiver_id = 'c8000000-0000-4000-8000-000000000001')
    ORDER BY created_at DESC
    LIMIT 7$$,
  'small page equals the old query'
);
SELECT is(
  (SELECT count(*)::INT FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000002', 50)),
  50,
  'the limit cuts the 60-row conversation'
);
SELECT is(
  (SELECT count(DISTINCT sender_id)::INT FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000002', 50)),
  2,
  'both directions are merged'
);
SELECT is(
  (SELECT count(*)::INT FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000002', 1000)),
  60,
  'p_limit above 100 is clamped (whole 60-row conversation)'
);
SELECT is(
  (SELECT count(*)::INT FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000002', 0)),
  1,
  'p_limit below 1 is clamped to 1'
);
SELECT is(
  (SELECT count(*)::INT FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000003')),
  0,
  'blocked pair is excluded in both directions (as with the old query)'
);
SELECT is(
  (SELECT count(*)::INT FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000004')),
  0,
  'no leakage: friend<->other rows never reach me'
);
SELECT is(
  (SELECT array_agg(id) FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000001')),
  ARRAY['c8200000-0000-4000-8000-000000000006'::UUID],
  'self-addressed conversation returns each row once'
);

-- Caller: other (third party) ------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c8000000-0000-4000-8000-000000000004","role":"authenticated"}',
  TRUE
);
SELECT is(
  (SELECT count(*)::INT FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000001')),
  0,
  'a third party cannot read my conversation by naming me as peer'
);
SELECT is(
  (SELECT array_agg(id ORDER BY created_at DESC) FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000002')),
  ARRAY['c8200000-0000-4000-8000-000000000004'::UUID, 'c8200000-0000-4000-8000-000000000003'::UUID],
  'other sees only its own conversation with friend'
);

-- Caller: banned -------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c8000000-0000-4000-8000-000000000005","role":"authenticated"}',
  TRUE
);
SELECT is(
  (SELECT count(*)::INT FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000002')),
  0,
  'restricted account reads nothing (nixes_select)'
);

-- Caller: friend sees the mirror image of my page ------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c8000000-0000-4000-8000-000000000002","role":"authenticated"}',
  TRUE
);
SELECT results_eq(
  $$SELECT id FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000001')$$,
  $$SELECT ('c8100000-0000-4000-8000-' || lpad(g::TEXT, 12, '0'))::UUID FROM generate_series(1, 50) g$$,
  'friend gets the same 50 rows, newest first'
);

-- No JWT ---------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', TRUE);
SELECT is(
  (SELECT count(*)::INT FROM public.get_chat_nixes_with_peer('c8000000-0000-4000-8000-000000000002')),
  0,
  'without a subject the RPC returns nothing'
);

RESET ROLE;
SELECT is(
  (SELECT count(*)::INT FROM public.nixes WHERE id::TEXT LIKE 'c8%'),
  66,
  'fixtures are intact (sanity)'
);

SELECT * FROM finish();
ROLLBACK;
