-- Lets a sender cancel a text that is still waiting for moderation.
--
-- Returns:
--   'cancelled'    the job was pending/processing; it is now a terminal error
--                  and its payload is deleted, so it can never be delivered.
--                  A worker holding the lease fails its completion check.
--   'already_sent' the text was approved (and delivered or about to be).
--   'not_sent'     the job had already ended as rejected/error.
--   'not_found'    no job exists for this client message id.
CREATE OR REPLACE FUNCTION public.cancel_own_text_moderation_job(
  p_receiver_id UUID,
  p_client_message_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  selected public.moderation_jobs%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF p_receiver_id IS NULL OR p_client_message_id IS NULL OR p_client_message_id = '' THEN
    RAISE EXCEPTION 'INVALID_REQUEST';
  END IF;

  SELECT *
  INTO selected
  FROM public.moderation_jobs j
  WHERE j.sender_id = actor_id
    AND j.receiver_id = p_receiver_id
    AND j.client_message_id = p_client_message_id
    AND j.content_kind = 'text'
  ORDER BY j.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF selected.status = 'approved' OR selected.materialized_at IS NOT NULL THEN
    RETURN 'already_sent';
  END IF;
  IF selected.status IN ('rejected', 'error') THEN
    RETURN 'not_sent';
  END IF;

  UPDATE public.moderation_jobs
  SET status = 'error',
      decision = 'error',
      last_error = 'cancelled_by_sender',
      completed_at = NOW(),
      updated_at = NOW(),
      lease_owner = NULL,
      lease_expires_at = NULL
  WHERE id = selected.id;

  IF selected.text_payload_id IS NOT NULL THEN
    DELETE FROM public.moderation_text_payloads WHERE id = selected.text_payload_id;
  END IF;

  RETURN 'cancelled';
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_own_text_moderation_job(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_text_moderation_job(UUID, TEXT) TO authenticated, service_role;
