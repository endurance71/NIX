-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Friend streaks and best friends (Snapchat-style), 2026-10-12.
--
-- Streak rule: a streak with a friend is the number of consecutive calendar days on which BOTH
-- people sent each other at least one NiX (photo or video). Text messages do not keep a streak
-- alive, but they do count towards "best friends" (exchange counts).
--
-- Calendar day = Europe/Warsaw (NiX is a Polish app; one shared day boundary for both people, so a
-- streak can never be "alive" for one side and "broken" for the other). Postgres handles DST.
-- A NiX counts for the day on which the server records it (trigger time, now()), not its
-- client-provided created_at, so a backdated send cannot repair a missed day.
--
-- Storage: NiX rows are cleaned up / deleted over time (cleanup, moderation, conversation delete),
-- so streak history cannot be derived from public.nixes. A tiny per-pair, per-day counter table
-- (public.nix_daily_exchanges) is maintained by an AFTER INSERT trigger on nixes and text_messages
-- and survives that cleanup. One row per (pair, day) with activity; the pair is stored ordered
-- (user_low < user_high) so both directions share a row.
--
-- Read path: public.get_friend_streaks() (SECURITY INVOKER) returns one row per accepted,
-- non-blocked friend with any activity in the last 30 days or a running streak. Reads go through
-- RLS on friendships and nix_daily_exchanges.
--
-- Clients degrade silently when this migration is not deployed (no badges, no best-friends
-- section). A streak push reminder ("your streak is about to end") is out of scope.

-- 1) Daily exchange counters -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.nix_daily_exchanges (
  user_low UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_high UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  -- NiX (photo/video) sent by user_low to user_high on that day, and the reverse.
  low_nix_count INTEGER NOT NULL DEFAULT 0,
  high_nix_count INTEGER NOT NULL DEFAULT 0,
  -- Text messages in either direction (best-friend ranking only; never a streak day).
  message_count INTEGER NOT NULL DEFAULT 0,
  low_sent BOOLEAN GENERATED ALWAYS AS (low_nix_count > 0) STORED,
  high_sent BOOLEAN GENERATED ALWAYS AS (high_nix_count > 0) STORED,
  PRIMARY KEY (user_low, user_high, day),
  CONSTRAINT nix_daily_exchanges_ordered_pair CHECK (user_low < user_high),
  CONSTRAINT nix_daily_exchanges_counts_non_negative CHECK (
    low_nix_count >= 0 AND high_nix_count >= 0 AND message_count >= 0
  )
);

COMMENT ON TABLE public.nix_daily_exchanges IS
  'Per pair and Europe/Warsaw day: NiX counts per direction and text message count. Maintained by private.record_daily_exchange; survives NiX cleanup so streaks keep their history. Participants can read their own pairs.';

-- FK cascade on the second participant (the primary key covers user_low).
CREATE INDEX IF NOT EXISTS idx_nix_daily_exchanges_user_high
  ON public.nix_daily_exchanges (user_high);

-- Streak scan: only "complete" days (both sent), newest first, per pair.
CREATE INDEX IF NOT EXISTS idx_nix_daily_exchanges_complete_days
  ON public.nix_daily_exchanges (user_low, user_high, day DESC)
  WHERE low_nix_count > 0 AND high_nix_count > 0;

ALTER TABLE public.nix_daily_exchanges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nix_daily_exchanges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.nix_daily_exchanges TO authenticated;

DROP POLICY IF EXISTS nix_daily_exchanges_participants_select ON public.nix_daily_exchanges;
CREATE POLICY nix_daily_exchanges_participants_select
  ON public.nix_daily_exchanges FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.uid()) = user_low OR (SELECT auth.uid()) = user_high)
    AND NOT private.is_pair_blocked(user_low, user_high)
  );

-- 2) Trigger: count every delivered NiX and text message --------------------------------------

CREATE OR REPLACE FUNCTION private.record_daily_exchange()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_low UUID;
  v_high UUID;
  v_day DATE := (now() AT TIME ZONE 'Europe/Warsaw')::DATE;
  v_low_nix INTEGER := 0;
  v_high_nix INTEGER := 0;
  v_messages INTEGER := 0;
BEGIN
  IF NEW.sender_id IS NULL OR NEW.receiver_id IS NULL OR NEW.sender_id = NEW.receiver_id THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'text_messages' THEN
    IF NEW.is_system THEN
      RETURN NULL;
    END IF;
    v_messages := 1;
  ELSIF NEW.sender_id < NEW.receiver_id THEN
    v_low_nix := 1;
  ELSE
    v_high_nix := 1;
  END IF;

  v_low := LEAST(NEW.sender_id, NEW.receiver_id);
  v_high := GREATEST(NEW.sender_id, NEW.receiver_id);

  -- A streak counter must never make a send fail: any unexpected error is logged and swallowed.
  BEGIN
    INSERT INTO public.nix_daily_exchanges AS e
      (user_low, user_high, day, low_nix_count, high_nix_count, message_count)
    VALUES (v_low, v_high, v_day, v_low_nix, v_high_nix, v_messages)
    ON CONFLICT (user_low, user_high, day) DO UPDATE
      SET low_nix_count = e.low_nix_count + EXCLUDED.low_nix_count,
          high_nix_count = e.high_nix_count + EXCLUDED.high_nix_count,
          message_count = e.message_count + EXCLUDED.message_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'record_daily_exchange skipped: % (%)', SQLERRM, SQLSTATE;
  END;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.record_daily_exchange() IS
  'AFTER INSERT trigger on nixes and text_messages: bumps the per-pair, per-day counters in public.nix_daily_exchanges. Never raises.';

