BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(31);

-- Fixtures ------------------------------------------------------------------
-- e5..01 me. Friends: e5..02 (B, streak through yesterday, today only I sent),
-- e4..03 (C, id lower than mine; streak including a complete today),
-- e5..04 (D, broken streak), e5..05 (E, blocked by me), e5..07 (G, pending only).
-- e5..06 (F) is not a friend but has exchanges with me.
INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id::UUID, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, 'x', now(), '{}', '{}', now(), now()
FROM (VALUES
  ('e5000000-0000-4000-8000-000000000001', 'streak-me@example.invalid'),
  ('e5000000-0000-4000-8000-000000000002', 'streak-b@example.invalid'),
  ('e4000000-0000-4000-8000-000000000003', 'streak-c@example.invalid'),
  ('e5000000-0000-4000-8000-000000000004', 'streak-d@example.invalid'),
  ('e5000000-0000-4000-8000-000000000005', 'streak-e@example.invalid'),
  ('e5000000-0000-4000-8000-000000000006', 'streak-f@example.invalid'),
  ('e5000000-0000-4000-8000-000000000007', 'streak-g@example.invalid')
) AS u(id, email);

INSERT INTO public.age_attestations(user_id, minimum_age, policy_version)
SELECT id, 16, '2026-07-15'
FROM public.profiles
WHERE id::TEXT LIKE 'e_000000-0000-4000-8000-00000000000_'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.friendships(user_id, friend_id, status)
VALUES
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', 'accepted'),
  ('e4000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000001', 'accepted'),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000004', 'accepted'),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000005', 'accepted'),
  ('e5000000-0000-4000-8000-000000000007', 'e5000000-0000-4000-8000-000000000001', 'pending');

INSERT INTO public.user_blocks(blocker_id, blocked_id)
VALUES ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000005');

-- Counter fixtures for a pinned clock: "today" is 2026-10-12 (Europe/Warsaw).
-- (low, high, day, low_nix, high_nix, messages)
INSERT INTO public.nix_daily_exchanges(user_low, user_high, day, low_nix_count, high_nix_count, message_count)
VALUES
  -- me (low) + B (high): complete 1-3 Oct, gap, complete 10-11 Oct, today only me.
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', '2026-10-01', 1, 1, 0),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', '2026-10-02', 1, 1, 0),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', '2026-10-03', 1, 1, 0),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', '2026-10-10', 2, 1, 4),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', '2026-10-11', 1, 3, 0),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', '2026-10-12', 1, 0, 2),
  -- C (low) + me (high): complete 9-12 Oct (today complete); 5 Oct is text only.
  ('e4000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000001', '2026-10-05', 0, 0, 7),
  ('e4000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000001', '2026-10-09', 1, 1, 0),
  ('e4000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000001', '2026-10-10', 1, 1, 0),
  ('e4000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000001', '2026-10-11', 1, 1, 0),
  ('e4000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000001', '2026-10-12', 1, 2, 0),
  -- me + D: complete 5-7 Oct, then only one side on 10 Oct -> broken.
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000004', '2026-10-05', 1, 1, 0),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000004', '2026-10-06', 1, 1, 0),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000004', '2026-10-07', 1, 1, 0),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000004', '2026-10-10', 1, 0, 0),
  -- Old activity outside every window must not count.
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000004', '2026-08-01', 5, 5, 5),
  -- me + E (blocked) and me + F (not a friend): complete today.
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000005', '2026-10-12', 1, 1, 0),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000006', '2026-10-12', 1, 1, 0),
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000007', '2026-10-12', 1, 1, 0);

-- Contract ------------------------------------------------------------------
SELECT has_table('public', 'nix_daily_exchanges', 'nix_daily_exchanges exists');
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nix_daily_exchanges'::regclass),
  TRUE,
  'RLS is enabled on nix_daily_exchanges'
);
SELECT policies_are('public', 'nix_daily_exchanges', ARRAY['nix_daily_exchanges_participants_select']);
SELECT ok(
  NOT has_table_privilege('anon', 'public.nix_daily_exchanges', 'SELECT'),
  'anon cannot read exchanges'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.nix_daily_exchanges', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.nix_daily_exchanges', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.nix_daily_exchanges', 'DELETE'),
  'authenticated cannot write exchanges directly'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_friend_streaks()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_friend_streaks()', 'EXECUTE'),
  'get_friend_streaks is for authenticated only'
);
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_friend_streaks()'::regprocedure),
  FALSE,
  'get_friend_streaks is SECURITY INVOKER'
);

