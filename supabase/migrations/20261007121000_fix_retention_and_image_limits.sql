-- Terminalize jobs before FK SET NULL removes expired quarantine payloads.
CREATE OR REPLACE FUNCTION public.cleanup_expired_moderation_quarantine()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed INTEGER := 0; removed INTEGER := 0;
BEGIN
  UPDATE public.moderation_jobs j SET status = 'error', decision = 'error',
    last_error = 'quarantine_ttl_expired', completed_at = NOW(), updated_at = NOW(),
    lease_owner = NULL, lease_expires_at = NULL
  WHERE j.status IN ('pending', 'processing', 'approved') AND j.materialized_at IS NULL
    AND (j.created_at <= NOW() - INTERVAL '24 hours' OR EXISTS (
      SELECT 1 FROM public.moderation_text_payloads p
      WHERE p.id = j.text_payload_id AND p.expires_at <= NOW()
    ));
  GET DIAGNOSTICS changed = ROW_COUNT;
  DELETE FROM public.moderation_text_payloads WHERE expires_at <= NOW();
  GET DIAGNOSTICS removed = ROW_COUNT;
  UPDATE public.media_upload_batches b SET status = 'failed', updated_at = NOW()
  WHERE b.status = 'moderation_pending' AND EXISTS (
    SELECT 1 FROM public.moderation_jobs j WHERE j.batch_id = b.id AND j.status IN ('rejected', 'error')
  );
  UPDATE public.media_assets a SET status = 'deleting'
  WHERE a.status = 'moderation_pending' AND EXISTS (
    SELECT 1 FROM public.moderation_jobs j WHERE j.asset_id = a.id AND j.status IN ('rejected', 'error')
  ) AND NOT EXISTS (SELECT 1 FROM public.nixes n WHERE n.asset_id = a.id
    AND n.status IN ('sent', 'viewed', 'cleanup_failed'));
  RETURN changed + removed;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_moderation_quarantine() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_moderation_quarantine() TO service_role;

-- SQL can expire downloads, but must retain the object key until Storage ACK.
CREATE OR REPLACE FUNCTION public.cleanup_expired_data_exports()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.data_export_jobs SET status = 'failed', error_code = 'EXPORT_BUILD_TIMEOUT', updated_at = NOW()
  WHERE status = 'processing' AND COALESCE(started_at, requested_at) < NOW() - INTERVAL '24 hours';
  UPDATE public.data_export_jobs SET status = 'expired', updated_at = NOW()
  WHERE (status = 'ready' AND expires_at <= NOW())
    OR (requested_at < NOW() - INTERVAL '30 days' AND status <> 'expired');
  DELETE FROM public.data_export_jobs
  WHERE requested_at < NOW() - INTERVAL '30 days' AND storage_path IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_data_exports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_data_exports() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
      WHERE jobname IN ('moderation-quarantine-cleanup', 'cleanup-media-upload-orphans');
    PERFORM cron.schedule('moderation-quarantine-cleanup', '*/5 * * * *',
      'SELECT public.cleanup_expired_moderation_quarantine();');
    PERFORM cron.schedule('cleanup-media-upload-orphans', '*/5 * * * *',
      'SELECT private.invoke_cleanup_media_upload_orphans();');
  END IF;
END;
$$;

-- One cap shared by SQL, Edge and Azure worker: 4 MiB per image.
-- Existing oversized assets remain available for terminal cleanup.
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_image_size_check
  CHECK (media_type <> 'image' OR size_bytes <= 4194304 OR status IN ('deleting', 'deleted')) NOT VALID;