REVOKE ALL ON FUNCTION private.record_daily_exchange() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS record_nix_daily_exchange ON public.nixes;
CREATE TRIGGER record_nix_daily_exchange
  AFTER INSERT ON public.nixes
  FOR EACH ROW EXECUTE FUNCTION private.record_daily_exchange();

DROP TRIGGER IF EXISTS record_text_daily_exchange ON public.text_messages;
CREATE TRIGGER record_text_daily_exchange
  AFTER INSERT ON public.text_messages
  FOR EACH ROW EXECUTE FUNCTION private.record_daily_exchange();

-- 3) Backfill from the rows that still exist ------------------------------------------------------
-- History older than NiX cleanup is gone; streaks start from what is still in the tables.

INSERT INTO public.nix_daily_exchanges AS e
  (user_low, user_high, day, low_nix_count, high_nix_count, message_count)
SELECT
  LEAST(n.sender_id, n.receiver_id),
  GREATEST(n.sender_id, n.receiver_id),
  (COALESCE(n.created_at, now()) AT TIME ZONE 'Europe/Warsaw')::DATE,
  count(*) FILTER (WHERE n.sender_id < n.receiver_id)::INTEGER,
  count(*) FILTER (WHERE n.sender_id > n.receiver_id)::INTEGER,
  0
FROM public.nixes n
WHERE n.sender_id <> n.receiver_id
GROUP BY 1, 2, 3
ON CONFLICT (user_low, user_high, day) DO UPDATE
  SET low_nix_count = e.low_nix_count + EXCLUDED.low_nix_count,
      high_nix_count = e.high_nix_count + EXCLUDED.high_nix_count;

INSERT INTO public.nix_daily_exchanges AS e
  (user_low, user_high, day, low_nix_count, high_nix_count, message_count)
SELECT
  LEAST(m.sender_id, m.receiver_id),
  GREATEST(m.sender_id, m.receiver_id),
  (m.created_at AT TIME ZONE 'Europe/Warsaw')::DATE,
  0,
  0,
  count(*)::INTEGER
FROM public.text_messages m
WHERE m.sender_id <> m.receiver_id
  AND NOT m.is_system
GROUP BY 1, 2, 3
ON CONFLICT (user_low, user_high, day) DO UPDATE
  SET message_count = e.message_count + EXCLUDED.message_count;

-- 4) Read RPC ---------------------------------------------------------------------------------------
-- The body lives in private.friend_streaks_at(p_now) so tests can pin the clock (at-risk depends on
-- the time of day). Both are SECURITY INVOKER: every read goes through RLS. The private schema is
-- not exposed through PostgREST, so clients can only reach the public wrapper (clock = now()).

DROP FUNCTION IF EXISTS public.get_friend_streaks();
DROP FUNCTION IF EXISTS private.friend_streaks_at(TIMESTAMPTZ);

