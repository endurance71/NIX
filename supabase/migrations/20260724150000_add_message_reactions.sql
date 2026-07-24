-- Migration: add_message_reactions
-- iMessage-style tapback reactions on text_messages (fixed emoji set, one per user per message).

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.text_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (
    emoji IN ('heart', 'thumbsup', 'thumbsdown', 'hahaha', 'exclamation', 'question')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_message_user_uniq UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_reactions_message_id_idx
  ON public.message_reactions(message_id);

CREATE INDEX IF NOT EXISTS message_reactions_user_id_idx
  ON public.message_reactions(user_id);

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_reactions_select ON public.message_reactions;
CREATE POLICY message_reactions_select ON public.message_reactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.text_messages tm
      WHERE tm.id = message_id
        AND (tm.sender_id = auth.uid() OR tm.receiver_id = auth.uid())
        AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
    )
  );

DROP POLICY IF EXISTS message_reactions_insert ON public.message_reactions;
CREATE POLICY message_reactions_insert ON public.message_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.text_messages tm
      WHERE tm.id = message_id
        AND (tm.sender_id = auth.uid() OR tm.receiver_id = auth.uid())
        AND tm.expires_at > now()
        AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
    )
  );

DROP POLICY IF EXISTS message_reactions_update ON public.message_reactions;
CREATE POLICY message_reactions_update ON public.message_reactions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.text_messages tm
      WHERE tm.id = message_id
        AND (tm.sender_id = auth.uid() OR tm.receiver_id = auth.uid())
        AND tm.expires_at > now()
        AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
    )
  );

DROP POLICY IF EXISTS message_reactions_delete ON public.message_reactions;
CREATE POLICY message_reactions_delete ON public.message_reactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_message_reaction(
  p_message_id UUID,
  p_emoji TEXT
)
RETURNS public.message_reactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.message_reactions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_message_id IS NULL OR p_emoji IS NULL THEN
    RAISE EXCEPTION 'Invalid reaction input';
  END IF;

  IF p_emoji NOT IN ('heart', 'thumbsup', 'thumbsdown', 'hahaha', 'exclamation', 'question') THEN
    RAISE EXCEPTION 'Invalid reaction emoji';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.text_messages tm
    WHERE tm.id = p_message_id
      AND (tm.sender_id = auth.uid() OR tm.receiver_id = auth.uid())
      AND tm.expires_at > now()
      AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
  ) THEN
    RAISE EXCEPTION 'Message not available for reaction';
  END IF;

  INSERT INTO public.message_reactions (message_id, user_id, emoji)
  VALUES (p_message_id, auth.uid(), p_emoji)
  ON CONFLICT (message_id, user_id)
  DO UPDATE SET
    emoji = EXCLUDED.emoji,
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_message_reaction(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_message_reaction(UUID, TEXT) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.remove_message_reaction(p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'Invalid message id';
  END IF;

  DELETE FROM public.message_reactions mr
  WHERE mr.message_id = p_message_id
    AND mr.user_id = auth.uid();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_message_reaction(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.remove_message_reaction(UUID) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.fetch_message_reactions_with_peer(peer_id UUID)
RETURNS TABLE (
  id UUID,
  message_id UUID,
  user_id UUID,
  emoji TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mr.id, mr.message_id, mr.user_id, mr.emoji, mr.created_at, mr.updated_at
  FROM public.message_reactions mr
  INNER JOIN public.text_messages tm ON tm.id = mr.message_id
  WHERE
    (
      (tm.sender_id = auth.uid() AND tm.receiver_id = peer_id)
      OR (tm.receiver_id = auth.uid() AND tm.sender_id = peer_id)
    )
    AND tm.expires_at > now()
    AND NOT private.is_pair_blocked(auth.uid(), peer_id)
  ORDER BY mr.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_message_reactions_with_peer(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.fetch_message_reactions_with_peer(UUID) FROM PUBLIC, anon;