-- Trigger: real inserts bump today's counters --------------------------------
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled = FALSE WHERE singleton;

CREATE TEMP TABLE real_today AS SELECT (now() AT TIME ZONE 'Europe/Warsaw')::DATE AS day;

-- F (06) and G (07) have no counter fixtures, so the real clock cannot collide with them.
INSERT INTO public.nixes(id, sender_id, receiver_id, media_path, media_type, view_duration_sec, status, is_viewed)
VALUES
  ('e5100000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000006',
   'e5000000-0000-4000-8000-000000000007', 'nixes/e5/a.jpg', 'image', 5, 'sent', FALSE),
  ('e5100000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-000000000006',
   'e5000000-0000-4000-8000-000000000007', 'nixes/e5/b.mp4', 'video', 5, 'sent', FALSE),
  ('e5100000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000007',
   'e5000000-0000-4000-8000-000000000006', 'nixes/e5/c.jpg', 'image', 5, 'sent', FALSE);

INSERT INTO public.text_messages(sender_id, receiver_id, body, is_system)
VALUES
  ('e5000000-0000-4000-8000-000000000007', 'e5000000-0000-4000-8000-000000000006', 'hej', FALSE),
  ('e5000000-0000-4000-8000-000000000007', 'e5000000-0000-4000-8000-000000000006', 'systemowa', TRUE);

SELECT results_eq(
  $$SELECT low_nix_count, high_nix_count, message_count, low_sent, high_sent
    FROM public.nix_daily_exchanges
    WHERE user_low = 'e5000000-0000-4000-8000-000000000006'
      AND user_high = 'e5000000-0000-4000-8000-000000000007'
      AND day = (SELECT day FROM real_today)$$,
  $$VALUES (2, 1, 1, TRUE, TRUE)$$,
  'trigger counts NiX per direction and non-system texts for today'
);

DELETE FROM public.nixes WHERE id::TEXT LIKE 'e5100000-%';
SELECT is(
  (SELECT low_nix_count FROM public.nix_daily_exchanges
   WHERE user_low = 'e5000000-0000-4000-8000-000000000006'
     AND user_high = 'e5000000-0000-4000-8000-000000000007'
     AND day = (SELECT day FROM real_today)),
  2,
  'counters survive NiX deletion (cleanup keeps streak history)'
);

-- Streaks as "me", at noon (not at risk) -----------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"e5000000-0000-4000-8000-000000000001","role":"authenticated"}',
  TRUE
);

CREATE TEMP TABLE noon AS
SELECT * FROM private.friend_streaks_at('2026-10-12 12:00:00 Europe/Warsaw'::TIMESTAMPTZ);

SELECT is(
  (SELECT array_agg(peer_id ORDER BY peer_id) FROM noon),
  ARRAY[
    'e4000000-0000-4000-8000-000000000003',
    'e5000000-0000-4000-8000-000000000002',
    'e5000000-0000-4000-8000-000000000004'
  ]::UUID[],
  'only accepted, non-blocked friends with activity are returned'
);

SELECT is((SELECT streak_days FROM noon WHERE peer_id = 'e5000000-0000-4000-8000-000000000002'), 2,
  'B: streak counts the newest run through yesterday (gap breaks the older run)');
SELECT is((SELECT last_exchange_day FROM noon WHERE peer_id = 'e5000000-0000-4000-8000-000000000002'), '2026-10-11'::DATE,
  'B: last complete day is yesterday');
SELECT is((SELECT today_complete FROM noon WHERE peer_id = 'e5000000-0000-4000-8000-000000000002'), FALSE,
  'B: today is not complete');
SELECT ok(
  (SELECT me_sent_today AND NOT peer_sent_today FROM noon WHERE peer_id = 'e5000000-0000-4000-8000-000000000002'),
  'B: I sent today, B did not'
);
SELECT is((SELECT at_risk FROM noon WHERE peer_id = 'e5000000-0000-4000-8000-000000000002'), FALSE,
  'B: not at risk at noon');