CREATE FUNCTION private.friend_streaks_at(p_now TIMESTAMPTZ)
RETURNS TABLE (
  peer_id UUID,
  streak_days INTEGER,
  at_risk BOOLEAN,
  last_exchange_day DATE,
  today_complete BOOLEAN,
  me_sent_today BOOLEAN,
  peer_sent_today BOOLEAN,
  day_ends_at TIMESTAMPTZ,
  exchange_count_30d INTEGER,
  exchange_count_7d INTEGER,
  exchange_count_prev_7d INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH ctx AS (
    SELECT
      (SELECT auth.uid()) AS uid,
      (p_now AT TIME ZONE 'Europe/Warsaw')::DATE AS today
  ),
  friend_ids AS (
    SELECT f.friend_id AS peer_id
    FROM public.friendships f, ctx
    WHERE f.user_id = ctx.uid AND f.status = 'accepted'
    UNION
    SELECT f.user_id
    FROM public.friendships f, ctx
    WHERE f.friend_id = ctx.uid AND f.status = 'accepted'
  ),
  pairs AS (
    SELECT
      fi.peer_id,
      ctx.today,
      LEAST(ctx.uid, fi.peer_id) AS user_low,
      GREATEST(ctx.uid, fi.peer_id) AS user_high,
      ctx.uid < fi.peer_id AS me_low,
      ((ctx.today + 1)::TIMESTAMP AT TIME ZONE 'Europe/Warsaw') AS day_ends_at
    FROM friend_ids fi, ctx
    WHERE ctx.uid IS NOT NULL
      AND fi.peer_id <> ctx.uid
      AND NOT private.is_pair_blocked(ctx.uid, fi.peer_id)
      AND NOT private.is_account_restricted(ctx.uid)
  ),
  stats AS (
    SELECT
      p.peer_id,
      p.day_ends_at,
      COALESCE(td.low_nix_count, 0) > 0 AND COALESCE(td.high_nix_count, 0) > 0 AS today_complete,
      CASE WHEN p.me_low THEN COALESCE(td.low_nix_count, 0) ELSE COALESCE(td.high_nix_count, 0) END > 0
        AS me_sent_today,
      CASE WHEN p.me_low THEN COALESCE(td.high_nix_count, 0) ELSE COALESCE(td.low_nix_count, 0) END > 0
        AS peer_sent_today,
      run.last_complete_day,
      CASE
        WHEN run.last_complete_day >= p.today - 1 THEN COALESCE(run.run_days, 0)
        ELSE 0
      END AS streak_days,
      COALESCE(win.count_30d, 0) AS exchange_count_30d,
      COALESCE(win.count_7d, 0) AS exchange_count_7d,
      COALESCE(win.count_prev_7d, 0) AS exchange_count_prev_7d
    FROM pairs p
    LEFT JOIN public.nix_daily_exchanges td
      ON td.user_low = p.user_low AND td.user_high = p.user_high AND td.day = p.today
    -- Gaps and islands over complete days, newest first: within one run of consecutive days
    -- `day + row_number` is constant, and the newest run has the value `max(day) + 1`.
    LEFT JOIN LATERAL (
      SELECT count(*)::INTEGER AS run_days, max(z.day) AS last_complete_day
      FROM (
        SELECT
          e.day,
          e.day + (row_number() OVER (ORDER BY e.day DESC))::INTEGER AS grp,
          max(e.day) OVER () + 1 AS newest_grp
        FROM public.nix_daily_exchanges e
        WHERE e.user_low = p.user_low
          AND e.user_high = p.user_high
          AND e.low_nix_count > 0
          AND e.high_nix_count > 0
          AND e.day <= p.today
      ) z
      WHERE z.grp = z.newest_grp
    ) run ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        sum(e.low_nix_count + e.high_nix_count + e.message_count)::INTEGER AS count_30d,
        (sum(e.low_nix_count + e.high_nix_count + e.message_count)
          FILTER (WHERE e.day > p.today - 7))::INTEGER AS count_7d,
        (sum(e.low_nix_count + e.high_nix_count + e.message_count)
          FILTER (WHERE e.day <= p.today - 7 AND e.day > p.today - 14))::INTEGER AS count_prev_7d
      FROM public.nix_daily_exchanges e
      WHERE e.user_low = p.user_low
        AND e.user_high = p.user_high
        AND e.day > p.today - 30
        AND e.day <= p.today
    ) win ON TRUE
  )
  SELECT
    s.peer_id,
    s.streak_days,
    (s.streak_days > 0 AND NOT s.today_complete AND s.day_ends_at - p_now <= INTERVAL '4 hours')
      AS at_risk,
    s.last_complete_day AS last_exchange_day,
    s.today_complete,
    s.me_sent_today,
    s.peer_sent_today,
    s.day_ends_at,
    s.exchange_count_30d,
    s.exchange_count_7d,
    s.exchange_count_prev_7d
  FROM stats s
  WHERE s.streak_days > 0 OR s.exchange_count_30d > 0
  ORDER BY s.peer_id;
$$;

COMMENT ON FUNCTION private.friend_streaks_at(TIMESTAMPTZ) IS
  'Body of public.get_friend_streaks with an explicit clock (tests). SECURITY INVOKER over RLS.';

REVOKE ALL ON FUNCTION private.friend_streaks_at(TIMESTAMPTZ) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.friend_streaks_at(TIMESTAMPTZ) TO authenticated;

CREATE FUNCTION public.get_friend_streaks()
RETURNS TABLE (
  peer_id UUID,
  streak_days INTEGER,
  at_risk BOOLEAN,
  last_exchange_day DATE,
  today_complete BOOLEAN,
  me_sent_today BOOLEAN,
  peer_sent_today BOOLEAN,
  day_ends_at TIMESTAMPTZ,
  exchange_count_30d INTEGER,
  exchange_count_7d INTEGER,
  exchange_count_prev_7d INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.friend_streaks_at(now());
$$;

COMMENT ON FUNCTION public.get_friend_streaks() IS
  'Streak (consecutive Europe/Warsaw days with a NiX both ways), at-risk flag (<4 h left today) and 7/30-day exchange counts for the caller''s accepted, non-blocked friends. SECURITY INVOKER over RLS.';

REVOKE ALL ON FUNCTION public.get_friend_streaks() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_friend_streaks() TO authenticated;
