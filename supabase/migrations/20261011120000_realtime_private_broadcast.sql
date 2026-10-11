-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- DB-2: replace the unfiltered `postgres_changes` streams on `message_reactions` ('*') and
-- `text_messages` (DELETE) with Realtime Broadcast to a private per-user topic `user:<uuid>`.
--
-- * Payloads carry only ids (message ids, peer ids) and an event name, never message bodies.
-- * Triggers are statement-level with transition tables, so one statement produces at most one
--   broadcast per affected user. The `cleanup-text-messages` cron deletes up to 500 expired rows
--   per statement; that is now one `messages_removed` broadcast per participant, not one event
--   per row fanned out to every connected client.
-- * Reactions removed by `ON DELETE CASCADE` from `text_messages` are not broadcast: the parent
--   row is already gone, so no participants resolve, and the `messages_removed` broadcast from
--   `text_messages` already tells clients to refresh text and reactions.
-- * Broadcasting must never break the user's write: every failure is downgraded to a WARNING
--   (`realtime.send` itself also swallows its own errors).
--
-- Deploy order: this migration first, then the client OTA that subscribes to `user:<uuid>`.
-- Older clients keep their `postgres_changes` subscriptions and are unaffected.

-- ---------------------------------------------------------------------------------------------
-- Receive-only authorization for private broadcast topics.
-- ---------------------------------------------------------------------------------------------
-- RLS is already enabled on realtime.messages (owned by supabase_realtime_admin); do not ALTER it.
-- No INSERT policy is created: clients cannot broadcast (or join with write access) on any
-- private topic; only the SECURITY DEFINER triggers below (owner bypasses RLS) write to it.
DROP POLICY IF EXISTS realtime_user_topic_receive ON realtime.messages;
CREATE POLICY realtime_user_topic_receive
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) = 'user:' || (SELECT auth.uid())::text
  -- Realtime checks access by reading a probe row it writes for the joined topic; also pinning
  -- the row topic keeps the policy correct for any other reader of realtime.messages.
  AND realtime.messages.topic = (SELECT realtime.topic())
);

-- ---------------------------------------------------------------------------------------------
-- message_reactions INSERT / UPDATE / DELETE -> `reaction_changed` to both participants.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.broadcast_message_reaction_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_message_ids uuid[];
  v_recipient record;
BEGIN
  BEGIN
    -- Each branch only names the transition tables that exist for that event.
    IF TG_OP = 'INSERT' THEN
      SELECT array_agg(DISTINCT n.message_id) INTO v_message_ids FROM new_reaction_rows n;
    ELSIF TG_OP = 'UPDATE' THEN
      SELECT array_agg(DISTINCT c.message_id) INTO v_message_ids
      FROM (
        SELECT n.message_id FROM new_reaction_rows n
        UNION
        SELECT o.message_id FROM old_reaction_rows o
      ) c;
    ELSIF TG_OP = 'DELETE' THEN
      SELECT array_agg(DISTINCT o.message_id) INTO v_message_ids FROM old_reaction_rows o;
    END IF;

    IF v_message_ids IS NULL THEN
      RETURN NULL;
    END IF;

    FOR v_recipient IN
      WITH participants AS (
        SELECT tm.id AS message_id, tm.sender_id AS user_id, tm.receiver_id AS peer_id
        FROM public.text_messages tm
        WHERE tm.id = ANY (v_message_ids)
          AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
        UNION ALL
        SELECT tm.id, tm.receiver_id, tm.sender_id
        FROM public.text_messages tm
        WHERE tm.id = ANY (v_message_ids)
          AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
      )
      SELECT
        p.user_id,
        array_agg(DISTINCT p.message_id) AS message_ids,
        array_agg(DISTINCT p.peer_id) AS peer_ids
      FROM participants p
      GROUP BY p.user_id
    LOOP
      PERFORM realtime.send(
        jsonb_build_object(
          'v', 1,
          'op', TG_OP,
          'message_ids', to_jsonb(v_recipient.message_ids[1:100]),
          'peer_ids', to_jsonb(v_recipient.peer_ids[1:100]),
          'truncated', cardinality(v_recipient.message_ids) > 100
            OR cardinality(v_recipient.peer_ids) > 100
        ),
        'reaction_changed',
        'user:' || v_recipient.user_id::text,
        true
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast_message_reaction_changes skipped: % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- text_messages DELETE -> `messages_removed` to both participants (cron expiry, conversation
-- deletion, moderation removal, account deletion cascade).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.broadcast_text_message_removals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recipient record;
BEGIN
  BEGIN
    FOR v_recipient IN
      WITH participants AS (
        SELECT o.id AS message_id, o.sender_id AS user_id, o.receiver_id AS peer_id
        FROM old_message_rows o
        UNION ALL
        SELECT o.id, o.receiver_id, o.sender_id
        FROM old_message_rows o
      )
      SELECT
        p.user_id,
        array_agg(DISTINCT p.message_id) AS message_ids,
        array_agg(DISTINCT p.peer_id) AS peer_ids
      FROM participants p
      GROUP BY p.user_id
    LOOP
      PERFORM realtime.send(
        jsonb_build_object(
          'v', 1,
          'message_ids', to_jsonb(v_recipient.message_ids[1:100]),
          'peer_ids', to_jsonb(v_recipient.peer_ids[1:100]),
          'truncated', cardinality(v_recipient.message_ids) > 100
            OR cardinality(v_recipient.peer_ids) > 100
        ),
        'messages_removed',
        'user:' || v_recipient.user_id::text,
        true
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast_text_message_removals skipped: % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

-- Trigger functions are fired by the trigger machinery; nobody needs to call them directly.
REVOKE ALL ON FUNCTION private.broadcast_message_reaction_changes() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.broadcast_text_message_removals() FROM PUBLIC, anon, authenticated, service_role;

-- A trigger with transition tables can name only one event, hence three reaction triggers.
DROP TRIGGER IF EXISTS broadcast_message_reaction_inserts ON public.message_reactions;
CREATE TRIGGER broadcast_message_reaction_inserts
AFTER INSERT ON public.message_reactions
REFERENCING NEW TABLE AS new_reaction_rows
FOR EACH STATEMENT
EXECUTE FUNCTION private.broadcast_message_reaction_changes();

DROP TRIGGER IF EXISTS broadcast_message_reaction_updates ON public.message_reactions;
CREATE TRIGGER broadcast_message_reaction_updates
AFTER UPDATE ON public.message_reactions
REFERENCING OLD TABLE AS old_reaction_rows NEW TABLE AS new_reaction_rows
FOR EACH STATEMENT
EXECUTE FUNCTION private.broadcast_message_reaction_changes();

DROP TRIGGER IF EXISTS broadcast_message_reaction_deletes ON public.message_reactions;
CREATE TRIGGER broadcast_message_reaction_deletes
AFTER DELETE ON public.message_reactions
REFERENCING OLD TABLE AS old_reaction_rows
FOR EACH STATEMENT
EXECUTE FUNCTION private.broadcast_message_reaction_changes();

DROP TRIGGER IF EXISTS broadcast_text_message_removals ON public.text_messages;
CREATE TRIGGER broadcast_text_message_removals
AFTER DELETE ON public.text_messages
REFERENCING OLD TABLE AS old_message_rows
FOR EACH STATEMENT
EXECUTE FUNCTION private.broadcast_text_message_removals();
