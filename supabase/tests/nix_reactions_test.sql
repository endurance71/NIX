BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(37);

-- Fixtures ------------------------------------------------------------------
-- e7..01 sender, e7..02 receiver, e7..03 unrelated, e7..04 blocked by the receiver.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('e7000000-0000-4000-8000-000000000001', 'nixreact-sender@example.invalid'),
  ('e7000000-0000-4000-8000-000000000002', 'nixreact-receiver@example.invalid'),
  ('e7000000-0000-4000-8000-000000000003', 'nixreact-other@example.invalid'),
  ('e7000000-0000-4000-8000-000000000004', 'nixreact-blocked@example.invalid')
) AS u(id, email);

INSERT INTO public.age_attestations(user_id, minimum_age, policy_version)
SELECT id, 16, '2026-07-15'
FROM public.profiles
WHERE id::TEXT LIKE 'e7000000-0000-4000-8000-00000000000_'
ON CONFLICT (user_id) DO NOTHING;

-- Direct nix fixtures need the legacy (non pre-delivery) path; rolled back.
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

INSERT INTO public.nixes(id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status, is_viewed)
VALUES
  -- sender -> receiver, unopened
  ('e7100000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000002',
   'nixes/e7/one.jpg', 'image', 5, 'sent', FALSE),
  -- sender -> receiver, opened and cleaned
  ('e7100000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000002',
   'nixes/e7/two.jpg', 'image', 5, 'cleaned', TRUE),
  -- blocked user -> receiver
  ('e7100000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000004', 'e7000000-0000-4000-8000-000000000002',
   'nixes/e7/blocked.jpg', 'image', 5, 'sent', FALSE);

INSERT INTO public.user_blocks(blocker_id, blocked_id)
VALUES ('e7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000004');

CREATE TEMP VIEW test_nix_broadcasts AS
SELECT topic, event, payload, private
FROM realtime.messages
WHERE event = 'nix_reaction_changed'
  AND topic LIKE 'user:e7000000-0000-4000-8000-00000000000_';
GRANT SELECT ON test_nix_broadcasts TO authenticated;

-- Contract ------------------------------------------------------------------
SELECT has_table('public', 'nix_reactions', 'nix_reactions exists');
SELECT col_is_pk('public', 'nix_reactions', ARRAY['nix_id', 'user_id'], 'one reaction per user per NiX');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nix_reactions'::regclass),
  'RLS is enabled on nix_reactions'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_proc
    WHERE oid IN (
      'public.set_nix_reaction(uuid,text)'::regprocedure,
      'public.remove_nix_reaction(uuid)'::regprocedure,
      'public.get_nix_reactions(uuid[])'::regprocedure
    )
      AND NOT prosecdef
      AND proconfig @> ARRAY['search_path=""']
  ),
  3,
  'reaction RPCs are SECURITY INVOKER with an empty search_path'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.set_nix_reaction(uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.remove_nix_reaction(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_nix_reactions(uuid[])', 'EXECUTE'),
  'authenticated can execute the reaction RPCs'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.set_nix_reaction(uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.remove_nix_reaction(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_nix_reactions(uuid[])', 'EXECUTE'),
  'anon cannot execute the reaction RPCs'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.nix_reactions', 'SELECT'),
  'anon has no table access'
);
SELECT ok(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""']
   FROM pg_proc WHERE oid = 'private.broadcast_nix_reaction_changes()'::regprocedure)
  AND NOT has_function_privilege('authenticated', 'private.broadcast_nix_reaction_changes()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.broadcast_nix_reaction_changes()', 'EXECUTE'),
  'broadcast trigger function is SECURITY DEFINER, pins search_path and is not client-callable'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'nix_reactions'
  ),
  'nix_reactions is not streamed through postgres_changes'
);

-- Receiver ------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e7000000-0000-4000-8000-000000000002","role":"authenticated"}', TRUE);

SELECT is(
  (SELECT emoji FROM public.set_nix_reaction('e7100000-0000-4000-8000-000000000001', 'heart')),
  'heart',
  'the receiver can react'
);
SELECT is(
  (SELECT emoji FROM public.set_nix_reaction('e7100000-0000-4000-8000-000000000001', 'hahaha')),
  'hahaha',
  'the receiver can change the reaction'
);
SELECT is(
  (SELECT count(*)::integer FROM public.nix_reactions WHERE nix_id = 'e7100000-0000-4000-8000-000000000001'),
  1,
  'changing keeps a single row'
);
SELECT is(
  (SELECT emoji FROM public.set_nix_reaction('e7100000-0000-4000-8000-000000000001', 'hahaha')),
  'hahaha',
  'setting the same emoji again returns the existing reaction'
);
SELECT is(
  (SELECT emoji FROM public.set_nix_reaction('e7100000-0000-4000-8000-000000000002', 'thumbsup')),
  'thumbsup',
  'the receiver can react to an opened, cleaned NiX'
);
SELECT throws_ok(
  $$SELECT public.set_nix_reaction('e7100000-0000-4000-8000-000000000001', 'fire')$$,
  '23514',
  NULL,
  'emoji outside the tapback set is rejected'
);
SELECT throws_ok(
  $$SELECT public.set_nix_reaction('e7100000-0000-4000-8000-000000000003', 'heart')$$,
  'P0002',
  'NiX not available for reaction',
  'no reaction on a NiX from a blocked user'
);
SELECT throws_ok(
  $$INSERT INTO public.nix_reactions(nix_id, user_id, emoji)
    VALUES ('e7100000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000002', 'heart')$$,
  '42501',
  NULL,
  'direct insert on a blocked NiX is rejected by RLS'
);
SELECT throws_ok(
  $$UPDATE public.nix_reactions SET created_at = now() - interval '1 day'
    WHERE nix_id = 'e7100000-0000-4000-8000-000000000001'$$,
  '42501',
  NULL,
  'created_at is not writable'
);
SELECT is(
  (SELECT count(*)::integer FROM public.get_nix_reactions(ARRAY[
    'e7100000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000002',
    'e7100000-0000-4000-8000-000000000003'
  ]::uuid[])),
  2,
  'the receiver reads their reactions'
);

-- Sender --------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"e7000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);

SELECT results_eq(
  $$SELECT nix_id, user_id, emoji FROM public.get_nix_reactions(ARRAY[
      'e7100000-0000-4000-8000-000000000001',
      'e7100000-0000-4000-8000-000000000002'
    ]::uuid[])$$,
  $$VALUES
      ('e7100000-0000-4000-8000-000000000001'::uuid, 'e7000000-0000-4000-8000-000000000002'::uuid, 'hahaha'),
      ('e7100000-0000-4000-8000-000000000002'::uuid, 'e7000000-0000-4000-8000-000000000002'::uuid, 'thumbsup')$$,
  'the sender sees the receiver''s reactions'
);
SELECT throws_ok(
  $$SELECT public.set_nix_reaction('e7100000-0000-4000-8000-000000000001', 'heart')$$,
  'P0002',
  'NiX not available for reaction',
  'the sender cannot react to their own NiX'
);
SELECT throws_ok(
  $$INSERT INTO public.nix_reactions(nix_id, user_id, emoji)
    VALUES ('e7100000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'heart')$$,
  '42501',
  NULL,
  'direct insert by the sender is rejected by RLS'
);
SELECT throws_ok(
  $$INSERT INTO public.nix_reactions(nix_id, user_id, emoji)
    VALUES ('e7100000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000002', 'heart')$$,
  '42501',
  NULL,
  'the sender cannot write a reaction as the receiver'
);
SELECT is(
  public.remove_nix_reaction('e7100000-0000-4000-8000-000000000001'),
  FALSE,
  'the sender cannot remove the receiver''s reaction'
);
UPDATE public.nix_reactions SET emoji = 'thumbsdown' WHERE nix_id = 'e7100000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT emoji FROM public.get_nix_reactions(ARRAY['e7100000-0000-4000-8000-000000000001']::uuid[])),
  'hahaha',
  'the sender cannot change the receiver''s reaction'
);

-- Unrelated user --------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"e7000000-0000-4000-8000-000000000003","role":"authenticated"}', TRUE);

