BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(16);

INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reporter-a@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reporter-b@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'a1000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reporter-c@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  );

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'accepted'
);

INSERT INTO public.text_messages(id, sender_id, receiver_id, body)
VALUES (
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'hello from A to B'
);

INSERT INTO public.nixes(id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status)
VALUES (
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'nixes/a/test.jpg',
  'image',
  5,
  'sent'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}',
  TRUE
);

SELECT is(
  (
    SELECT reported_user_id
    FROM public.create_content_report_v2(
      'harassment',
      NULL,
      'a2000000-0000-0000-0000-000000000001',
      NULL,
      NULL
    )
  ),
  'a1000000-0000-0000-0000-000000000001'::UUID,
  'B reporting A→B attributes the report to sender A'
);

SELECT is(
  (
    SELECT text_message_id
    FROM public.create_content_report_v2(
      'harassment',
      NULL,
      'a2000000-0000-0000-0000-000000000001',
      NULL,
      NULL
    )
  ),
  'a2000000-0000-0000-0000-000000000001'::UUID,
  'text report stores the authorized text_message_id'
);

SELECT ok(
  (
    SELECT evidence_expires_at BETWEEN NOW() + INTERVAL '29 days' AND NOW() + INTERVAL '31 days'
    FROM public.create_content_report_v2(
      'harassment',
      NULL,
      'a2000000-0000-0000-0000-000000000001',
      NULL,
      NULL
    )
  ),
  'text report evidence expires in about 30 days'
);

SELECT is(
  (
    SELECT report_id
    FROM public.create_content_report_v2(
      'harassment',
      NULL,
      'a2000000-0000-0000-0000-000000000001',
      NULL,
      NULL
    )
  ),
  (
    SELECT report_id
    FROM public.create_content_report_v2(
      'spam',
      NULL,
      'a2000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      NULL
    )
  ),
  'retry returns the same report_id and accepts a matching legacy assertion'
);

SELECT is(
  (
    SELECT COUNT(*)::INT
    FROM public.content_reports
    WHERE reporter_id = 'a1000000-0000-0000-0000-000000000002'
      AND text_message_id = 'a2000000-0000-0000-0000-000000000001'
  ),
  1,
  'retry does not insert a second text report'
);

SELECT throws_ok(
  $$SELECT * FROM public.create_content_report_v2(
    'harassment',
    NULL,
    'a2000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000003',
    NULL
  )$$,
  'P0001',
  'Invalid legacy reported user',
  'mismatched legacy reportedUserId is rejected'
);

SELECT throws_ok(
  $$SELECT * FROM public.create_content_report_v2(
    'harassment',
    'a3000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000001',
    NULL,
    NULL
  )$$,
  'P0001',
  'Invalid report target',
  'nixId + textMessageId is rejected'
);

SELECT ok(
  (
    SELECT evidence_expires_at BETWEEN NOW() + INTERVAL '29 days' AND NOW() + INTERVAL '31 days'
    FROM public.create_content_report_v2(
      'spam',
      'a3000000-0000-0000-0000-000000000001',
      NULL,
      NULL,
      NULL
    )
  ),
  'NiX report evidence expires in about 30 days'
);

SELECT ok(
  (
    SELECT evidence_expires_at IS NULL
    FROM public.create_content_report_v2(
      'spam',
      NULL,
      NULL,
      'a1000000-0000-0000-0000-000000000001',
      NULL
    )
  ),
  'user-only report does not require evidence retention'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}',
  TRUE
);

SELECT throws_ok(
  $$SELECT * FROM public.create_content_report_v2(
    'harassment',
    NULL,
    'a2000000-0000-0000-0000-000000000001',
    NULL,
    NULL
  )$$,
  'P0001',
  'Message is not reportable',
  'A cannot report a message they sent'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated"}',
  TRUE
);

SELECT throws_ok(
  $$SELECT * FROM public.create_content_report_v2(
    'harassment',
    NULL,
    'a2000000-0000-0000-0000-000000000001',
    NULL,
    NULL
  )$$,
  'P0001',
  'Message is not reportable',
  'C cannot report a message between A and B'
);

SELECT throws_ok(
  $$SELECT * FROM public.create_content_report_v2(
    'harassment',
    NULL,
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    NULL,
    NULL
  )$$,
  'P0001',
  'Message is not reportable',
  'missing text UUID uses the same error as an unauthorized message'
);

SELECT is(
  (
    SELECT COUNT(*)::INT
    FROM public.content_reports
    WHERE reporter_id = 'a1000000-0000-0000-0000-000000000003'
  ),
  0,
  'C does not create a report row'
);

RESET ROLE;

SELECT is(
  (
    SELECT COUNT(*)::INT
    FROM public.content_reports
    WHERE evidence_path IS NOT NULL AND evidence_expires_at IS NULL
  ),
  0,
  'no stored evidence is missing an expiry after backfill'
);

INSERT INTO storage.objects(bucket_id, name, owner, created_at)
VALUES
  (
    'moderation-evidence',
    'orphan-old/evidence.json',
    'a1000000-0000-0000-0000-000000000002',
    NOW() - INTERVAL '25 hours'
  ),
  (
    'moderation-evidence',
    'orphan-young/evidence.json',
    'a1000000-0000-0000-0000-000000000002',
    NOW() - INTERVAL '1 hour'
  );

SELECT results_eq(
  $$SELECT object_name, eligible
    FROM public.list_moderation_evidence_orphans()
    ORDER BY object_name$$,
  $$VALUES
    ('orphan-old/evidence.json'::TEXT, TRUE),
    ('orphan-young/evidence.json'::TEXT, FALSE)$$,
  'orphans older than 24 hours are eligible for deletion'
);

SELECT ok(
  to_regprocedure('public.create_content_report(text, uuid, uuid, text)') IS NOT NULL,
  'v1 create_content_report remains until a follow-up contract PR'
);

SELECT * FROM finish();
ROLLBACK;
