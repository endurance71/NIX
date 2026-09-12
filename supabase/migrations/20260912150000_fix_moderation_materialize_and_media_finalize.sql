-- Incident 2026-09-12: approved text never delivered (payload DELETE nulls
-- text_payload_id and trips moderation_jobs_target_chk). Photo finalize 400
-- because media_assets has no updated_at.

ALTER TABLE public.moderation_jobs
  DROP CONSTRAINT IF EXISTS moderation_jobs_target_chk;

ALTER TABLE public.moderation_jobs
  ADD CONSTRAINT moderation_jobs_target_chk CHECK (
    (
      content_kind = 'media'
      AND batch_id IS NOT NULL
      AND asset_id IS NOT NULL
    )
    OR (
      content_kind = 'text'
      AND receiver_id IS NOT NULL
      AND (
        text_payload_id IS NOT NULL
        OR status IN ('approved', 'rejected', 'error')
      )
    )
  );

CREATE OR REPLACE FUNCTION public.materialize_approved_text_message(p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_job public.moderation_jobs%ROWTYPE;
  payload_body TEXT;
  inserted_id UUID;
BEGIN
  SELECT *
  INTO selected_job
  FROM public.moderation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND OR selected_job.content_kind <> 'text' THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;
  IF selected_job.status <> 'approved' THEN
    RAISE EXCEPTION 'JOB_NOT_APPROVED';
  END IF;

  IF selected_job.materialized_at IS NOT NULL THEN
    SELECT tm.id
    INTO inserted_id
    FROM public.text_messages tm
    WHERE tm.sender_id = selected_job.sender_id
      AND tm.receiver_id = selected_job.receiver_id
      AND (
        (
          selected_job.client_message_id IS NOT NULL
          AND tm.client_message_id = selected_job.client_message_id
        )
        OR (
          selected_job.client_message_id IS NULL
          AND tm.created_at >= selected_job.created_at
        )
      )
    ORDER BY tm.created_at DESC
    LIMIT 1;
    RETURN inserted_id;
  END IF;

  SELECT body
  INTO payload_body
  FROM public.moderation_text_payloads
  WHERE id = selected_job.text_payload_id;

  IF payload_body IS NULL THEN
    RAISE EXCEPTION 'PAYLOAD_NOT_FOUND';
  END IF;

  INSERT INTO public.text_messages (
    sender_id,
    receiver_id,
    body,
    client_message_id
  )
  VALUES (
    selected_job.sender_id,
    selected_job.receiver_id,
    payload_body,
    selected_job.client_message_id
  )
  ON CONFLICT (sender_id, receiver_id, client_message_id)
    WHERE client_message_id IS NOT NULL
  DO UPDATE SET body = EXCLUDED.body
  RETURNING id INTO inserted_id;

  UPDATE public.moderation_jobs
  SET materialized_at = NOW(),
      updated_at = NOW()
  WHERE id = p_job_id;

  DELETE FROM public.moderation_text_payloads
  WHERE id = selected_job.text_payload_id;

  RETURN inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_media_upload_batch(
  p_batch_id UUID,
  p_finalize_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_batch public.media_upload_batches%ROWTYPE;
  selected_asset public.media_assets%ROWTYPE;
  stored_size_bytes BIGINT;
  stored_content_type TEXT;
  moderation_job_id UUID;
BEGIN
  SELECT *
  INTO selected_batch
  FROM public.media_upload_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND';
  END IF;
  IF selected_batch.finalize_token_hash IS DISTINCT FROM p_finalize_token_hash THEN
    RAISE EXCEPTION 'INVALID_FINALIZE_TOKEN';
  END IF;
  IF selected_batch.expires_at <= NOW() THEN
    UPDATE public.media_upload_batches
    SET status = 'expired', updated_at = NOW()
    WHERE id = p_batch_id;
    RAISE EXCEPTION 'BATCH_EXPIRED';
  END IF;

  SELECT *
  INTO selected_asset
  FROM public.media_assets
  WHERE id = selected_batch.asset_id
  FOR UPDATE;

  IF selected_batch.status IN ('completed', 'partially_completed', 'moderation_pending') THEN
    RETURN jsonb_build_object(
      'batchId', selected_batch.id,
      'assetId', selected_batch.asset_id,
      'status', selected_batch.status,
      'recipients', (
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object(
            'receiverId', r.receiver_id,
            'status', r.status,
            'nixId', r.nix_id,
            'errorCode', r.error_code
          ) ORDER BY r.created_at),
          '[]'::JSONB
        )
        FROM public.media_upload_recipients r
        WHERE r.batch_id = selected_batch.id
      )
    );
  END IF;

  SELECT
    CASE
      WHEN COALESCE(o.metadata->>'size', '') ~ '^[0-9]+$'
        THEN (o.metadata->>'size')::BIGINT
      ELSE NULL
    END,
    lower(COALESCE(o.metadata->>'mimetype', ''))
  INTO stored_size_bytes, stored_content_type
  FROM storage.objects o
  WHERE o.bucket_id = 'media-vault'
    AND o.name = selected_asset.storage_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OBJECT_NOT_FOUND';
  END IF;
  IF stored_size_bytes IS NULL OR stored_size_bytes <> selected_asset.size_bytes THEN
    RAISE EXCEPTION 'OBJECT_SIZE_MISMATCH';
  END IF;
  IF stored_content_type = '' OR stored_content_type <> lower(selected_asset.content_type) THEN
    RAISE EXCEPTION 'OBJECT_MIME_MISMATCH';
  END IF;

  IF private.pre_delivery_moderation_enabled() THEN
    UPDATE public.media_upload_batches
    SET status = 'moderation_pending', updated_at = NOW()
    WHERE id = selected_batch.id;

    UPDATE public.media_assets
    SET status = 'moderation_pending'
    WHERE id = selected_asset.id;

    INSERT INTO public.moderation_jobs (
      content_kind,
      batch_id,
      asset_id,
      sender_id,
      status
    )
    VALUES (
      'media',
      selected_batch.id,
      selected_asset.id,
      selected_batch.sender_id,
      'pending'
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO moderation_job_id;

    IF moderation_job_id IS NULL THEN
      SELECT j.id
      INTO moderation_job_id
      FROM public.moderation_jobs j
      WHERE j.asset_id = selected_asset.id
        AND j.status IN ('pending', 'processing', 'approved')
      ORDER BY j.created_at DESC
      LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
      'batchId', selected_batch.id,
      'assetId', selected_asset.id,
      'status', 'moderation_pending',
      'jobId', moderation_job_id
    );
  END IF;

  RETURN private.finalize_media_upload_batch_legacy(p_batch_id);
END;
$$;

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

  IF selected.status = 'approved' THEN
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

REVOKE ALL ON FUNCTION public.materialize_approved_text_message(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_approved_text_message(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.finalize_media_upload_batch(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_media_upload_batch(UUID, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_own_text_moderation_job(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_text_moderation_job(UUID)
  TO authenticated, service_role;
