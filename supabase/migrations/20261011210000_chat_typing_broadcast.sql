-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Chat typing indicator („pisze…”) over Realtime Broadcast, with no table writes.
--
-- Each pair of friends shares one private topic `typing:<lower uuid>:<higher uuid>` (lowercase,
-- canonical order). Only the two participants may join (receive) or broadcast (send) on it, and
-- only while they are accepted friends, not blocked and neither account is restricted: the same
-- gate as sending a text message (`public.can_send_text_message`), minus its rate limit.
--
-- * Clients send `{ v, user_id, typing }` only; never message content.
-- * The existing receive-only `user:<uuid>` policy (20261011120000) is untouched. These policies are
--   permissive and apply only to `typing:` topics, so clients still cannot broadcast on `user:`.
-- * Realtime evaluates the policies once per join (it probes `realtime.messages` with the joined
--   topic set in `realtime.topic`), so the helper runs per join, not per keystroke.
--
-- Deploy order is free: clients that cannot join (this migration missing) silently show nothing.

CREATE OR REPLACE FUNCTION private.can_use_chat_typing_topic(p_topic TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_parts TEXT[];
  v_first UUID;
  v_second UUID;
  v_peer UUID;
BEGIN
  IF v_uid IS NULL OR p_topic IS NULL
     OR p_topic !~ '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN FALSE;
  END IF;

  v_parts := string_to_array(p_topic, ':');
  v_first := v_parts[2]::UUID;
  v_second := v_parts[3]::UUID;

  -- One canonical topic per pair (lower id first); this also rejects `typing:<me>:<me>`.
  IF v_parts[2] >= v_parts[3] THEN
    RETURN FALSE;
  END IF;

  IF v_uid = v_first THEN
    v_peer := v_second;
  ELSIF v_uid = v_second THEN
    v_peer := v_first;
  ELSE
    RETURN FALSE;
  END IF;

  IF private.is_pair_blocked(v_uid, v_peer) THEN RETURN FALSE; END IF;
  IF private.is_account_restricted(v_uid) OR private.is_account_restricted(v_peer) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = v_uid AND f.friend_id = v_peer)
        OR (f.user_id = v_peer AND f.friend_id = v_uid)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.can_use_chat_typing_topic(TEXT) FROM PUBLIC, anon, service_role;
-- Policies are evaluated as the joining user, so `authenticated` must be able to call the helper.
GRANT EXECUTE ON FUNCTION private.can_use_chat_typing_topic(TEXT) TO authenticated;

DROP POLICY IF EXISTS realtime_chat_typing_receive ON realtime.messages;
CREATE POLICY realtime_chat_typing_receive
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND realtime.messages.topic = (SELECT realtime.topic())
  AND (SELECT realtime.topic()) LIKE 'typing:%'
  AND (SELECT private.can_use_chat_typing_topic(realtime.topic()))
);

DROP POLICY IF EXISTS realtime_chat_typing_send ON realtime.messages;
CREATE POLICY realtime_chat_typing_send
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND realtime.messages.topic = (SELECT realtime.topic())
  AND (SELECT realtime.topic()) LIKE 'typing:%'
  AND (SELECT private.can_use_chat_typing_topic(realtime.topic()))
);
