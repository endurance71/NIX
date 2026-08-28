BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    'c1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'orphan-sender@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'orphan-recv-a@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'orphan-recv-b@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'c1000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'orphan-stranger-s@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'c1000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'orphan-stranger-r@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  );

INSERT INTO public.media_assets (
  id, owner_id, storage_path, media_type, content_type, size_bytes, status, created_at, ready_at
)
VALUES
  (
    'c2000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'nixes/c1000000-0000-4000-8000-000000000001/shared.jpg',
    'image',
    'image/jpeg',
    1024,
    'ready',
    now(),
    now()
  ),
  (
    'c2000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000004',
    'nixes/c1000000-0000-4000-8000-000000000004/foreign.jpg',
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
    'c3000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'nixes/c1000000-0000-4000-8000-000000000001/shared.jpg',
    'image',
    5,
    'sent',
    'c2000000-0000-4000-8000-000000000001'
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000003',
    'nixes/c1000000-0000-4000-8000-000000000001/shared.jpg',
    'image',
    5,
    'sent',
    'c2000000-0000-4000-8000-000000000001'
  ),
  (
    'c3000000-0000-4000-8000-000000000003',
    'c1000000-0000-4000-8000-000000000004',
    'c1000000-0000-4000-8000-000000000005',
    'nixes/c1000000-0000-4000-8000-000000000004/foreign.jpg',
    'image',
    5,
    'sent',
    'c2000000-0000-4000-8000-000000000002'
  );

DELETE FROM public.nixes
WHERE id = 'c3000000-0000-4000-8000-000000000001';

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.mark_expired_media_uploads()
    WHERE asset_id = 'c2000000-0000-4000-8000-000000000001'
  ),
  'deleting one of two active nixes does not qualify the shared asset'
);

SELECT is(
  (
    SELECT status
    FROM public.media_assets
    WHERE id = 'c2000000-0000-4000-8000-000000000001'
  ),
  'ready',
  'shared asset stays ready while another recipient nix remains'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.mark_expired_media_uploads()
    WHERE asset_id = 'c2000000-0000-4000-8000-000000000002'
  ),
  'unrelated active asset is not returned after a partial recipient delete'
);

DELETE FROM public.nixes
WHERE id = 'c3000000-0000-4000-8000-000000000002';

SELECT results_eq(
  $$
    SELECT asset_id
    FROM public.mark_expired_media_uploads()
    WHERE asset_id = 'c2000000-0000-4000-8000-000000000001'
  $$,
  $$ VALUES ('c2000000-0000-4000-8000-000000000001'::uuid) $$,
  'asset with no remaining active nix is returned as deleting'
);

SELECT is(
  (
    SELECT status
    FROM public.media_assets
    WHERE id = 'c2000000-0000-4000-8000-000000000001'
  ),
  'deleting',
  'asset without remaining active references moves to deleting'
);

SELECT is(
  (
    SELECT storage_path
    FROM public.mark_expired_media_uploads()
    WHERE asset_id = 'c2000000-0000-4000-8000-000000000001'
  ),
  'nixes/c1000000-0000-4000-8000-000000000001/shared.jpg',
  'qualified asset returns its storage_path'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.mark_expired_media_uploads()
    WHERE asset_id = 'c2000000-0000-4000-8000-000000000002'
  ),
  'foreign asset with an active nix is not returned'
);

SELECT * FROM finish();
ROLLBACK;
