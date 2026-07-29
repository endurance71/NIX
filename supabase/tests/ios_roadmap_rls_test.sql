BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(27);

INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'roadmap1@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'roadmap2@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  );

INSERT INTO public.product_analytics_preferences(user_id, enabled)
VALUES
  ('10000000-0000-0000-0000-000000000001', TRUE),
  ('10000000-0000-0000-0000-000000000002', TRUE);
INSERT INTO public.conversation_read_states(user_id, peer_id)
VALUES
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.data_export_jobs(user_id, status)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'ready'),
  ('10000000-0000-0000-0000-000000000002', 'ready');
INSERT INTO public.user_activation_state(user_id)
VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');
INSERT INTO public.notification_preferences(user_id)
VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');
INSERT INTO public.conversation_mutes(owner_user_id, peer_user_id)
VALUES
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.app_installations(installation_id, user_id, device_name, locale)
VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'iPhone 1', 'pl'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'iPhone 2', 'en');
INSERT INTO public.friendships(user_id, friend_id, status)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'accepted'
);
INSERT INTO public.user_blocks(blocker_id, blocked_id)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001'
);
INSERT INTO storage.objects(bucket_id, name, owner)
VALUES (
  'account-exports',
  '10000000-0000-0000-0000-000000000001/export.zip',
  '10000000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  TRUE
);

SELECT is(
  (SELECT count(*) FROM public.product_analytics_preferences),
  1::BIGINT,
  'analytics preferences are visible only to their owner'
);
SELECT is(
  (SELECT count(*) FROM public.conversation_read_states),
  1::BIGINT,
  'conversation read state is visible only to its owner'
);
SELECT is(
  (SELECT count(*) FROM public.data_export_jobs),
  1::BIGINT,
  'data export jobs are visible only to their owner'
);
SELECT is(
  (SELECT count(*) FROM public.user_activation_state),
  1::BIGINT,
  'activation state is visible only to its owner'
);
SELECT is(
  (SELECT count(*) FROM public.notification_preferences),
  1::BIGINT,
  'notification preferences are visible only to their owner'
);
SELECT is(
  (SELECT count(*) FROM public.conversation_mutes),
  1::BIGINT,
  'conversation mutes are visible only to their owner'
);
SELECT is(
  (SELECT count(*) FROM public.app_installations),
  1::BIGINT,
  'app installations are visible only to their owner'
);
SELECT throws_ok(
  $$SELECT count(*) FROM public.product_analytics_events$$,
  '42501',
  'permission denied for table product_analytics_events',
  'raw analytics events are not readable by authenticated users'
);
SELECT throws_ok(
  $$SELECT count(*) FROM public.product_analytics_daily$$,
  '42501',
  'permission denied for table product_analytics_daily',
  'analytics aggregates are not readable by authenticated users'
);
SELECT is(
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'account-exports'),
  0::BIGINT,
  'account export objects are not directly readable'
);
SELECT throws_ok(
  $$SELECT public.get_unread_inbox_count_for_user('10000000-0000-0000-0000-000000000002')$$,
  '42501',
  'permission denied for function get_unread_inbox_count_for_user',
  'authenticated users cannot query another user unread count'
);
UPDATE public.product_analytics_preferences
SET enabled = FALSE
WHERE user_id = '10000000-0000-0000-0000-000000000002';
UPDATE public.product_analytics_preferences
SET enabled = FALSE
WHERE user_id = '10000000-0000-0000-0000-000000000001';

RESET ROLE;

SELECT is(
  (
    SELECT enabled
    FROM public.product_analytics_preferences
    WHERE user_id = '10000000-0000-0000-0000-000000000002'
  ),
  TRUE,
  'owner policy prevents updating another analytics preference'
);
SELECT is(
  (
    SELECT enabled
    FROM public.product_analytics_preferences
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
  ),
  FALSE,
  'owner can update their analytics preference'
);

SET LOCAL ROLE authenticated;
SELECT is(
  public.can_send_text_message(
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002'
  ),
  FALSE,
  'blocked relationship cannot send text'
);
SELECT is(
  public.can_send_nix(
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002'
  ),
  FALSE,
  'blocked relationship cannot send NiX'
);
SELECT throws_ok(
  $$
    INSERT INTO public.text_messages(sender_id, receiver_id, body, client_message_id)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      'blocked text',
      'blocked-text'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "text_messages"',
  'text insert is rejected for a blocked relationship'
);
SELECT throws_ok(
  $$
    INSERT INTO public.nixes(sender_id, receiver_id, media_path, media_type)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      'nixes/blocked.jpg',
      'image'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "nixes"',
  'NiX insert is rejected for a blocked relationship'
);
SELECT is(
  public.record_product_analytics_event(
    '20000000-0000-0000-0000-000000000001',
    'inbox_search_used',
    '1.0.5',
    'pl',
    '{"has_results":true}'::JSONB
  ),
  FALSE,
  'analytics event is not recorded without consent'
);

RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.text_messages WHERE client_message_id = 'blocked-text'),
  0::BIGINT,
  'blocked text did not persist'
);
SELECT is(
  (SELECT count(*) FROM public.nixes WHERE media_path = 'nixes/blocked.jpg'),
  0::BIGINT,
  'blocked NiX did not persist'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.push_notification_jobs
    WHERE actor_id = '10000000-0000-0000-0000-000000000001'
      AND recipient_id = '10000000-0000-0000-0000-000000000002'
  ),
  0::BIGINT,
  'blocked sends did not enqueue push jobs'
);
SELECT is(
  (SELECT count(*) FROM public.product_analytics_events),
  0::BIGINT,
  'no raw analytics event exists before opt-in'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.set_product_analytics_consent(TRUE)$$,
  'owner can opt in to analytics'
);
SELECT throws_ok(
  $$
    SELECT public.record_product_analytics_event(
      '20000000-0000-0000-0000-000000000001',
      'inbox_search_used',
      '1.0.5',
      'pl',
      '{"username":"do-not-store"}'::JSONB
    )
  $$,
  'P0001',
  'Unsupported analytics properties',
  'analytics RPC rejects non-allowlisted properties'
);
SELECT is(
  public.record_product_analytics_event(
    '20000000-0000-0000-0000-000000000001',
    'inbox_search_used',
    '1.0.5',
    'pl',
    '{"has_results":true,"source":"manual"}'::JSONB
  ),
  TRUE,
  'analytics RPC accepts a safe allowlisted event'
);

RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.product_analytics_events),
  1::BIGINT,
  'exactly one consented analytics event was stored'
);
SELECT is(
  (
    SELECT properties
    FROM public.product_analytics_events
    WHERE event_name = 'inbox_search_used'
  ),
  '{"source":"manual","has_results":true}'::JSONB,
  'stored analytics properties contain only the expected safe payload'
);

SELECT * FROM finish();
ROLLBACK;
