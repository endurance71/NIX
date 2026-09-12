-- Sender-only job status for the iOS wait loop. Never returns message body.

CREATE OR REPLACE FUNCTION public.get_own_text_moderation_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  selected public.moderation_jobs%ROWTYPE;
  delivered_id UUID;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  SELECT *
  INTO selected
  FROM public.moderation_jobs
  WHERE id = p_job_id
    AND content_kind = 'text';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;
  IF selected.sender_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF selected.status = 'approved' AND selected.materialized_at IS NOT NULL THEN
    SELECT tm.id
    INTO delivered_id
    FROM public.text_messages tm
    WHERE tm.sender_id = selected.sender_id
      AND tm.receiver_id = selected.receiver_id
      AND (
        (
          selected.client_message_id IS NOT NULL
          AND tm.client_message_id = selected.client_message_id
        )
        OR (
          selected.client_message_id IS NULL
          AND tm.created_at >= selected.created_at
        )
      )
    ORDER BY tm.created_at DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'jobId', selected.id,
    'status', selected.status,
    'decision', selected.decision,
    'messageId', delivered_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_own_text_moderation_job(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_text_moderation_job(UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_own_text_moderation_job(UUID) IS
  'Returns status of a text moderation job owned by auth.uid(). Never returns body.';
