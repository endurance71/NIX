BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(18);

INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    'd1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'remove-a@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'remove-b@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'd1000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'remove-c@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  );

INSERT INTO public.text_messages(id, sender_id, receiver_id, body)
VALUES
  (
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'reported text from A to B'
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'other text that must remain'
  );

INSERT INTO public.media_assets (
  id, owner_id, storage_path, media_type, content_type, size_bytes, status, created_at, ready_at
)
VALUES
  (
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'nixes/d1000000-0000-4000-8000-000000000001/shared.jpg',
    'image',
    'image/jpeg',
    1024,
    'ready',
    now(),
    now()
  ),
  (
    'd3000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000003',
    'nixes/d1000000-0000-4000-8000-000000000003/foreign.jpg',
    'image',
    'image/jpeg',
    2048,
    'ready',
    now(),
    now()
  );

INSERT INTO public.nixes (
  id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status, asset_id
)
VALUES
  (
    'd4000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'nixes/d1000000-0000-4000-8000-000000000001/shared.jpg',
    'image',
    5,
    'sent',
    'd3000000-0000-4000-8000-000000000001'
  ),
  (
    'd4000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000003',
    'nixes/d1000000-0000-4000-8000-000000000001/shared.jpg',
    'image',
    5,
    'sent',
    'd3000000-0000-4000-8000-000000000001'
  ),
  (
    'd4000000-0000-4000-8000-000000000003',
    'd1000000-0000-4000-8000-000000000003',
    'd1000000-0000-4000-8000-000000000002',
    'nixes/d1000000-0000-4000-8000-000000000003/foreign.jpg',
    'image',
    5,
    'sent',
    'd3000000-0000-4000-8000-000000000002'
  );

INSERT INTO public.content_reports (
  id, reporter_id, reported_user_id, text_message_id, nix_id, reason, status,
  evidence_path, evidence_expires_at
)
VALUES
  (
    'd5000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    NULL,
    'harassment',
    'open',
    'd5000000-0000-4000-8000-000000000001/evidence.json',
    now() + interval '30 days'
  ),
  (
    'd5000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    NULL,
    'd4000000-0000-4000-8000-000000000001',
    'harassment',
    'open',
    'd5000000-0000-4000-8000-000000000002/evidence.json',
    now() + interval '30 days'
  ),
  (
    'd5000000-0000-4000-8000-000000000003',
    'd1000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    NULL,
    NULL,
    'spam',
    'open',
    NULL,
    NULL
  );

SELECT lives_ok(
  $$SELECT public.moderation_remove_reported_content('d5000000-0000-4000-8000-000000000001')$$,
  'removing a text report target succeeds'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.text_messages
    WHERE id = 'd2000000-0000-4000-8000-000000000001'
  ),
  'only the reported text message is deleted'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.text_messages
    WHERE id = 'd2000000-0000-4000-8000-000000000002'
  ),
  'unrelated text remains'
);

SELECT is(
  (
    SELECT evidence_path
    FROM public.content_reports
    WHERE id = 'd5000000-0000-4000-8000-000000000001'
  ),
  'd5000000-0000-4000-8000-000000000001/evidence.json',
  'text report evidence path remains after removal'
);

SELECT is(
  (
    SELECT COUNT(*)::INT
    FROM moderation.report_audit
    WHERE report_id = 'd5000000-0000-4000-8000-000000000001'
      AND action = 'content_removed'
  ),
  1,
  'content_removed audit row is written'
);

SELECT lives_ok(
  $$SELECT public.moderation_remove_reported_content('d5000000-0000-4000-8000-000000000001')$$,
  'retrying text removal is safe'
);

SELECT is(
  (
    SELECT COUNT(*)::INT
    FROM moderation.report_audit
    WHERE report_id = 'd5000000-0000-4000-8000-000000000001'
      AND action = 'content_removed'
  ),
  1,
  'retry does not insert a second audit row'
);

SELECT lives_ok(
  $$SELECT public.moderation_remove_reported_content('d5000000-0000-4000-8000-000000000002')$$,
  'removing one shared nix reference succeeds'
);

SELECT is(
  (
    SELECT status
    FROM public.media_assets
    WHERE id = 'd3000000-0000-4000-8000-000000000001'
  ),
  'ready',
  'shared asset stays ready while another recipient nix remains'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.nixes
    WHERE id = 'd4000000-0000-4000-8000-000000000003'
  ),
  'foreign nix is not deleted'
);

INSERT INTO public.content_reports (
  id, reporter_id, reported_user_id, text_message_id, nix_id, reason, status,
  evidence_path, evidence_expires_at
)
VALUES (
  'd5000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000003',
  'd1000000-0000-4000-8000-000000000001',
  NULL,
  'd4000000-0000-4000-8000-000000000002',
  'harassment',
  'open',
  'd5000000-0000-4000-8000-000000000004/evidence.json',
  now() + interval '30 days'
);

SELECT lives_ok(
  $$SELECT public.moderation_remove_reported_content('d5000000-0000-4000-8000-000000000004')$$,
  'removing the last shared nix reference succeeds'
);

SELECT is(
  (
    SELECT status
    FROM public.media_assets
    WHERE id = 'd3000000-0000-4000-8000-000000000001'
  ),
  'deleting',
  'last remaining reference qualifies the asset for existing cleanup'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.mark_expired_media_uploads()
    WHERE asset_id = 'd3000000-0000-4000-8000-000000000001'
  ),
  'qualified orphan is returned by mark_expired_media_uploads'
);

SELECT is(
  (
    SELECT evidence_path
    FROM public.content_reports
    WHERE id = 'd5000000-0000-4000-8000-000000000004'
  ),
  'd5000000-0000-4000-8000-000000000004/evidence.json',
  'media report evidence path remains after removal'
);

SELECT lives_ok(
  $$SELECT public.moderation_remove_reported_content('d5000000-0000-4000-8000-000000000003')$$,
  'user-only report is an idempotent no-op'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.text_messages
    WHERE id = 'd2000000-0000-4000-8000-000000000002'
  )
  AND EXISTS (
    SELECT 1 FROM public.nixes
    WHERE id = 'd4000000-0000-4000-8000-000000000003'
  ),
  'user-only remove does not delete unrelated content'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.moderation_remove_reported_content(uuid)',
    'EXECUTE'
  ),
  FALSE,
  'authenticated cannot execute moderation_remove_reported_content'
);

SELECT is(
  has_function_privilege(
    'anon',
    'public.moderation_remove_reported_content(uuid)',
    'EXECUTE'
  ),
  FALSE,
  'anon cannot execute moderation_remove_reported_content'
);

SELECT * FROM finish();
ROLLBACK;
