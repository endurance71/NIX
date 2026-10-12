BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

-- Fixtures: f7..01 = A, f7..02 = B. Direct NiX fixtures need the legacy (non pre-delivery) path.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('f7000000-0000-4000-8000-000000000001', 'retention-a@example.invalid'),
  ('f7000000-0000-4000-8000-000000000002', 'retention-b@example.invalid')
) AS u(id, email);

UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

INSERT INTO public.nixes(
  id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status,
  is_viewed, viewed_at, replay_expires_at, created_at, thumbnail_b64
)
VALUES
  -- Viewed an hour ago: its replay window is over, so it can be cleaned.
  ('f7100000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001',
   'f7000000-0000-4000-8000-000000000002', 'nixes/f7000000-0000-4000-8000-000000000001/viewed.mp4',
   'video', 5, 'viewed', TRUE, now() - interval '1 hour', now() - interval '50 minutes',
   now() - interval '2 hours', 'data:image/jpeg;base64,AAAA'),
  -- Unopened for 31 days: expired.
  ('f7100000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001',
   'f7000000-0000-4000-8000-000000000002', 'nixes/f7000000-0000-4000-8000-000000000001/old.jpg',
   'image', 5, 'sent', FALSE, NULL, NULL, now() - interval '31 days', NULL),
  -- Unopened for a day: still waiting for its recipient.
  ('f7100000-0000-4000-8000-000000000003', 'f7000000-0000-4000-8000-000000000001',
   'f7000000-0000-4000-8000-000000000002', 'nixes/f7000000-0000-4000-8000-000000000001/new.jpg',
   'image', 5, 'sent', FALSE, NULL, NULL, now() - interval '1 day', NULL);

-- 1. The poster goes with the media.
SELECT lives_ok(
  $$ SELECT * FROM public.prepare_nix_cleanup('f7100000-0000-4000-8000-000000000001') $$,
  'a viewed NiX past its replay window is prepared for cleanup'
);
SELECT is(
  (SELECT thumbnail_b64 FROM public.nixes WHERE id = 'f7100000-0000-4000-8000-000000000001'),
  NULL,
  'cleaning a NiX deletes its video poster'
);

-- 2. Unopened NiXes expire after 30 days.
SELECT is(
  private.enqueue_expired_unopened_nixes(),
  1,
  'only the NiX unopened for more than 30 days is queued'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.nix_cleanup_queue WHERE nix_id = 'f7100000-0000-4000-8000-000000000002'),
  'the expired NiX is in the cleanup queue'
);
SELECT lives_ok(
  $$ SELECT * FROM public.prepare_nix_cleanup('f7100000-0000-4000-8000-000000000002') $$,
  'an expired unopened NiX can be cleaned up'
);
SELECT is(
  (SELECT status FROM public.nixes WHERE id = 'f7100000-0000-4000-8000-000000000002'),
  'cleaned',
  'the expired NiX is cleaned'
);
SELECT throws_ok(
  $$ SELECT * FROM public.prepare_nix_cleanup('f7100000-0000-4000-8000-000000000003') $$,
  'P0001', 'REPLAY_WINDOW_ACTIVE',
  'a recently sent unopened NiX is still protected'
);

-- 3. Signing out deletes the push registration; turning notifications off keeps it disabled.
INSERT INTO public.push_devices(installation_id, user_id, expo_push_token, platform)
VALUES
  ('f7200000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001',
   'ExponentPushToken[retention-signed-out-0001]', 'ios'),
  ('f7200000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001',
   'ExponentPushToken[retention-turned-off-0002]', 'ios');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f7000000-0000-4000-8000-000000000001","role":"authenticated"}', TRUE);
SELECT public.disable_push_device('f7200000-0000-4000-8000-000000000001', 'signed_out');
SELECT public.disable_push_device('f7200000-0000-4000-8000-000000000002', 'user_disabled');
RESET ROLE;

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.push_devices WHERE installation_id = 'f7200000-0000-4000-8000-000000000001'),
  'signing out deletes the device and its token'
);
SELECT is(
  (SELECT enabled FROM public.push_devices WHERE installation_id = 'f7200000-0000-4000-8000-000000000002'),
  FALSE,
  'turning notifications off keeps the device, disabled'
);

-- 4. Technical logs are pruned.
INSERT INTO public.nix_cleanup_audit(nix_id, receiver_id, media_path, status, created_at)
VALUES
  ('f7100000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002', 'nixes/x/old', 'success', now() - interval '31 days'),
  ('f7100000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002', 'nixes/x/new', 'success', now() - interval '1 day');
INSERT INTO public.app_installations(installation_id, user_id, device_name, locale, last_seen_at)
VALUES
  ('f7300000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001', 'iPhone', 'pl', now() - interval '181 days'),
  ('f7300000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001', 'iPhone', 'pl', now() - interval '1 day');

SELECT private.prune_technical_logs();

SELECT is(
  (SELECT count(*)::INT FROM public.nix_cleanup_audit WHERE media_path IN ('nixes/x/old', 'nixes/x/new')),
  1,
  'cleanup audit older than 30 days is pruned, newer is kept'
);
SELECT is(
  (SELECT count(*)::INT FROM public.app_installations WHERE user_id = 'f7000000-0000-4000-8000-000000000001'),
  1,
  'installations unseen for 180 days are pruned, active ones are kept'
);

-- 5. Blocking unsaves the pair's saved messages.
INSERT INTO public.text_messages(id, sender_id, receiver_id, body, saved_at, saved_by, expires_at)
VALUES (
  'f7400000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000002', 'hej', now(), 'f7000000-0000-4000-8000-000000000002',
  '9999-12-31T00:00:00Z'
);

INSERT INTO public.user_blocks(blocker_id, blocked_id)
VALUES ('f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001');

SELECT is(
  (SELECT saved_at FROM public.text_messages WHERE id = 'f7400000-0000-4000-8000-000000000001'),
  NULL,
  'blocking unsaves the pair''s saved message'
);
SELECT ok(
  (SELECT expires_at <= now() + interval '24 hours' FROM public.text_messages
   WHERE id = 'f7400000-0000-4000-8000-000000000001'),
  'the unsaved message expires within 24 hours'
);
SELECT has_trigger('public', 'user_blocks', 'expire_saved_texts_on_block', 'user_blocks has the unsave trigger');

SELECT * FROM finish();
ROLLBACK;
