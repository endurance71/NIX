-- Sender-only media job status for the iOS wait loop. Never returns media bytes.

CREATE OR REPLACE FUNCTION public.get_own_media_moderation_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  selected public.moderation_jobs%ROWTYPE;
  delivered_id UUID;
  batch_status TEXT;
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
    AND content_kind = 'media';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;
  IF selected.sender_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF selected.status = 'approved' THEN
    SELECT r.nix_id
    INTO delivered_id
    FROM public.media_upload_recipients r
    WHERE r.batch_id = selected.batch_id
      AND r.nix_id IS NOT NULL
    ORDER BY r.created_at
    LIMIT 1;

    SELECT b.status
    INTO batch_status
    FROM public.media_upload_batches b
    WHERE b.id = selected.batch_id;
  END IF;

  RETURN jsonb_build_object(
    'jobId', selected.id,
    'status', selected.status,
    'decision', selected.decision,
    'nixId', delivered_id,
    'batchStatus', batch_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_own_media_moderation_job(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_media_moderation_job(UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_own_media_moderation_job(UUID) IS
  'Returns status of a media moderation job owned by auth.uid(). Never returns media bytes.';
