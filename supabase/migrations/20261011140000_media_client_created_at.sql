-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- SEND-8 (backend): the delivered nix keeps the time the sender created it on
-- the device instead of the time `begin` ran, which is after compression. A
-- text sent while a video was still compressing therefore no longer jumps
-- ahead of that video in the chat.
--
-- 1) media_upload_batches.client_created_at (nullable). begin_media_upload_batch
--    takes an optional p_client_created_at and clamps it to
--    [NOW() - 15 minutes, NOW()]. NULL (older clients, older Edge) keeps the
--    exact previous behaviour.
-- 2) The media rate limit also counts client-dated nixes by their server begin
--    time, so backdating cannot move them out of the one-minute window.
-- 3) materialize_approved_media_batch and the moderation-off path
--    private.finalize_media_upload_batch_legacy stamp nixes.created_at with
--    COALESCE(client_created_at, created_at) + sequence_index ms. Nothing else
--    in either function changes.

-- 1) Column ------------------------------------------------------------------
ALTER TABLE public.media_upload_batches
  ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ;

COMMENT ON COLUMN public.media_upload_batches.client_created_at IS
  'Device creation time of the send, clamped by begin_media_upload_batch to [created_at - 15 min, created_at]. NULL for older clients.';

ALTER TABLE public.media_upload_batches
  DROP CONSTRAINT IF EXISTS media_upload_batches_client_created_at_window;
ALTER TABLE public.media_upload_batches
  ADD CONSTRAINT media_upload_batches_client_created_at_window CHECK (
    client_created_at IS NULL
    OR (
      client_created_at <= created_at
      AND client_created_at >= created_at - INTERVAL '15 minutes'
    )
  );

-- Supports the rate-limit lookup below; only client-dated batches are indexed.
CREATE INDEX IF NOT EXISTS idx_media_upload_batches_sender_client_dated
  ON public.media_upload_batches (sender_id, created_at DESC)
  WHERE client_created_at IS NOT NULL;

-- 2) begin_media_upload_batch -------------------------------------------------
-- The signature gains a defaulted argument. Drop the nine-argument version so
-- PostgREST never sees two candidates for the same named-argument call; the
-- Edge Function that is live during the rollout keeps calling it with nine
-- named arguments and resolves to the new function.
DROP FUNCTION IF EXISTS public.begin_media_upload_batch(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, TEXT, JSONB
);

