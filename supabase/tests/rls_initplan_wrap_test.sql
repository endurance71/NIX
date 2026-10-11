BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(49);

-- Contract: policy set is unchanged ---------------------------------------------
SELECT policies_are('public', 'app_installations', ARRAY['app_installations_owner_select']);
SELECT policies_are('public', 'conversation_mutes', ARRAY['conversation_mutes_owner']);
SELECT policies_are('public', 'conversation_read_states', ARRAY['conversation_read_states_owner']);
SELECT policies_are('public', 'data_export_jobs', ARRAY['data_export_jobs_owner_select']);
SELECT policies_are('public', 'friend_invites', ARRAY['friend_invites_insert', 'friend_invites_select', 'friend_invites_update']);
SELECT policies_are('public', 'friendships', ARRAY['friendships_delete', 'friendships_insert', 'friendships_select', 'friendships_update']);
SELECT policies_are('public', 'legal_acceptances', ARRAY['legal_acceptances_insert_own', 'legal_acceptances_select_own']);
SELECT policies_are('public', 'message_reactions', ARRAY['message_reactions_delete', 'message_reactions_insert', 'message_reactions_select', 'message_reactions_update']);
SELECT policies_are('public', 'nix_capture_prefs', ARRAY['nix_capture_prefs_delete', 'nix_capture_prefs_insert', 'nix_capture_prefs_select', 'nix_capture_prefs_update']);
SELECT policies_are('public', 'nix_cleanup_queue', ARRAY['nix_cleanup_queue_select']);
SELECT policies_are('public', 'nixes', ARRAY['nixes_select']);
SELECT policies_are('public', 'notification_preferences', ARRAY['notification_preferences_owner']);
SELECT policies_are('public', 'product_analytics_preferences', ARRAY['product_analytics_preferences_owner']);
SELECT policies_are('public', 'profiles', ARRAY['profiles_delete', 'profiles_insert', 'profiles_select', 'profiles_update']);
SELECT policies_are('public', 'text_messages', ARRAY['text_messages_insert', 'text_messages_select']);
SELECT policies_are('public', 'upload_logs', ARRAY['upload_logs_insert', 'upload_logs_select']);
SELECT policies_are('public', 'user_activation_state', ARRAY['user_activation_state_owner']);

-- Commands and roles of every rewritten policy (name|cmd|roles|permissive).
SELECT set_eq(
  $$
    SELECT tablename || '.' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || permissive
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename IN (
        'app_installations', 'conversation_mutes', 'conversation_read_states', 'data_export_jobs',
        'friend_invites', 'legal_acceptances', 'message_reactions', 'nix_capture_prefs',
        'nix_cleanup_queue', 'nixes', 'notification_preferences', 'product_analytics_preferences',
        'profiles', 'text_messages', 'user_activation_state'
      ))
      OR (schemaname = 'public' AND policyname IN ('friendships_delete', 'friendships_select', 'upload_logs_insert'))
      OR (schemaname = 'storage' AND policyname IN ('avatars_storage_delete', 'avatars_storage_insert', 'avatars_storage_update'))
  $$,
  ARRAY[
    'app_installations.app_installations_owner_select|SELECT|authenticated|PERMISSIVE',
    'conversation_mutes.conversation_mutes_owner|ALL|authenticated|PERMISSIVE',
    'conversation_read_states.conversation_read_states_owner|ALL|authenticated|PERMISSIVE',
    'data_export_jobs.data_export_jobs_owner_select|SELECT|authenticated|PERMISSIVE',
    'friend_invites.friend_invites_insert|INSERT|public|PERMISSIVE',
    'friend_invites.friend_invites_select|SELECT|public|PERMISSIVE',
    'friend_invites.friend_invites_update|UPDATE|public|PERMISSIVE',
    'friendships.friendships_delete|DELETE|public|PERMISSIVE',
    'friendships.friendships_select|SELECT|public|PERMISSIVE',
    'legal_acceptances.legal_acceptances_insert_own|INSERT|public|PERMISSIVE',
    'legal_acceptances.legal_acceptances_select_own|SELECT|public|PERMISSIVE',
    'message_reactions.message_reactions_delete|DELETE|authenticated|PERMISSIVE',
    'message_reactions.message_reactions_insert|INSERT|authenticated|PERMISSIVE',
    'message_reactions.message_reactions_select|SELECT|authenticated|PERMISSIVE',
    'message_reactions.message_reactions_update|UPDATE|authenticated|PERMISSIVE',
    'nix_capture_prefs.nix_capture_prefs_delete|DELETE|public|PERMISSIVE',
    'nix_capture_prefs.nix_capture_prefs_insert|INSERT|public|PERMISSIVE',
    'nix_capture_prefs.nix_capture_prefs_select|SELECT|public|PERMISSIVE',
    'nix_capture_prefs.nix_capture_prefs_update|UPDATE|public|PERMISSIVE',
    'nix_cleanup_queue.nix_cleanup_queue_select|SELECT|public|PERMISSIVE',
    'nixes.nixes_select|SELECT|authenticated|PERMISSIVE',
    'notification_preferences.notification_preferences_owner|ALL|authenticated|PERMISSIVE',
    'product_analytics_preferences.product_analytics_preferences_owner|ALL|authenticated|PERMISSIVE',
    'profiles.profiles_delete|DELETE|public|PERMISSIVE',
    'profiles.profiles_insert|INSERT|public|PERMISSIVE',
    'profiles.profiles_select|SELECT|public|PERMISSIVE',
    'profiles.profiles_update|UPDATE|public|PERMISSIVE',
    'text_messages.text_messages_insert|INSERT|authenticated|PERMISSIVE',
    'text_messages.text_messages_select|SELECT|authenticated|PERMISSIVE',
    'upload_logs.upload_logs_insert|INSERT|public|PERMISSIVE',
    'user_activation_state.user_activation_state_owner|ALL|authenticated|PERMISSIVE',
    'objects.avatars_storage_delete|DELETE|public|PERMISSIVE',
    'objects.avatars_storage_insert|INSERT|public|PERMISSIVE',
    'objects.avatars_storage_update|UPDATE|public|PERMISSIVE'
  ],
  'rewritten policies keep their command, roles and permissive mode'
);
SELECT is(
  (SELECT with_check FROM pg_policies WHERE schemaname = 'public' AND policyname = 'profiles_update'),
  NULL,
  'profiles_update still has no separate WITH CHECK'
);

