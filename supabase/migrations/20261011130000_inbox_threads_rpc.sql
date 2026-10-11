-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Inbox bundle in one round trip (audit DB-6 / P1-3, 2026-10-10).
--
-- The client used to build the inbox from five parallel PostgREST requests
-- (received nixes, sent nixes, recent text messages, conversation read states,
-- unread count) plus a second wave for public profiles. This RPC returns the
-- same data as one JSON object.
--
-- Security model: SECURITY INVOKER. Every row is read through the caller's
-- own grants and the existing RLS policies (nixes_select, text_messages_select,
-- conversation_read_states_owner), so pair blocks and account restriction are
-- enforced exactly as for the separate queries. Profiles and the unread badge
-- come from the existing RPCs (get_public_profiles_by_ids,
-- get_unread_inbox_count), which keep their own privacy rules. The function
-- itself adds no privilege; it only narrows each read to the caller.
--
-- Column lists mirror the client selects in src/services/nixService.ts and
-- src/services/textMessageService.ts. thumbnail_b64 is intentionally absent.
-- Limits match the client: every list is clamped to 1..100 rows.

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
      n.view_duration_sec
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
      n.client_upload_id
    FROM public.nixes n
    WHERE n.sender_id = v_uid
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT v_limit
  ),
  -- `sender_id = me OR receiver_id = me` split into two index-friendly
  -- branches. The second branch skips self-addressed rows so nothing is
  -- returned twice.
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
      CASE WHEN t.sender_id = v_uid THEN t.receiver_id ELSE t.sender_id END AS peer_id
    FROM (
      (
        SELECT m.id, m.sender_id, m.receiver_id, m.body, m.created_at, m.expires_at,
               m.client_message_id, m.is_system, m.metadata
        FROM public.text_messages m
        WHERE m.sender_id = v_uid
          AND m.expires_at > now()
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT v_limit
      )
      UNION ALL
      (
        SELECT m.id, m.sender_id, m.receiver_id, m.body, m.created_at, m.expires_at,
               m.client_message_id, m.is_system, m.metadata
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
  -- Read states are only consumed for text unread flags, so return just the
  -- peers that appear in `texts`.
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

COMMENT ON FUNCTION public.get_inbox_bundle(INTEGER) IS
  'Inbox bundle for the caller in one round trip (received/sent nixes, recent texts, read states, public profiles, unread count). SECURITY INVOKER: relies on existing RLS.';

REVOKE ALL ON FUNCTION public.get_inbox_bundle(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inbox_bundle(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.get_inbox_bundle(INTEGER) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_inbox_bundle(INTEGER) TO authenticated;
