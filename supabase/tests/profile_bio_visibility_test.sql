BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bio-owner@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bio-friend@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bio-stranger@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  );

UPDATE public.profiles
SET bio = CASE id
  WHEN '30000000-0000-0000-0000-000000000002'::UUID THEN 'Opis znajomego'
  WHEN '30000000-0000-0000-0000-000000000003'::UUID THEN 'Opis obcej osoby'
END,
username = CASE id
  WHEN '30000000-0000-0000-0000-000000000001'::UUID THEN 'bio_owner'
  WHEN '30000000-0000-0000-0000-000000000002'::UUID THEN 'bio_friend'
  WHEN '30000000-0000-0000-0000-000000000003'::UUID THEN 'bio_stranger'
END
WHERE id IN (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000003'
);

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'accepted'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  TRUE
);

SELECT is(
  (SELECT count(*) FROM public.list_accepted_friends_paginated(50, NULL)),
  1::BIGINT,
  'accepted friends RPC returns only accepted relations'
);
SELECT is(
  (SELECT bio FROM public.list_accepted_friends_paginated(50, NULL) LIMIT 1),
  'Opis znajomego'::TEXT,
  'accepted friends RPC returns the friend bio'
);
SELECT is(
  (SELECT count(*) FROM public.list_accepted_friends_paginated(50, NULL) WHERE username = 'bio_stranger'),
  0::BIGINT,
  'accepted friends RPC does not expose a stranger bio'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET bio = repeat('x', 141) WHERE id = '30000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_bio_length"',
  'profile bio rejects values longer than 140 characters'
);

SELECT * FROM finish();
ROLLBACK;
