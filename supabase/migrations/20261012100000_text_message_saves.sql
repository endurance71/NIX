-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- „Zapisz w czacie” (Snapchat-style saved messages) for 1:1 text messages.
--
-- Model
-- * A saved message carries `saved_at` / `saved_by` (who saved it; either participant may save)
--   and its `expires_at` is pushed to a far-future sentinel. Every existing reader and the expiry
--   sweep already filter on `expires_at` (fetch RPC, inbox bundle, read receipts, the
--   `cleanup-text-messages` cron, the client's local expiry clock), so a saved row is skipped
--   everywhere without touching any of them.
-- * Unsaving (by either participant) clears both columns and sets `expires_at = now() + 24 h`:
--   the message disappears 24 hours after it was unsaved, whatever its age. Never immediately —
--   the other participant gets a full day to see it or save it again.
-- * The state is shared by the pair, not private per user, so it lives on the row both
--   participants can already read (`text_messages_select`). There is still no UPDATE policy: the
--   only writer is the SECURITY DEFINER RPC below, callable by the two participants.
-- * The client INSERT policy now also pins the new columns and the 24 h expiry, so a client can
--   never insert a pre-saved or long-lived message directly.
--
-- Realtime: the RPC broadcasts `message_saved` on the pair's private `typing:<lo>:<hi>` topic
-- (20261011210000), which the open chat already joins; both participants refresh that chat. The
-- sender additionally gets the regular `postgres_changes` UPDATE on `sender_id`.
--
-- Deploy order is free: clients without this migration never call the RPC (the capability probe
-- `get_chat_capabilities` from 20261012101000 is missing, so the action stays hidden).

ALTER TABLE public.text_messages
  ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS saved_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.text_messages.saved_at IS
  'When a participant saved the message in the chat (it then does not expire). NULL = not saved.';
COMMENT ON COLUMN public.text_messages.saved_by IS
  'Participant who saved the message; set together with saved_at by set_text_message_saved.';

ALTER TABLE public.text_messages
  DROP CONSTRAINT IF EXISTS text_messages_saved_pair_chk,
  ADD CONSTRAINT text_messages_saved_pair_chk CHECK ((saved_at IS NULL) = (saved_by IS NULL)),
  DROP CONSTRAINT IF EXISTS text_messages_saved_by_participant_chk,
  ADD CONSTRAINT text_messages_saved_by_participant_chk
    CHECK (saved_by IS NULL OR saved_by = sender_id OR saved_by = receiver_id);

-- FK index (account deletion cascades through saved_by); saved rows are rare, so partial.
CREATE INDEX IF NOT EXISTS text_messages_saved_by_idx
  ON public.text_messages (saved_by)
  WHERE saved_by IS NOT NULL;

-- Direct client inserts: same gate as before, plus no pre-saved rows and the default 24 h expiry.
ALTER POLICY text_messages_insert ON public.text_messages
WITH CHECK (
  (NOT (SELECT private.pre_delivery_moderation_enabled()))
  AND sender_id = (SELECT auth.uid())
  AND public.can_send_text_message(sender_id, receiver_id)
  AND private.text_message_passes_safety_filter(body)
  AND saved_at IS NULL
  AND saved_by IS NULL
  AND expires_at <= now() + INTERVAL '24 hours'
);

-- ---------------------------------------------------------------------------------------------
-- set_text_message_saved(message_id, saved)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_text_message_saved(p_message_id UUID, p_saved BOOLEAN)
RETURNS TABLE (id UUID, saved_at TIMESTAMPTZ, saved_by UUID, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_message public.text_messages%ROWTYPE;
  v_changed BOOLEAN := FALSE;
  -- Far-future sentinel instead of 'infinity': every client parses it as a normal date.
  c_saved_expires_at CONSTANT TIMESTAMPTZ := TIMESTAMPTZ '9999-12-31 23:59:59+00';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_saved IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT tm.* INTO v_message
  FROM public.text_messages tm
  WHERE tm.id = p_message_id
  FOR UPDATE;

  -- Strangers, blocked pairs and expired rows all look the same: not found.
  IF NOT FOUND
     OR (v_message.sender_id IS DISTINCT FROM v_uid AND v_message.receiver_id IS DISTINCT FROM v_uid)
     OR private.is_pair_blocked(v_message.sender_id, v_message.receiver_id)
     OR v_message.expires_at <= now()
  THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_message.is_system THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  IF p_saved AND v_message.saved_at IS NULL THEN
    UPDATE public.text_messages tm
    SET saved_at = now(), saved_by = v_uid, expires_at = c_saved_expires_at
    WHERE tm.id = p_message_id;
    v_changed := TRUE;
  ELSIF NOT p_saved AND v_message.saved_at IS NOT NULL THEN
    UPDATE public.text_messages tm
    SET saved_at = NULL, saved_by = NULL, expires_at = now() + INTERVAL '24 hours'
    WHERE tm.id = p_message_id;
    v_changed := TRUE;
  END IF;

  IF v_changed THEN
    -- Never let the broadcast break the user's write.
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('v', 1, 'message_id', p_message_id, 'saved', p_saved, 'by', v_uid),
        'message_saved',
        'typing:' || LEAST(v_message.sender_id::TEXT, v_message.receiver_id::TEXT)
          || ':' || GREATEST(v_message.sender_id::TEXT, v_message.receiver_id::TEXT),
        TRUE
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'set_text_message_saved broadcast skipped: % (%)', SQLERRM, SQLSTATE;
    END;
  END IF;

  RETURN QUERY
  SELECT tm.id, tm.saved_at, tm.saved_by, tm.expires_at
  FROM public.text_messages tm
  WHERE tm.id = p_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_text_message_saved(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_text_message_saved(UUID, BOOLEAN) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- fetch_text_messages_with_peer: also return the save state (return type changes → drop/create).
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INTEGER);
CREATE FUNCTION public.fetch_text_messages_with_peer(
  peer_id UUID,
  before_created_at TIMESTAMPTZ DEFAULT NULL,
  msg_limit INTEGER DEFAULT 50
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
  read_at TIMESTAMPTZ,
  saved_at TIMESTAMPTZ,
  saved_by UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tm.id, tm.sender_id, tm.receiver_id, tm.body, tm.created_at, tm.expires_at,
         tm.client_message_id, tm.metadata, tm.is_system, tm.read_at, tm.saved_at, tm.saved_by
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

REVOKE ALL ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INTEGER)
  TO authenticated, service_role;
