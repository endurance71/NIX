-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Unified message statuses (Snapchat-style): Sent → Delivered → Opened → Replayed.
--
-- * text_messages.read_at: when the receiver opened the conversation past this
--   message. Set only by mark_text_conversation_read (SECURITY DEFINER), so the
--   sender can show "Opened" for text, which conversation_read_states (owner-only
--   RLS) never exposed. The sender already reads the whole row through
--   text_messages_select, and realtime UPDATE events reach it the same way.
-- * nixes.replayed_at: when the receiver used the one replay; is_replayed alone
--   had no time and was also set for unplayable media.
-- * nixes.unplayable_at: the receiver's viewer could not load the media, so the
--   sender must not see "Opened" (mark_nix_unplayable also sets is_viewed).
--
-- Clients must not be able to write these columns: text_messages has no UPDATE
-- grant/policy for authenticated, and nixes UPDATE was revoked in
-- 20261010120000_pre_review_hardening.sql.

ALTER TABLE public.text_messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.nixes
  ADD COLUMN IF NOT EXISTS replayed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unplayable_at TIMESTAMPTZ;

COMMENT ON COLUMN public.text_messages.read_at IS
  'When the receiver read the conversation past this message (set by mark_text_conversation_read).';
COMMENT ON COLUMN public.nixes.replayed_at IS
  'When the receiver used the replay (set by mark_nix_replayed).';
COMMENT ON COLUMN public.nixes.unplayable_at IS
  'When the receiver''s viewer could not load the media (set by mark_nix_unplayable); never shown as opened.';

