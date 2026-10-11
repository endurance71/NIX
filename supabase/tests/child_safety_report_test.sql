BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

-- Fixtures: f8..01 = reporter, f8..02 = reported user.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('f8000000-0000-4000-8000-000000000001', 'child-a@example.invalid'),
  ('f8000000-0000-4000-8000-000000000002', 'child-b@example.invalid')
) AS u(id, email);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);

SELECT lives_ok(
  $$ SELECT * FROM public.create_content_report_v2(
       'child_safety', NULL, NULL, 'f8000000-0000-4000-8000-000000000002'::UUID, NULL) $$,
  'a child-safety report is accepted'
);
SELECT throws_ok(
  $$ SELECT * FROM public.create_content_report_v2(
       'not_a_reason', NULL, NULL, 'f8000000-0000-4000-8000-000000000002'::UUID, NULL) $$,
  'P0001', 'Invalid report reason',
  'unknown reasons are still rejected'
);

RESET ROLE;
SELECT is(
  (SELECT priority FROM public.content_reports
   WHERE reporter_id = 'f8000000-0000-4000-8000-000000000001' AND reason = 'child_safety'),
  'critical',
  'a child-safety report is triaged as critical'
);
SELECT is(
  (SELECT priority FROM public.content_reports
   WHERE reporter_id = 'f8000000-0000-4000-8000-000000000001' AND reason = 'child_safety'
     AND reported_user_id = 'f8000000-0000-4000-8000-000000000002'),
  'critical',
  'the report targets the reported user'
);

SELECT * FROM finish();
ROLLBACK;