SELECT is(
  (SELECT count(*)::integer FROM public.get_nix_reactions(ARRAY[
    'e7100000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000002'
  ]::uuid[])),
  0,
  'an unrelated user reads nothing'
);
SELECT is(
  (SELECT count(*)::integer FROM public.nix_reactions),
  0,
  'an unrelated user sees no rows through the table'
);
SELECT throws_ok(
  $$SELECT public.set_nix_reaction('e7100000-0000-4000-8000-000000000001', 'heart')$$,
  'P0002',
  'NiX not available for reaction',
  'an unrelated user cannot react'
);

RESET ROLE;

-- Broadcasts ------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::integer FROM test_nix_broadcasts WHERE topic = 'user:e7000000-0000-4000-8000-000000000001'),
  3,
  'the sender got one broadcast per effective write (insert, change, second NiX); the no-op set sent none'
);
SELECT is(
  (SELECT count(*)::integer FROM test_nix_broadcasts WHERE topic = 'user:e7000000-0000-4000-8000-000000000002'),
  3,
  'the receiver got the same broadcasts'
);
SELECT is(
  (SELECT count(*)::integer FROM test_nix_broadcasts
   WHERE topic IN ('user:e7000000-0000-4000-8000-000000000003', 'user:e7000000-0000-4000-8000-000000000004')),
  0,
  'unrelated and blocked users receive nothing'
);
SELECT ok(
  (SELECT bool_and(private AND payload ? 'nix_ids' AND payload ? 'peer_ids' AND NOT payload ? 'emoji')
   FROM test_nix_broadcasts),
  'broadcasts are private and carry ids only'
);
SELECT is(
  (SELECT payload -> 'peer_ids' FROM test_nix_broadcasts
   WHERE topic = 'user:e7000000-0000-4000-8000-000000000001' LIMIT 1),
  '["e7000000-0000-4000-8000-000000000002"]'::jsonb,
  'the sender''s broadcast names the receiver as peer'
);

-- Receiver removes ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e7000000-0000-4000-8000-000000000002","role":"authenticated"}', TRUE);

SELECT is(
  public.remove_nix_reaction('e7100000-0000-4000-8000-000000000001'),
  TRUE,
  'the receiver removes their reaction'
);
SELECT is(
  public.remove_nix_reaction('e7100000-0000-4000-8000-000000000001'),
  FALSE,
  'removing again reports nothing removed'
);
RESET ROLE;

SELECT is(
  (SELECT payload ->> 'op' FROM test_nix_broadcasts
   WHERE topic = 'user:e7000000-0000-4000-8000-000000000001' AND payload ->> 'op' = 'DELETE' LIMIT 1),
  'DELETE',
  'removal is broadcast to the sender'
);

-- Cascade -------------------------------------------------------------------------
DELETE FROM public.nixes WHERE id = 'e7100000-0000-4000-8000-000000000002';
SELECT is(
  (SELECT count(*)::integer FROM public.nix_reactions WHERE nix_id = 'e7100000-0000-4000-8000-000000000002'),
  0,
  'reactions are deleted with their NiX'
);

SELECT * FROM finish();
ROLLBACK;
