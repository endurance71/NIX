-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- NiX reactions: the receiver of a NiX can react to it with the chat tapback emoji set
-- (heart, thumbsup, thumbsdown, hahaha, exclamation, question), one reaction per NiX.
--
-- Model
-- * Separate table keyed by (nix_id, user_id), not a column on the shared `nixes` row: the
--   reaction is written by one participant and `nixes` is otherwise immutable for clients.
-- * Only the RECEIVER may set / change / remove a reaction. Both participants may read it.
-- * A reaction is allowed for as long as the NiX row exists, including after the NiX was opened
--   and its media cleaned up (`status = 'cleaned'`): the receiver typically reacts while viewing,
--   and the viewer may finish (and trigger cleanup) before the write lands. Rows go away with the
--   NiX (`ON DELETE CASCADE`) or with either account (`profiles` cascade).
-- * Every check goes through the caller's view of `nixes` (the `nixes_select` policy), so pair
--   blocks and account restrictions apply exactly as for reading the NiX itself.
--
-- Security: plain RLS plus SECURITY INVOKER RPCs with an empty search_path; the RPCs add no
-- privilege. Only the broadcast trigger function is SECURITY DEFINER (it must write
-- realtime.messages) and is not callable by any client role.
--
-- Realtime: no `postgres_changes` publication. A statement-level trigger sends a private
-- broadcast `nix_reaction_changed` (ids only) to `user:<uuid>` of both participants, reusing the
-- receive policy from 20261011120000_realtime_private_broadcast.sql.
--
-- Deploy order: this migration first, then the client OTA. Clients without it degrade silently
-- (the emoji in the viewer falls back to a text reply; badges stay hidden).

CREATE TABLE IF NOT EXISTS public.nix_reactions (
  nix_id UUID NOT NULL REFERENCES public.nixes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CONSTRAINT nix_reactions_emoji_check CHECK (
    emoji IN ('heart', 'thumbsup', 'thumbsdown', 'hahaha', 'exclamation', 'question')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (nix_id, user_id)
);

COMMENT ON TABLE public.nix_reactions IS
  'Receiver reactions to a NiX (chat tapback set). Receiver writes, both participants read (RLS).';

-- The primary key serves lookups by NiX; this index serves the profiles FK cascade.
CREATE INDEX IF NOT EXISTS idx_nix_reactions_user_id
  ON public.nix_reactions (user_id);

ALTER TABLE public.nix_reactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.nix_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.nix_reactions TO authenticated;
-- Writable columns only: created_at is set once by its default.
GRANT INSERT (nix_id, user_id, emoji) ON TABLE public.nix_reactions TO authenticated;
GRANT UPDATE (emoji, updated_at) ON TABLE public.nix_reactions TO authenticated;
GRANT ALL ON TABLE public.nix_reactions TO service_role;

-- Both participants of a NiX they can still see (nixes_select: not blocked, not restricted).
DROP POLICY IF EXISTS nix_reactions_select ON public.nix_reactions;
CREATE POLICY nix_reactions_select
  ON public.nix_reactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.nixes n
      WHERE n.id = nix_reactions.nix_id
        AND (SELECT auth.uid()) IN (n.sender_id, n.receiver_id)
    )
  );

-- Only the receiver, only as themself, only on a NiX they can still see.
DROP POLICY IF EXISTS nix_reactions_insert ON public.nix_reactions;
CREATE POLICY nix_reactions_insert
  ON public.nix_reactions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.nixes n
      WHERE n.id = nix_reactions.nix_id
        AND n.receiver_id = (SELECT auth.uid())
        AND n.sender_id <> n.receiver_id
    )
  );

DROP POLICY IF EXISTS nix_reactions_update ON public.nix_reactions;
CREATE POLICY nix_reactions_update
  ON public.nix_reactions FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.nixes n
      WHERE n.id = nix_reactions.nix_id
        AND n.receiver_id = (SELECT auth.uid())
        AND n.sender_id <> n.receiver_id
    )
  );

-- Removing your own reaction stays possible even if the NiX became invisible to you.
DROP POLICY IF EXISTS nix_reactions_delete ON public.nix_reactions;
CREATE POLICY nix_reactions_delete
  ON public.nix_reactions FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: RLS above is the only gate)
-- ---------------------------------------------------------------------------------------------

