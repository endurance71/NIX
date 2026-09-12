-- Client-callable text enqueue. Sender is always auth.uid(); do not GRANT the
-- 4-arg enqueue_text_moderation_job (p_sender_id) to authenticated.
-- Flag remains independently FALSE; this function raises MODERATION_DISABLED
-- before inserting any job.

CREATE OR REPLACE FUNCTION public.enqueue_own_text_moderation_job(
  p_receiver_id UUID,
  p_body TEXT,
  p_client_message_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  payload_id UUID;
  job_id UUID;
  existing public.moderation_jobs%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF NOT private.pre_delivery_moderation_enabled() THEN
    RAISE EXCEPTION 'MODERATION_DISABLED';
  END IF;
  IF NOT public.can_send_text_message(actor_id, p_receiver_id) THEN
    RAISE EXCEPTION 'NOT_FRIEND';
  END IF;
  IF NOT private.text_message_passes_safety_filter(p_body) THEN
    RAISE EXCEPTION 'CONTENT_NOT_ALLOWED';
  END IF;

  IF p_client_message_id IS NOT NULL THEN
    SELECT *
    INTO existing
    FROM public.moderation_jobs
    WHERE sender_id = actor_id
      AND receiver_id = p_receiver_id
      AND client_message_id = p_client_message_id
      AND content_kind = 'text'
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'jobId', existing.id,
        'status', existing.status,
        'decision', existing.decision
      );
    END IF;
  END IF;

  INSERT INTO public.moderation_text_payloads(body)
  VALUES (p_body)
  RETURNING id INTO payload_id;

  INSERT INTO public.moderation_jobs (
    content_kind,
    text_payload_id,
    sender_id,
    receiver_id,
    client_message_id,
    status
  )
  VALUES (
    'text',
    payload_id,
    actor_id,
    p_receiver_id,
    p_client_message_id,
    'pending'
  )
  RETURNING id INTO job_id;

  RETURN jsonb_build_object(
    'jobId', job_id,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_own_text_moderation_job(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_own_text_moderation_job(UUID, TEXT, TEXT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.enqueue_own_text_moderation_job(UUID, TEXT, TEXT) IS
  'Enqueue a text moderation job for auth.uid(). Raises MODERATION_DISABLED while the production flag is off.';