CREATE FUNCTION public.begin_media_upload_batch(
  p_idempotency_key TEXT,
  p_finalize_token_hash TEXT,
  p_media_type TEXT,
  p_content_type TEXT,
  p_size_bytes BIGINT,
  p_file_extension TEXT,
  p_playback_duration_ms INTEGER,
  p_thumbnail_b64 TEXT,
  p_recipients JSONB,
  p_client_created_at TIMESTAMPTZ DEFAULT NULL
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
  clamped_client_created_at TIMESTAMPTZ;
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
  -- A client-dated nix can sit before the one-minute window although its batch
  -- began inside it. Count those by the server begin time so a backdated
  -- client_created_at cannot skip the limit. Batches without a client time
  -- (older clients) add nothing here, so their behaviour is unchanged.
  SELECT recent_count + COUNT(*)::INTEGER
  INTO recent_count
  FROM public.media_upload_batches b
  JOIN public.media_upload_recipients r ON r.batch_id = b.id
  JOIN public.nixes n ON n.id = r.nix_id
  WHERE b.sender_id = actor_id
    AND b.client_created_at IS NOT NULL
    AND b.created_at > NOW() - INTERVAL '1 minute'
    AND n.created_at <= NOW() - INTERVAL '1 minute';
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

  -- GREATEST/LEAST skip NULLs, so keep NULL explicit for older clients.
  clamped_client_created_at := CASE
    WHEN p_client_created_at IS NULL THEN NULL
    ELSE LEAST(GREATEST(p_client_created_at, NOW() - INTERVAL '15 minutes'), NOW())
  END;

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
    expires_at,
    client_created_at
  )
  VALUES (
    new_batch_id,
    actor_id,
    new_asset_id,
    p_idempotency_key,
    p_finalize_token_hash,
    'pending',
    NOW() + INTERVAL '7 days',
    clamped_client_created_at
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

REVOKE ALL ON FUNCTION public.begin_media_upload_batch(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, TEXT, JSONB, TIMESTAMPTZ
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_media_upload_batch(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, TEXT, JSONB, TIMESTAMPTZ
) TO authenticated, service_role;

-- 3) Materialization (moderation on) -------------------------------------------
CREATE OR REPLACE FUNCTION public.materialize_approved_media_batch(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_job public.moderation_jobs%ROWTYPE;
  selected_batch public.media_upload_batches%ROWTYPE;
  selected_asset public.media_assets%ROWTYPE;
  recipient public.media_upload_recipients%ROWTYPE;
  created_nix_id UUID;
  total_count INTEGER := 0;
  sent_count INTEGER := 0;
  rejected_count INTEGER := 0;
  final_status TEXT;
  recipient_results JSONB := '[]'::JSONB;
BEGIN
  SELECT *
  INTO selected_job
  FROM public.moderation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND OR selected_job.content_kind <> 'media' THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;
  IF selected_job.status <> 'approved' THEN
    RAISE EXCEPTION 'JOB_NOT_APPROVED';
  END IF;

  SELECT *
  INTO selected_batch
  FROM public.media_upload_batches
  WHERE id = selected_job.batch_id
  FOR UPDATE;

  SELECT *
  INTO selected_asset
  FROM public.media_assets
  WHERE id = selected_job.asset_id
  FOR UPDATE;

  IF selected_batch.status IN ('completed', 'partially_completed') THEN
    RETURN jsonb_build_object(
      'batchId', selected_batch.id,
      'assetId', selected_batch.asset_id,
      'status', selected_batch.status,
      'alreadyMaterialized', TRUE
    );
  END IF;

  FOR recipient IN
    SELECT *
    FROM public.media_upload_recipients r
    WHERE r.batch_id = selected_batch.id
    ORDER BY r.created_at
    FOR UPDATE
  LOOP
    total_count := total_count + 1;

    IF NOT EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.user_id = selected_batch.sender_id AND f.friend_id = recipient.receiver_id)
          OR (f.user_id = recipient.receiver_id AND f.friend_id = selected_batch.sender_id)
        )
    ) OR private.is_pair_blocked(selected_batch.sender_id, recipient.receiver_id)
      OR private.is_account_restricted(selected_batch.sender_id)
      OR private.is_account_restricted(recipient.receiver_id) THEN
      rejected_count := rejected_count + 1;
      UPDATE public.media_upload_recipients
      SET status = 'rejected',
          error_code = 'RECIPIENT_UNAVAILABLE',
          updated_at = NOW()
      WHERE batch_id = selected_batch.id
        AND receiver_id = recipient.receiver_id;
      recipient_results := recipient_results || jsonb_build_array(jsonb_build_object(
        'receiverId', recipient.receiver_id,
        'status', 'rejected',
        'errorCode', 'RECIPIENT_UNAVAILABLE'
      ));
      CONTINUE;
    END IF;

    INSERT INTO public.nixes (
      sender_id,
      receiver_id,
      media_path,
      media_type,
      view_duration_sec,
      playback_duration_ms,
      client_upload_id,
      thumbnail_b64,
      asset_id,
      status,
      created_at
    )
    VALUES (
      selected_batch.sender_id,
      recipient.receiver_id,
      selected_asset.storage_path,
      selected_asset.media_type,
      recipient.view_duration_sec,
      selected_asset.playback_duration_ms,
      selected_batch.id::TEXT,
      selected_asset.thumbnail_b64,
      selected_asset.id,
      'sent',
      COALESCE(selected_batch.client_created_at, selected_batch.created_at)
        + (recipient.sequence_index * INTERVAL '1 millisecond')
    )
    ON CONFLICT (sender_id, receiver_id, client_upload_id)
    DO UPDATE SET asset_id = EXCLUDED.asset_id
    RETURNING id INTO created_nix_id;

    sent_count := sent_count + 1;
    UPDATE public.media_upload_recipients
    SET status = 'sent',
        nix_id = created_nix_id,
        error_code = NULL,
        updated_at = NOW()
    WHERE batch_id = selected_batch.id
      AND receiver_id = recipient.receiver_id;
    recipient_results := recipient_results || jsonb_build_array(jsonb_build_object(
      'receiverId', recipient.receiver_id,
      'status', 'sent',
      'nixId', created_nix_id
    ));
  END LOOP;

  final_status := CASE
    WHEN sent_count = total_count THEN 'completed'
    WHEN sent_count > 0 THEN 'partially_completed'
    ELSE 'failed'
  END;

  UPDATE public.media_assets
  SET status = CASE WHEN sent_count > 0 THEN 'ready' ELSE 'deleting' END,
      ready_at = CASE WHEN sent_count > 0 THEN NOW() ELSE NULL END
  WHERE id = selected_asset.id;

  UPDATE public.media_upload_batches
  SET status = final_status,
      finalized_at = NOW(),
      updated_at = NOW()
  WHERE id = selected_batch.id;

  RETURN jsonb_build_object(
    'batchId', selected_batch.id,
    'assetId', selected_asset.id,
    'status', final_status,
    'sentCount', sent_count,
    'rejectedCount', rejected_count,
    'recipients', recipient_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_approved_media_batch(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_approved_media_batch(UUID) TO service_role;

-- 3) Materialization (moderation off) ------------------------------------------
CREATE OR REPLACE FUNCTION private.finalize_media_upload_batch_legacy(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_batch public.media_upload_batches%ROWTYPE;
  selected_asset public.media_assets%ROWTYPE;
  recipient public.media_upload_recipients%ROWTYPE;
  created_nix_id UUID;
  total_count INTEGER := 0;
  sent_count INTEGER := 0;
  rejected_count INTEGER := 0;
  final_status TEXT;
  recipient_results JSONB := '[]'::JSONB;
BEGIN
  SELECT *
  INTO selected_batch
  FROM public.media_upload_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  SELECT *
  INTO selected_asset
  FROM public.media_assets
  WHERE id = selected_batch.asset_id
  FOR UPDATE;

  UPDATE public.media_upload_batches
  SET status = 'finalizing', updated_at = NOW()
  WHERE id = selected_batch.id;

  FOR recipient IN
    SELECT *
    FROM public.media_upload_recipients r
    WHERE r.batch_id = selected_batch.id
    ORDER BY r.created_at
    FOR UPDATE
  LOOP
    total_count := total_count + 1;

    IF NOT EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.user_id = selected_batch.sender_id AND f.friend_id = recipient.receiver_id)
          OR (f.user_id = recipient.receiver_id AND f.friend_id = selected_batch.sender_id)
        )
    ) OR private.is_pair_blocked(selected_batch.sender_id, recipient.receiver_id)
      OR private.is_account_restricted(selected_batch.sender_id)
      OR private.is_account_restricted(recipient.receiver_id) THEN
      rejected_count := rejected_count + 1;
      UPDATE public.media_upload_recipients
      SET status = 'rejected',
          error_code = 'RECIPIENT_UNAVAILABLE',
          updated_at = NOW()
      WHERE batch_id = selected_batch.id
        AND receiver_id = recipient.receiver_id;
      recipient_results := recipient_results || jsonb_build_array(jsonb_build_object(
        'receiverId', recipient.receiver_id,
        'status', 'rejected',
        'errorCode', 'RECIPIENT_UNAVAILABLE'
      ));
      CONTINUE;
    END IF;

    INSERT INTO public.nixes (
      sender_id,
      receiver_id,
      media_path,
      media_type,
      view_duration_sec,
      playback_duration_ms,
      client_upload_id,
      thumbnail_b64,
      asset_id,
      status,
      created_at
    )
    VALUES (
      selected_batch.sender_id,
      recipient.receiver_id,
      selected_asset.storage_path,
      selected_asset.media_type,
      recipient.view_duration_sec,
      selected_asset.playback_duration_ms,
      selected_batch.id::TEXT,
      selected_asset.thumbnail_b64,
      selected_asset.id,
      'sent',
      COALESCE(selected_batch.client_created_at, selected_batch.created_at)
        + (recipient.sequence_index * INTERVAL '1 millisecond')
    )
    ON CONFLICT (sender_id, receiver_id, client_upload_id)
    DO UPDATE SET asset_id = EXCLUDED.asset_id
    RETURNING id INTO created_nix_id;

    sent_count := sent_count + 1;
    UPDATE public.media_upload_recipients
    SET status = 'sent',
        nix_id = created_nix_id,
        error_code = NULL,
        updated_at = NOW()
    WHERE batch_id = selected_batch.id
      AND receiver_id = recipient.receiver_id;
    recipient_results := recipient_results || jsonb_build_array(jsonb_build_object(
      'receiverId', recipient.receiver_id,
      'status', 'sent',
      'nixId', created_nix_id
    ));
  END LOOP;

  final_status := CASE
    WHEN sent_count = total_count THEN 'completed'
    WHEN sent_count > 0 THEN 'partially_completed'
    ELSE 'failed'
  END;

  UPDATE public.media_assets
  SET status = CASE WHEN sent_count > 0 THEN 'ready' ELSE 'deleting' END,
      ready_at = CASE WHEN sent_count > 0 THEN NOW() ELSE NULL END
  WHERE id = selected_asset.id;

  UPDATE public.media_upload_batches
  SET status = final_status,
      finalized_at = NOW(),
      updated_at = NOW()
  WHERE id = selected_batch.id;

  RETURN jsonb_build_object(
    'batchId', selected_batch.id,
    'assetId', selected_asset.id,
    'status', final_status,
    'sentCount', sent_count,
    'rejectedCount', rejected_count,
    'recipients', recipient_results
  );
END;
$$;

REVOKE ALL ON FUNCTION private.finalize_media_upload_batch_legacy(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.finalize_media_upload_batch_legacy(UUID) TO service_role;
