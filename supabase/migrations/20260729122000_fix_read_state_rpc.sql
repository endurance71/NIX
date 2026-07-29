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

  RETURN bounded_read_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_text_conversation_read(UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_text_conversation_read(UUID, TIMESTAMPTZ)
  TO authenticated;