-- Sets (or changes) the caller's reaction. Setting the same emoji again is a no-op (no write,
-- no broadcast); removing is `remove_nix_reaction`.
CREATE OR REPLACE FUNCTION public.set_nix_reaction(p_nix_id UUID, p_emoji TEXT)
RETURNS public.nix_reactions
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_row public.nix_reactions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_nix_id IS NULL OR p_emoji IS NULL THEN
    RAISE EXCEPTION 'Invalid reaction input' USING ERRCODE = '22023';
  END IF;

  -- Read through nixes_select: a blocked pair, a restricted account or a NiX that is not
  -- addressed to the caller all look like "not available".
  IF NOT EXISTS (
    SELECT 1
    FROM public.nixes n
    WHERE n.id = p_nix_id
      AND n.receiver_id = v_uid
      AND n.sender_id <> n.receiver_id
  ) THEN
    RAISE EXCEPTION 'NiX not available for reaction' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.nix_reactions AS r (nix_id, user_id, emoji)
  VALUES (p_nix_id, v_uid, p_emoji)
  ON CONFLICT (nix_id, user_id) DO UPDATE
    SET emoji = EXCLUDED.emoji,
        updated_at = now()
    WHERE r.emoji IS DISTINCT FROM EXCLUDED.emoji
  RETURNING r.* INTO v_row;

  IF v_row.nix_id IS NULL THEN
    SELECT r.* INTO v_row
    FROM public.nix_reactions r
    WHERE r.nix_id = p_nix_id
      AND r.user_id = v_uid;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_nix_reaction(p_nix_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_deleted INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_nix_id IS NULL THEN
    RAISE EXCEPTION 'Invalid reaction input' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.nix_reactions r
  WHERE r.nix_id = p_nix_id
    AND r.user_id = v_uid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- Reactions for a batch of NiX ids (chat NiX chips, inbox rows, viewer queue). At most 200 ids
-- per call; ids the caller cannot see simply return nothing.
CREATE OR REPLACE FUNCTION public.get_nix_reactions(p_nix_ids UUID[])
RETURNS TABLE (
  nix_id UUID,
  user_id UUID,
  emoji TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT r.nix_id, r.user_id, r.emoji, r.updated_at
  FROM public.nix_reactions r
  WHERE r.nix_id = ANY (p_nix_ids[1:200])
  ORDER BY r.nix_id, r.user_id;
$$;

REVOKE ALL ON FUNCTION public.set_nix_reaction(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_nix_reaction(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_nix_reactions(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_nix_reaction(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_nix_reaction(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nix_reactions(UUID[]) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- nix_reactions INSERT / UPDATE / DELETE -> `nix_reaction_changed` to both participants.
-- Same shape and failure policy as private.broadcast_message_reaction_changes: ids only, one
-- broadcast per participant per statement, never breaks the write.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.broadcast_nix_reaction_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nix_ids uuid[];
  v_recipient record;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      SELECT array_agg(DISTINCT n.nix_id) INTO v_nix_ids FROM new_nix_reaction_rows n;
    ELSIF TG_OP = 'UPDATE' THEN
      SELECT array_agg(DISTINCT c.nix_id) INTO v_nix_ids
      FROM (
        SELECT n.nix_id FROM new_nix_reaction_rows n
        UNION
        SELECT o.nix_id FROM old_nix_reaction_rows o
      ) c;
    ELSIF TG_OP = 'DELETE' THEN
      SELECT array_agg(DISTINCT o.nix_id) INTO v_nix_ids FROM old_nix_reaction_rows o;
    END IF;

    IF v_nix_ids IS NULL THEN
      RETURN NULL;
    END IF;

    -- A NiX already deleted (cascade) resolves no participants: nothing to refresh.
    FOR v_recipient IN
      WITH participants AS (
        SELECT n.id AS nix_id, n.sender_id AS user_id, n.receiver_id AS peer_id
        FROM public.nixes n
        WHERE n.id = ANY (v_nix_ids)
          AND NOT private.is_pair_blocked(n.sender_id, n.receiver_id)
        UNION ALL
        SELECT n.id, n.receiver_id, n.sender_id
        FROM public.nixes n
        WHERE n.id = ANY (v_nix_ids)
          AND n.receiver_id <> n.sender_id
          AND NOT private.is_pair_blocked(n.sender_id, n.receiver_id)
      )
      SELECT
        p.user_id,
        array_agg(DISTINCT p.nix_id) AS nix_ids,
        array_agg(DISTINCT p.peer_id) AS peer_ids
      FROM participants p
      GROUP BY p.user_id
    LOOP
      PERFORM realtime.send(
        jsonb_build_object(
          'v', 1,
          'op', TG_OP,
          'nix_ids', to_jsonb(v_recipient.nix_ids[1:100]),
          'peer_ids', to_jsonb(v_recipient.peer_ids[1:100]),
          'truncated', cardinality(v_recipient.nix_ids) > 100
            OR cardinality(v_recipient.peer_ids) > 100
        ),
        'nix_reaction_changed',
        'user:' || v_recipient.user_id::text,
        true
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast_nix_reaction_changes skipped: % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_nix_reaction_changes() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS broadcast_nix_reaction_inserts ON public.nix_reactions;
CREATE TRIGGER broadcast_nix_reaction_inserts
AFTER INSERT ON public.nix_reactions
REFERENCING NEW TABLE AS new_nix_reaction_rows
FOR EACH STATEMENT
EXECUTE FUNCTION private.broadcast_nix_reaction_changes();

DROP TRIGGER IF EXISTS broadcast_nix_reaction_updates ON public.nix_reactions;
CREATE TRIGGER broadcast_nix_reaction_updates
AFTER UPDATE ON public.nix_reactions
REFERENCING OLD TABLE AS old_nix_reaction_rows NEW TABLE AS new_nix_reaction_rows
FOR EACH STATEMENT
EXECUTE FUNCTION private.broadcast_nix_reaction_changes();

DROP TRIGGER IF EXISTS broadcast_nix_reaction_deletes ON public.nix_reactions;
CREATE TRIGGER broadcast_nix_reaction_deletes
AFTER DELETE ON public.nix_reactions
REFERENCING OLD TABLE AS old_nix_reaction_rows
FOR EACH STATEMENT
EXECUTE FUNCTION private.broadcast_nix_reaction_changes();
