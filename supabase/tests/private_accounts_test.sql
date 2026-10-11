BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

-- Fixtures: f9..01 = A (searcher), f9..02 = P (private), f9..03 = O (public).
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('f9000000-0000-4000-8000-000000000001', 'priv-a@example.invalid'),
  ('f9000000-0000-4000-8000-000000000002', 'priv-p@example.invalid'),
  ('f9000000-0000-4000-8000-000000000003', 'priv-o@example.invalid')
) AS u(id, email);

UPDATE public.profiles SET username = 'privsearcher' WHERE id = 'f9000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET username = 'privhidden', is_private = true WHERE id = 'f9000000-0000-4000-8000-000000000002';
UPDATE public.profiles SET username = 'privopen', is_private = false WHERE id = 'f9000000-0000-4000-8000-000000000003';

INSERT INTO public.age_attestations(user_id, minimum_age, policy_version)
SELECT id, 16, '2026-07-15'
FROM public.profiles
WHERE id::TEXT LIKE 'f9000000-0000-4000-8000-00000000000_'
ON CONFLICT (user_id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f9000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);

SELECT is(
  (SELECT count(*) FROM public.get_public_profile_by_username('privhidden'))::INT, 0,
  'a private profile is not found by username'
);
SELECT is(
  (SELECT count(*) FROM public.get_public_profile_by_username('PRIVHIDDEN'))::INT, 0,
  'the lookup stays case-insensitive and still hides the private profile'
);
SELECT is(
  (SELECT count(*) FROM public.get_public_profile_by_username('privopen'))::INT, 1,
  'a public profile is still found by username'
);

SELECT throws_ok(
  $$ INSERT INTO public.friendships(user_id, friend_id, status)
     VALUES ('f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'pending') $$,
  '42501', NULL,
  'a direct friend request to a private profile is rejected'
);
SELECT lives_ok(
  $$ INSERT INTO public.friendships(user_id, friend_id, status)
     VALUES ('f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000003', 'pending') $$,
  'a direct friend request to a public profile still works'
);

-- The private user can still reach out, and the request can be accepted.
SELECT set_config('request.jwt.claims', '{"sub":"f9000000-0000-4000-8000-000000000002","role":"authenticated"}', TRUE);
SELECT lives_ok(
  $$ INSERT INTO public.friendships(user_id, friend_id, status)
     VALUES ('f9000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001', 'pending') $$,
  'a private user can send a request to a public profile'
);
SELECT set_config('request.jwt.claims', '{"sub":"f9000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT lives_ok(
  $$ UPDATE public.friendships SET status = 'accepted'
     WHERE user_id = 'f9000000-0000-4000-8000-000000000002'
       AND friend_id = 'f9000000-0000-4000-8000-000000000001' $$,
  'a request from a private user can be accepted'
);
SELECT is(
  (SELECT status FROM public.friendships
   WHERE user_id = 'f9000000-0000-4000-8000-000000000002'
     AND friend_id = 'f9000000-0000-4000-8000-000000000001'),
  'accepted',
  'the friendship with the private user is accepted'
);

SELECT * FROM finish();
ROLLBACK;