-- ---------------------------------------------------------------------------
-- Read receipts for text: stamp every unread message the read covers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_text_conversation_read(
  peer_id UUID,
  read_through TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  bounded_read_at TIMESTAMPTZ;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF peer_id IS NULL OR peer_id = actor_id OR read_through IS NULL THEN
    RAISE EXCEPTION 'Invalid read state';
  END IF;

  SELECT LEAST(
    read_through,
    COALESCE(MAX(tm.created_at), to_timestamp(0))
  )
  INTO bounded_read_at
  FROM public.text_messages tm
  WHERE tm.sender_id = peer_id
    AND tm.receiver_id = actor_id
    AND tm.expires_at > now();

  INSERT INTO public.conversation_read_states(user_id, peer_id, last_read_at, updated_at)
  VALUES (actor_id, peer_id, bounded_read_at, now())
  ON CONFLICT ON CONSTRAINT conversation_read_states_pkey DO UPDATE
  SET last_read_at = GREATEST(
        public.conversation_read_states.last_read_at,
        EXCLUDED.last_read_at
      ),
      updated_at = now();

  -- Uses text_messages_pair_created_idx (sender_id, receiver_id, created_at);
  -- `read_at IS NULL` keeps repeated reads from rewriting rows (and from
  -- emitting realtime UPDATEs to the sender).
  UPDATE public.text_messages tm
  SET read_at = now()
  WHERE tm.sender_id = peer_id
    AND tm.receiver_id = actor_id
    AND tm.created_at <= bounded_read_at
    AND tm.read_at IS NULL
    AND tm.expires_at > now();

  RETURN bounded_read_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_text_conversation_read(UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_text_conversation_read(UUID, TIMESTAMPTZ)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Replay gets a timestamp.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_nix_replayed(p_nix_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nix public.nixes%ROWTYPE;
BEGIN
  SELECT * INTO v_nix
  FROM public.nixes
  WHERE id = p_nix_id AND receiver_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nix not found or unauthorized';
  END IF;

  IF v_nix.is_viewed = false THEN
    RAISE EXCEPTION 'Cannot replay an unviewed nix';
  END IF;

  IF v_nix.is_replayed = true THEN
    RAISE EXCEPTION 'Nix already replayed';
  END IF;

  -- cleaned_at stays with the cleanup worker, which runs after the Storage delete.
  UPDATE public.nixes
  SET is_replayed = true,
      replayed_at = now()
  WHERE id = p_nix_id;

  INSERT INTO public.nix_cleanup_queue (
    nix_id, receiver_id, media_path, next_attempt_at, created_at, updated_at
  )
  VALUES (
    p_nix_id, v_nix.receiver_id, v_nix.media_path, now(), now(), now()
  )
  ON CONFLICT (nix_id) DO UPDATE
  SET next_attempt_at = EXCLUDED.next_attempt_at,
      updated_at = now(),
      attempt_count = 0,
      last_error = NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_nix_replayed(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_nix_replayed(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Unplayable media is marked as such, so senders do not see "Opened".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_nix_unplayable(p_nix_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nix public.nixes%ROWTYPE;
BEGIN
  SELECT * INTO v_nix
  FROM public.nixes
  WHERE id = p_nix_id AND receiver_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nix not found or unauthorized';
  END IF;

  -- Already terminal / already acknowledged — idempotent.
  IF v_nix.status IN ('cleaned', 'cleanup_failed') THEN
    RETURN;
  END IF;

  IF v_nix.is_viewed = true AND v_nix.is_replayed = true THEN
    RETURN;
  END IF;

  UPDATE public.nixes
  SET
    is_viewed = true,
    viewed_at = COALESCE(viewed_at, now()),
    unplayable_at = now(),
    status = 'cleaned',
    replay_expires_at = NULL,
    is_replayed = true
  WHERE id = p_nix_id;

  IF v_nix.media_path IS NOT NULL AND length(trim(v_nix.media_path)) > 0 THEN
    INSERT INTO public.nix_cleanup_queue (
      nix_id, receiver_id, media_path, next_attempt_at, created_at, updated_at
    )
    VALUES (
      p_nix_id, v_nix.receiver_id, v_nix.media_path, now(), now(), now()
    )
    ON CONFLICT (nix_id) DO UPDATE
    SET next_attempt_at = EXCLUDED.next_attempt_at,
        updated_at = now(),
        attempt_count = 0,
        last_error = NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_nix_unplayable(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_nix_unplayable(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Inbox bundle: the status fields for both directions.
-- Unchanged apart from the added columns (see 20261011130000_inbox_threads_rpc.sql).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_inbox_bundle(p_limit INTEGER DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  WITH inbox AS (
    SELECT
      n.id,
      n.sender_id,
      n.media_path,
      n.media_type,
      n.playback_duration_ms,
      n.created_at,
      n.is_viewed,
      n.status,
      n.view_duration_sec,
      n.is_replayed,
      n.replay_expires_at
    FROM public.nixes n
    WHERE n.receiver_id = v_uid
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT v_limit
  ),
  sent AS (
    SELECT
      n.id,
      n.receiver_id,
      n.created_at,
      n.status,
      n.viewed_at,
      n.cleaned_at,
      n.client_upload_id,
      n.media_type,
      n.is_replayed,
      n.replay_expires_at,
      n.replayed_at,
      n.unplayable_at
    FROM public.nixes n
    WHERE n.sender_id = v_uid
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT v_limit
  ),
  texts AS (
    SELECT
      t.id,
      t.sender_id,
      t.receiver_id,
      t.body,
      t.created_at,
      t.expires_at,
      t.client_message_id,
      t.is_system,
      t.metadata,
      t.read_at,
      CASE WHEN t.sender_id = v_uid THEN t.receiver_id ELSE t.sender_id END AS peer_id
    FROM (
      (
        SELECT m.id, m.sender_id, m.receiver_id, m.body, m.created_at, m.expires_at,
               m.client_message_id, m.is_system, m.metadata, m.read_at
        FROM public.text_messages m
        WHERE m.sender_id = v_uid
          AND m.expires_at > now()
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT v_limit
      )
      UNION ALL
      (
        SELECT m.id, m.sender_id, m.receiver_id, m.body, m.created_at, m.expires_at,
               m.client_message_id, m.is_system, m.metadata, m.read_at
        FROM public.text_messages m
        WHERE m.receiver_id = v_uid
          AND m.sender_id <> v_uid
          AND m.expires_at > now()
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT v_limit
      )
    ) t
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT v_limit
  ),
  read_states AS (
    SELECT r.peer_id, r.last_read_at
    FROM public.conversation_read_states r
    WHERE r.user_id = v_uid
      AND r.peer_id IN (SELECT texts.peer_id FROM texts)
  ),
  peer_ids AS (
    SELECT inbox.sender_id AS peer_id FROM inbox
    UNION
    SELECT sent.receiver_id FROM sent
    UNION
    SELECT texts.peer_id FROM texts
  ),
  peer_profiles AS (
    SELECT p.id, p.username, p.display_name, p.avatar_storage_path, p.avatar_emoji
    FROM public.get_public_profiles_by_ids(
      COALESCE((SELECT array_agg(peer_ids.peer_id) FROM peer_ids), ARRAY[]::UUID[])
    ) p
  )
  SELECT jsonb_build_object(
    'inbox', COALESCE(
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC, i.id DESC) FROM inbox i),
      '[]'::JSONB
    ),
    'sent', COALESCE(
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC, s.id DESC) FROM sent s),
      '[]'::JSONB
    ),
    'texts', COALESCE(
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC, t.id DESC) FROM texts t),
      '[]'::JSONB
    ),
    'read_states', COALESCE(
      (SELECT jsonb_agg(to_jsonb(r)) FROM read_states r),
      '[]'::JSONB
    ),
    'profiles', COALESCE(
      (SELECT jsonb_agg(to_jsonb(pp)) FROM peer_profiles pp),
      '[]'::JSONB
    ),
    'unread_count', public.get_unread_inbox_count()
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inbox_bundle(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inbox_bundle(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.get_inbox_bundle(INTEGER) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_inbox_bundle(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- Chat NiXes: the return type grows, so the function is recreated
-- (same body and planner settings as 20261011150000_chat_nixes_rpc.sql).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_chat_nixes_with_peer(UUID, INTEGER);

CREATE FUNCTION public.get_chat_nixes_with_peer(
  p_peer_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  receiver_id UUID,
  created_at TIMESTAMPTZ,
  media_path TEXT,
  media_type TEXT,
  is_viewed BOOLEAN,
  is_replayed BOOLEAN,
  replay_expires_at TIMESTAMPTZ,
  status TEXT,
  view_duration_sec INTEGER,
  playback_duration_ms INTEGER,
  client_upload_id TEXT,
  viewed_at TIMESTAMPTZ,
  replayed_at TIMESTAMPTZ,
  unplayable_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
SET enable_sort = off
AS $$
  SELECT
    c.id, c.sender_id, c.receiver_id, c.created_at, c.media_path, c.media_type,
    c.is_viewed, c.is_replayed, c.replay_expires_at, c.status,
    c.view_duration_sec, c.playback_duration_ms, c.client_upload_id,
    c.viewed_at, c.replayed_at, c.unplayable_at
  FROM (
    (
      SELECT
        n.id, n.sender_id, n.receiver_id, n.created_at, n.media_path, n.media_type,
        n.is_viewed, n.is_replayed, n.replay_expires_at, n.status,
        n.view_duration_sec, n.playback_duration_ms, n.client_upload_id,
        n.viewed_at, n.replayed_at, n.unplayable_at
      FROM public.nixes n
      WHERE n.sender_id = (SELECT auth.uid())
        AND n.receiver_id = p_peer_id
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    )
    UNION ALL
    (
      SELECT
        n.id, n.sender_id, n.receiver_id, n.created_at, n.media_path, n.media_type,
        n.is_viewed, n.is_replayed, n.replay_expires_at, n.status,
        n.view_duration_sec, n.playback_duration_ms, n.client_upload_id,
        n.viewed_at, n.replayed_at, n.unplayable_at
      FROM public.nixes n
      WHERE n.sender_id = p_peer_id
        AND n.receiver_id = (SELECT auth.uid())
        AND n.sender_id IS DISTINCT FROM (SELECT auth.uid())
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    )
  ) c
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

COMMENT ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) IS
  'Newest NiXes between the caller and one peer (both directions, no thumbnail_b64, with status timestamps). Two index-ordered branches over idx_nixes_pair_created_at. SECURITY INVOKER: relies on nixes_select RLS.';

REVOKE ALL ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- Chat texts: read_at for the sender's "Opened". Recreated because the return
-- type grows; body as in 20260725124500_capture_attempt.sql with a pinned,
-- empty search_path.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INT);

CREATE FUNCTION public.fetch_text_messages_with_peer(
  peer_id UUID,
  before_created_at TIMESTAMPTZ DEFAULT NULL,
  msg_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  receiver_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  client_message_id TEXT,
  metadata JSONB,
  is_system BOOLEAN,
  read_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tm.id, tm.sender_id, tm.receiver_id, tm.body, tm.created_at, tm.expires_at,
         tm.client_message_id, tm.metadata, tm.is_system, tm.read_at
  FROM public.text_messages tm
  WHERE
    ((tm.sender_id = (SELECT auth.uid()) AND tm.receiver_id = peer_id)
      OR (tm.receiver_id = (SELECT auth.uid()) AND tm.sender_id = peer_id))
    AND tm.expires_at > now()
    AND NOT private.is_pair_blocked((SELECT auth.uid()), peer_id)
    AND (before_created_at IS NULL OR tm.created_at < before_created_at)
  ORDER BY tm.created_at DESC
  LIMIT LEAST(COALESCE(msg_limit, 50), 100);
$$;

REVOKE ALL ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INT) TO authenticated;
