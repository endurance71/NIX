BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'pins1@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'pins2@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'pins3@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  );

-- Contract ----------------------------------------------------------------------
SELECT has_table('public', 'conversation_pins', 'conversation_pins exists');
SELECT policies_are('public', 'conversation_pins', ARRAY['conversation_pins_owner']);
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.conversation_pins'::regclass),
  TRUE,
  'RLS is enabled on conversation_pins'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.conversation_pins', 'SELECT'),
  'anon cannot read pins'
);

INSERT INTO public.conversation_pins(user_id, peer_id)
VALUES
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  TRUE
);

SELECT is(
  (SELECT count(*) FROM public.conversation_pins),
  1::BIGINT,
  'a user sees only their own pins'
);
SELECT is(
  (SELECT peer_id FROM public.conversation_pins),
  '30000000-0000-0000-0000-000000000002'::UUID,
  'the visible pin is the owner''s'
);

SELECT lives_ok(
  $$INSERT INTO public.conversation_pins(user_id, peer_id)
    VALUES ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003')$$,
  'a user can pin a conversation for themselves'
);
SELECT throws_ok(
  $$INSERT INTO public.conversation_pins(user_id, peer_id)
    VALUES ('30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003')$$,
  '42501',
  NULL,
  'a user cannot write a pin for someone else'
);
SELECT throws_ok(
  $$INSERT INTO public.conversation_pins(user_id, peer_id)
    VALUES ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001')$$,
  '23514',
  NULL,
  'a user cannot pin themselves'
);

UPDATE public.conversation_pins SET pinned_at = now() - interval '1 day'
WHERE user_id = '30000000-0000-0000-0000-000000000002';
DELETE FROM public.conversation_pins WHERE user_id = '30000000-0000-0000-0000-000000000002';

RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.conversation_pins WHERE user_id = '30000000-0000-0000-0000-000000000002'),
  1::BIGINT,
  'another user''s pin can be neither updated nor deleted'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  TRUE
);
DELETE FROM public.conversation_pins WHERE peer_id = '30000000-0000-0000-0000-000000000003';
SELECT is(
  (SELECT count(*) FROM public.conversation_pins),
  1::BIGINT,
  'a user can unpin their own conversation'
);

RESET ROLE;
DELETE FROM auth.users WHERE id = '30000000-0000-0000-0000-000000000002';
SELECT is(
  (SELECT count(*) FROM public.conversation_pins),
  0::BIGINT,
  'pins cascade away with either account'
);

SELECT * FROM finish();
ROLLBACK;