-- Contract: row-independent calls are wrapped (initPlan) ------------------------
SELECT is_empty(
  $$
    SELECT schemaname || '.' || tablename || '.' || policyname
    FROM pg_policies
    WHERE (schemaname = 'public' OR (schemaname = 'storage' AND tablename = 'objects'))
      AND regexp_replace(
            coalesce(qual, '') || ' ' || coalesce(with_check, ''),
            '\( SELECT auth\.(uid|role)\(\) AS (uid|role)\)', '', 'g'
          ) ~ 'auth\.(uid|role)\(\)'
  $$,
  'no public/storage policy calls auth.uid() or auth.role() per row'
);
SELECT is_empty(
  $$
    SELECT schemaname || '.' || tablename || '.' || policyname
    FROM pg_policies
    WHERE (schemaname = 'public' OR (schemaname = 'storage' AND tablename = 'objects'))
      AND (
        coalesce(qual, '') || ' ' || coalesce(with_check, '')
          ~ '(?<!SELECT )private\.is_account_restricted\(\( SELECT auth\.uid\(\)'
        OR coalesce(qual, '') || ' ' || coalesce(with_check, '')
          ~ '(?<!SELECT )private\.pre_delivery_moderation_enabled\(\)'
      )
  $$,
  'actor-only helper calls in policies are evaluated once per statement'
);
SELECT matches(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND policyname = 'nixes_select'),
  'NOT private\.is_pair_blocked\(sender_id, receiver_id\)',
  'nixes_select keeps the per-row pair block check'
);
SELECT matches(
  (SELECT with_check FROM pg_policies WHERE schemaname = 'public' AND policyname = 'text_messages_insert'),
  'can_send_text_message\(sender_id, receiver_id\).*text_message_passes_safety_filter\(body\)',
  'text_messages_insert keeps the per-row send and safety checks'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid IN (
      'public.get_public_profiles_by_ids(uuid[])'::regprocedure,
      'public.list_accepted_friends_paginated(integer, timestamp with time zone)'::regprocedure
    )
    AND regexp_replace(prosrc, '\(SELECT auth\.uid\(\)\)', '', 'g') ~ 'auth\.uid\(\)'
  ),
  'profile RPCs evaluate auth.uid() through a sub-select'
);
SELECT ok(
  (SELECT bool_and(prosecdef AND provolatile = 's' AND proconfig @> ARRAY['search_path=""'])
   FROM pg_proc
   WHERE oid IN (
     'public.get_public_profiles_by_ids(uuid[])'::regprocedure,
     'public.list_accepted_friends_paginated(integer, timestamp with time zone)'::regprocedure
   )),
  'profile RPCs stay STABLE SECURITY DEFINER with an empty search_path'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_public_profiles_by_ids(uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_public_profiles_by_ids(uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.list_accepted_friends_paginated(integer, timestamp with time zone)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.list_accepted_friends_paginated(integer, timestamp with time zone)', 'EXECUTE'),
  'profile RPC grants are unchanged'
);

-- Fixtures ---------------------------------------------------------------------
-- A <-> B friends, B <-> C friends, A blocks nobody; D is banned.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('c9000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'initplan-a@example.invalid', 'x', now(), '{}', '{}', now(), now()),
  ('c9000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'initplan-b@example.invalid', 'x', now(), '{}', '{}', now(), now()),
  ('c9000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'initplan-c@example.invalid', 'x', now(), '{}', '{}', now(), now()),
  ('c9000000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'initplan-d@example.invalid', 'x', now(), '{}', '{}', now(), now());

UPDATE public.profiles
SET username = 'initplan_' || right(id::text, 1)
WHERE id IN (
  'c9000000-0000-4000-8000-00000000000a', 'c9000000-0000-4000-8000-00000000000b',
  'c9000000-0000-4000-8000-00000000000c', 'c9000000-0000-4000-8000-00000000000d'
);

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES
  ('c9000000-0000-4000-8000-00000000000a', 'c9000000-0000-4000-8000-00000000000b', 'accepted'),
  ('c9000000-0000-4000-8000-00000000000b', 'c9000000-0000-4000-8000-00000000000c', 'accepted'),
  ('c9000000-0000-4000-8000-00000000000d', 'c9000000-0000-4000-8000-00000000000b', 'accepted');

-- Direct nix / text fixtures need the legacy (non pre-delivery) path; rolled back.
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

INSERT INTO public.nixes(id, sender_id, receiver_id, media_path, media_type, status, is_viewed)
VALUES
  ('c9100000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-00000000000a', 'c9000000-0000-4000-8000-00000000000b', 'nixes/c9/a-to-b.jpg', 'image', 'sent', FALSE),
  ('c9100000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-00000000000b', 'c9000000-0000-4000-8000-00000000000c', 'nixes/c9/b-to-c.jpg', 'image', 'sent', FALSE),
  ('c9100000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-00000000000b', 'c9000000-0000-4000-8000-00000000000d', 'nixes/c9/b-to-d.jpg', 'image', 'sent', FALSE);

INSERT INTO public.text_messages(id, sender_id, receiver_id, body, client_message_id)
VALUES
  ('c9200000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-00000000000a', 'c9000000-0000-4000-8000-00000000000b', 'hello b', 'c9-a-b'),
  ('c9200000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-00000000000b', 'c9000000-0000-4000-8000-00000000000c', 'hello c', 'c9-b-c');

INSERT INTO public.message_reactions(id, message_id, user_id, emoji)
VALUES
  ('c9300000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-00000000000b', 'heart'),
  ('c9300000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-00000000000c', 'thumbsup');

INSERT INTO moderation.account_actions(target_user_id, action, reason)
VALUES ('c9000000-0000-4000-8000-00000000000d', 'ban', 'initplan wrap test ban');

-- Behaviour as A ---------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c9000000-0000-4000-8000-00000000000a","role":"authenticated"}',
  TRUE
);

SELECT results_eq(
  $$SELECT id FROM public.nixes ORDER BY id$$,
  $$VALUES ('c9100000-0000-4000-8000-000000000001'::uuid)$$,
  'A sees only own nixes'
);
SELECT results_eq(
  $$SELECT id FROM public.text_messages ORDER BY id$$,
  $$VALUES ('c9200000-0000-4000-8000-000000000001'::uuid)$$,
  'A sees only own text messages'
);
SELECT results_eq(
  $$SELECT id FROM public.message_reactions ORDER BY id$$,
  $$VALUES ('c9300000-0000-4000-8000-000000000001'::uuid)$$,
  'A sees only reactions on own conversations'
);
SELECT results_eq(
  $$SELECT friend_id FROM public.friendships ORDER BY friend_id$$,
  $$VALUES ('c9000000-0000-4000-8000-00000000000b'::uuid)$$,
  'A sees only own friendships'
);
SELECT results_eq(
  $$SELECT id FROM public.profiles$$,
  $$VALUES ('c9000000-0000-4000-8000-00000000000a'::uuid)$$,
  'A reads only own profile row directly'
);
SELECT lives_ok(
  $$
    INSERT INTO public.message_reactions(message_id, user_id, emoji)
    VALUES ('c9200000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-00000000000a', 'thumbsup')
  $$,
  'A can react to a message in own conversation'
);
SELECT throws_ok(
  $$
    INSERT INTO public.message_reactions(message_id, user_id, emoji)
    VALUES ('c9200000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-00000000000a', 'heart')
  $$,
  '42501',
  'new row violates row-level security policy for table "message_reactions"',
  'A cannot react to a message in a foreign conversation'
);
SELECT throws_ok(
  $$
    INSERT INTO public.message_reactions(message_id, user_id, emoji)
    VALUES ('c9200000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-00000000000b', 'hahaha')
  $$,
  '42501',
  'new row violates row-level security policy for table "message_reactions"',
  'A cannot write a reaction as another user'
);
SELECT is_empty(
  $$DELETE FROM public.message_reactions WHERE id = 'c9300000-0000-4000-8000-000000000001' RETURNING id$$,
  'A cannot delete B''s reaction'
);
SELECT is_empty(
  $$DELETE FROM public.friendships WHERE user_id = 'c9000000-0000-4000-8000-00000000000b' AND friend_id = 'c9000000-0000-4000-8000-00000000000c' RETURNING id$$,
  'A cannot delete a foreign friendship'
);
SELECT lives_ok(
  $$
    INSERT INTO public.text_messages(sender_id, receiver_id, body, client_message_id)
    VALUES ('c9000000-0000-4000-8000-00000000000a', 'c9000000-0000-4000-8000-00000000000b', 'again', 'c9-a-b-2')
  $$,
  'A can send a text to a friend'
);
SELECT throws_ok(
  $$
    INSERT INTO public.text_messages(sender_id, receiver_id, body, client_message_id)
    VALUES ('c9000000-0000-4000-8000-00000000000b', 'c9000000-0000-4000-8000-00000000000a', 'spoof', 'c9-spoof')
  $$,
  '42501',
  'new row violates row-level security policy for table "text_messages"',
  'A cannot send a text as B'
);
RESET ROLE;
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = TRUE WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$
    INSERT INTO public.text_messages(sender_id, receiver_id, body, client_message_id)
    VALUES ('c9000000-0000-4000-8000-00000000000a', 'c9000000-0000-4000-8000-00000000000b', 'direct', 'c9-a-b-3')
  $$,
  '42501',
  'new row violates row-level security policy for table "text_messages"',
  'direct text insert is still rejected while pre-delivery moderation is on'
);
RESET ROLE;
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$SELECT id FROM public.get_public_profiles_by_ids(ARRAY[
      'c9000000-0000-4000-8000-00000000000b',
      'c9000000-0000-4000-8000-00000000000d'
    ]::uuid[])$$,
  $$VALUES ('c9000000-0000-4000-8000-00000000000b'::uuid)$$,
  'get_public_profiles_by_ids still hides restricted accounts'
);
SELECT results_eq(
  $$SELECT id FROM public.list_accepted_friends_paginated(50, NULL)$$,
  $$VALUES ('c9000000-0000-4000-8000-00000000000b'::uuid)$$,
  'list_accepted_friends_paginated returns only A''s friends'
);

-- Behaviour as B (two friends, one of them banned) ------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c9000000-0000-4000-8000-00000000000b","role":"authenticated"}',
  TRUE
);
SELECT results_eq(
  $$SELECT id FROM public.list_accepted_friends_paginated(50, NULL) ORDER BY id$$,
  $$VALUES ('c9000000-0000-4000-8000-00000000000a'::uuid), ('c9000000-0000-4000-8000-00000000000c'::uuid)$$,
  'list_accepted_friends_paginated still hides the banned friend'
);
SELECT is(
  (SELECT count(*) FROM public.nixes),
  3::BIGINT,
  'B sees nixes in all three of own conversations'
);
SELECT is(
  (SELECT count(*) FROM public.message_reactions),
  3::BIGINT,
  'B sees reactions on both own conversations'
);

-- Behaviour as the banned account D ---------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c9000000-0000-4000-8000-00000000000d","role":"authenticated"}',
  TRUE
);
SELECT is(
  (SELECT count(*) FROM public.nixes),
  0::BIGINT,
  'a restricted account sees no nixes (initPlan restriction check)'
);
SELECT is_empty(
  $$SELECT id FROM public.get_public_profiles_by_ids(ARRAY['c9000000-0000-4000-8000-00000000000b']::uuid[])$$,
  'a restricted account gets no public profiles'
);
SELECT is_empty(
  $$SELECT id FROM public.list_accepted_friends_paginated(50, NULL)$$,
  'a restricted account gets no friends list'
);

-- Anonymous callers --------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
SELECT is(
  (SELECT count(*) FROM public.friendships),
  0::BIGINT,
  'anon sees no friendships'
);
SELECT is(
  (SELECT count(*) FROM public.profiles),
  0::BIGINT,
  'anon sees no profiles'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