CREATE OR REPLACE FUNCTION public.begin_media_upload_batch(
  p_idempotency_key TEXT,
  p_finalize_token_hash TEXT,
  p_media_type TEXT,
  p_content_type TEXT,
  p_size_bytes BIGINT,
  p_file_extension TEXT,
  p_playback_duration_ms INTEGER,
  p_thumbnail_b64 TEXT,
  p_recipients JSONB
)
RETURNS TABLE (
  batch_id UUID,
  asset_id UUID,
  storage_path TEXT,
  batch_status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  existing_batch public.media_upload_batches%ROWTYPE;
  new_asset_id UUID;
  new_batch_id UUID;
  new_storage_path TEXT;
  normalized_extension TEXT;
  recipient JSONB;
  recipient_id UUID;
  recipient_count INTEGER;
  recent_count INTEGER;
  requested_duration INTEGER;
  requested_sequence INTEGER;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF p_finalize_token_hash IS NULL OR p_finalize_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_FINALIZE_TOKEN';
  END IF;
  IF p_media_type NOT IN ('image', 'video') THEN
    RAISE EXCEPTION 'INVALID_MEDIA_TYPE';
  END IF;
  IF p_content_type IS NULL OR char_length(p_content_type) > 128 THEN
    RAISE EXCEPTION 'INVALID_CONTENT_TYPE';
  END IF;
  IF (
    p_media_type = 'image'
    AND lower(p_content_type) NOT IN ('image/jpeg', 'image/png', 'image/webp')
  ) OR (
    p_media_type = 'video'
    AND lower(p_content_type) NOT IN ('video/mp4', 'video/quicktime', 'video/x-m4v')
  ) THEN
    RAISE EXCEPTION 'INVALID_CONTENT_TYPE';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 104857600 THEN
    RAISE EXCEPTION 'INVALID_SIZE';
  END IF;
  IF p_media_type = 'image' AND p_size_bytes > 4194304 THEN
    RAISE EXCEPTION 'INVALID_SIZE';
  END IF;
  IF p_thumbnail_b64 IS NOT NULL AND (
    char_length(p_thumbnail_b64) > 70000
    OR p_thumbnail_b64 NOT LIKE 'data:image/jpeg;base64,%'
  ) THEN
    RAISE EXCEPTION 'INVALID_THUMBNAIL';
  END IF;
  IF jsonb_typeof(p_recipients) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_RECIPIENTS';
  END IF;
  recipient_count := jsonb_array_length(p_recipients);
  IF recipient_count < 1 OR recipient_count > 50 THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT_COUNT';
  END IF;

  SELECT *
  INTO existing_batch
  FROM public.media_upload_batches b
  WHERE b.sender_id = actor_id
    AND b.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF existing_batch.status IN ('pending', 'uploading', 'failed') THEN
      UPDATE public.media_upload_batches
      SET finalize_token_hash = p_finalize_token_hash,
          status = 'pending',
          updated_at = NOW(),
          expires_at = NOW() + INTERVAL '7 days'
      WHERE id = existing_batch.id;
    END IF;
    RETURN QUERY
    SELECT b.id, a.id, a.storage_path, b.status, b.expires_at
    FROM public.media_upload_batches b
    JOIN public.media_assets a ON a.id = b.asset_id
    WHERE b.id = existing_batch.id;
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO recent_count
  FROM public.nixes n
  WHERE n.sender_id = actor_id
    AND n.created_at > NOW() - INTERVAL '1 minute';
  IF recent_count + recipient_count > 20 THEN
    RAISE EXCEPTION 'RATE_LIMITED';
  END IF;

  FOR recipient IN SELECT value FROM jsonb_array_elements(p_recipients)
  LOOP
    BEGIN
      recipient_id := (recipient->>'receiverId')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_RECEIVER';
    END;
    IF recipient_id IS NULL OR recipient_id = actor_id THEN
      RAISE EXCEPTION 'INVALID_RECEIVER';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.user_id = actor_id AND f.friend_id = recipient_id)
          OR (f.user_id = recipient_id AND f.friend_id = actor_id)
        )
    ) THEN
      RAISE EXCEPTION 'NOT_FRIEND';
    END IF;
    IF private.is_pair_blocked(actor_id, recipient_id)
      OR private.is_account_restricted(actor_id)
      OR private.is_account_restricted(recipient_id) THEN
      RAISE EXCEPTION 'RECIPIENT_UNAVAILABLE';
    END IF;
  END LOOP;

  normalized_extension := lower(regexp_replace(COALESCE(p_file_extension, ''), '[^a-zA-Z0-9]', '', 'g'));
  IF normalized_extension = '' OR char_length(normalized_extension) > 8 THEN
    normalized_extension := CASE WHEN p_media_type = 'video' THEN 'mp4' ELSE 'jpg' END;
  END IF;

  new_asset_id := gen_random_uuid();
  new_batch_id := gen_random_uuid();
  new_storage_path := 'nixes/' || actor_id::TEXT || '/' || new_asset_id::TEXT || '.' || normalized_extension;

  INSERT INTO public.media_assets (
    id,
    owner_id,
    storage_path,
    media_type,
    content_type,
    size_bytes,
    playback_duration_ms,
    thumbnail_b64,
    status,
    expires_at
  )
  VALUES (
    new_asset_id,
    actor_id,
    new_storage_path,
    p_media_type,
    p_content_type,
    p_size_bytes,
    CASE WHEN p_media_type = 'video' THEN p_playback_duration_ms ELSE NULL END,
    CASE WHEN p_media_type = 'video' THEN p_thumbnail_b64 ELSE NULL END,
    'pending',
    NOW() + INTERVAL '7 days'
  );

  INSERT INTO public.media_upload_batches (
    id,
    sender_id,
    asset_id,
    idempotency_key,
    finalize_token_hash,
    status,
    expires_at
  )
  VALUES (
    new_batch_id,
    actor_id,
    new_asset_id,
    p_idempotency_key,
    p_finalize_token_hash,
    'pending',
    NOW() + INTERVAL '7 days'
  );

  UPDATE public.media_assets
  SET upload_batch_id = new_batch_id
  WHERE id = new_asset_id;

  FOR recipient IN SELECT value FROM jsonb_array_elements(p_recipients)
  LOOP
    recipient_id := (recipient->>'receiverId')::UUID;
    requested_duration := COALESCE((recipient->>'viewDurationSec')::INTEGER, 5);
    requested_sequence := COALESCE((recipient->>'sequenceIndex')::INTEGER, 0);
    IF requested_duration NOT IN (0, 5, 15, 30, 60, 180) THEN
      requested_duration := 5;
    END IF;
    INSERT INTO public.media_upload_recipients (
      batch_id,
      receiver_id,
      view_duration_sec,
      sequence_index
    )
    VALUES (
      new_batch_id,
      recipient_id,
      requested_duration,
      GREATEST(requested_sequence, 0)
    )
    ON CONFLICT ON CONSTRAINT media_upload_recipients_pkey DO NOTHING;
  END LOOP;

  RETURN QUERY
  SELECT new_batch_id, new_asset_id, new_storage_path, 'pending'::TEXT, NOW() + INTERVAL '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_data_export_cleanup(p_job_id UUID, p_error TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_error IS NOT NULL THEN
    UPDATE public.data_export_jobs SET error_code = left(p_error, 100), updated_at = NOW()
    WHERE id = p_job_id AND status IN ('expired', 'failed');
  ELSE
    UPDATE public.data_export_jobs SET storage_path = NULL, updated_at = NOW()
    WHERE id = p_job_id AND status IN ('expired', 'failed');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_data_export_cleanup(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_data_export_cleanup(UUID, TEXT) TO service_role;