SELECT is((SELECT day_ends_at FROM noon WHERE peer_id = 'e5000000-0000-4000-8000-000000000002'),
  '2026-10-13 00:00:00 Europe/Warsaw'::TIMESTAMPTZ,
  'day ends at Warsaw midnight');

SELECT is((SELECT streak_days FROM noon WHERE peer_id = 'e4000000-0000-4000-8000-000000000003'), 4,
  'C: streak includes a complete today');
SELECT ok(
  (SELECT today_complete AND me_sent_today AND peer_sent_today FROM noon
   WHERE peer_id = 'e4000000-0000-4000-8000-000000000003'),
  'C: both sent today (pair order with me as the high id)'
);
SELECT is((SELECT exchange_count_30d FROM noon WHERE peer_id = 'e4000000-0000-4000-8000-000000000003'), 16,
  'C: 30-day exchanges count NiX both ways plus texts');
SELECT is((SELECT exchange_count_7d FROM noon WHERE peer_id = 'e4000000-0000-4000-8000-000000000003'), 9,
  'C: 7-day exchanges (6-12 Oct)');
SELECT is((SELECT exchange_count_prev_7d FROM noon WHERE peer_id = 'e4000000-0000-4000-8000-000000000003'), 7,
  'C: previous 7-day exchanges (29 Sep - 5 Oct)');

SELECT is((SELECT streak_days FROM noon WHERE peer_id = 'e5000000-0000-4000-8000-000000000004'), 0,
  'D: a missed day breaks the streak');
SELECT is((SELECT at_risk FROM noon WHERE peer_id = 'e5000000-0000-4000-8000-000000000004'), FALSE,
  'D: a broken streak is never at risk');
SELECT is((SELECT exchange_count_30d FROM noon WHERE peer_id = 'e5000000-0000-4000-8000-000000000004'), 7,
  'D: activity older than 30 days is not counted');

-- Late evening: less than 4 h left ----------------------------------------------
CREATE TEMP TABLE evening AS
SELECT * FROM private.friend_streaks_at('2026-10-12 21:30:00 Europe/Warsaw'::TIMESTAMPTZ);

SELECT is((SELECT at_risk FROM evening WHERE peer_id = 'e5000000-0000-4000-8000-000000000002'), TRUE,
  'B: at risk when one side has not sent and < 4 h remain');
SELECT is((SELECT at_risk FROM evening WHERE peer_id = 'e4000000-0000-4000-8000-000000000003'), FALSE,
  'C: a complete today is never at risk');

-- Next day: B's streak ended (today 13 Oct, last complete 11 Oct).
SELECT is(
  (SELECT streak_days FROM private.friend_streaks_at('2026-10-13 09:00:00 Europe/Warsaw'::TIMESTAMPTZ)
   WHERE peer_id = 'e5000000-0000-4000-8000-000000000002'),
  0,
  'B: the streak is gone the day after a missed day'
);

-- RLS: participants only ----------------------------------------------------------
SELECT is(
  (SELECT count(*) FROM public.nix_daily_exchanges
   WHERE user_high = 'e5000000-0000-4000-8000-000000000005'),
  0::BIGINT,
  'blocked pair rows are hidden'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"e5000000-0000-4000-8000-000000000006","role":"authenticated"}',
  TRUE
);
SELECT is(
  (SELECT count(*) FROM public.nix_daily_exchanges
   WHERE user_high = 'e5000000-0000-4000-8000-000000000002'),
  0::BIGINT,
  'a non-participant cannot read another pair'
);
SELECT throws_ok(
  $$INSERT INTO public.nix_daily_exchanges(user_low, user_high, day, low_nix_count)
    VALUES ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000006', '2026-10-12', 1)$$,
  '42501',
  NULL,
  'authenticated cannot forge counters'
);
SELECT is(
  (SELECT count(*) FROM public.get_friend_streaks()),
  0::BIGINT,
  'a user without friends gets no rows from the public RPC'
);

SELECT * FROM finish();
ROLLBACK;
