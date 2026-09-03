-- P0-3 expand: moderation queue, quarantined payloads, worker RPCs.
-- Contract (client text INSERT revoke) ships in 20260831140000_pre_delivery_moderation_contract.sql.

ALTER TABLE public.media_upload_batches
  DROP CONSTRAINT IF EXISTS media_upload_batches_status_check;
ALTER TABLE public.media_upload_batches
  ADD CONSTRAINT media_upload_batches_status_check
  CHECK (status IN (
    'pending',
    'uploading',
    'finalizing',
    'moderation_pending',
    'completed',
    'partially_completed',
    'failed',
    'cancelled',
    'expired'
  ));

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_status_check;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_status_check
  CHECK (status IN ('pending', 'moderation_pending', 'ready', 'deleting', 'deleted'));

ALTER TABLE private.safety_policy_config
  ADD COLUMN IF NOT EXISTS pre_delivery_moderation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN private.safety_policy_config.pre_delivery_moderation_enabled IS
  'When true, media/text delivery requires moderation_jobs.approved. Fail-closed when worker/provider unavailable.';

CREATE TABLE IF NOT EXISTS public.moderation_text_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

ALTER TABLE public.moderation_text_payloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_text_payloads FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.moderation_text_payloads TO service_role;

CREATE TYPE public.moderation_content_kind AS ENUM ('text', 'media');
CREATE TYPE public.moderation_job_status AS ENUM (
  'pending',
  'processing',
  'approved',
  'rejected',
  'error'
);

CREATE TABLE IF NOT EXISTS public.moderation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_kind public.moderation_content_kind NOT NULL,
  batch_id UUID REFERENCES public.media_upload_batches(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
  text_payload_id UUID REFERENCES public.moderation_text_payloads(id) ON DELETE SET NULL,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_message_id TEXT,
  status public.moderation_job_status NOT NULL DEFAULT 'pending',
  decision TEXT,
  policy_version TEXT,
  max_severity INTEGER,
  provider_operation_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT moderation_jobs_target_chk CHECK (
    (content_kind = 'media' AND batch_id IS NOT NULL AND asset_id IS NOT NULL)
    OR (content_kind = 'text' AND text_payload_id IS NOT NULL AND receiver_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_jobs_active_asset_uidx
  ON public.moderation_jobs(asset_id)
  WHERE asset_id IS NOT NULL AND status IN ('pending', 'processing');

CREATE UNIQUE INDEX IF NOT EXISTS moderation_jobs_text_client_uidx
  ON public.moderation_jobs(sender_id, receiver_id, client_message_id)
  WHERE content_kind = 'text' AND client_message_id IS NOT NULL
    AND status IN ('pending', 'processing', 'approved');

CREATE INDEX IF NOT EXISTS moderation_jobs_claim_idx
  ON public.moderation_jobs(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.moderation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.moderation_jobs TO service_role;

CREATE OR REPLACE FUNCTION private.pre_delivery_moderation_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private
AS $$
  SELECT COALESCE(
    (SELECT cfg.pre_delivery_moderation_enabled FROM private.safety_policy_config cfg WHERE cfg.singleton),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION private.pre_delivery_moderation_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.pre_delivery_moderation_enabled() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_moderation_jobs(
  p_limit INTEGER DEFAULT 5,
  p_lease_owner TEXT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS SETOF public.moderation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lease_owner IS NULL OR length(trim(p_lease_owner)) = 0 THEN
    RAISE EXCEPTION 'LEASE_OWNER_REQUIRED';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'INVALID_LIMIT';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.moderation_jobs j
    WHERE (
      j.status = 'pending'
      AND j.next_attempt_at <= NOW()
    ) OR (
      j.status = 'processing'
      AND j.lease_expires_at IS NOT NULL
      AND j.lease_expires_at <= NOW()
    )
    ORDER BY j.next_attempt_at, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  claimed AS (
    UPDATE public.moderation_jobs j
    SET status = 'processing',
        lease_owner = p_lease_owner,
        lease_expires_at = NOW() + make_interval(secs => p_lease_seconds),
        attempt_count = j.attempt_count + 1,
        updated_at = NOW()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.*
  )
  SELECT * FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_moderation_job(
  p_job_id UUID,
  p_lease_owner TEXT,
  p_status public.moderation_job_status,
  p_decision TEXT DEFAULT NULL,
  p_policy_version TEXT DEFAULT NULL,
  p_max_severity INTEGER DEFAULT NULL,
  p_provider_operation_id TEXT DEFAULT NULL,
  p_last_error TEXT DEFAULT NULL,
  p_retry_delay_seconds INTEGER DEFAULT NULL
)
RETURNS public.moderation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected public.moderation_jobs%ROWTYPE;
BEGIN
  SELECT *
  INTO selected
  FROM public.moderation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;
  IF selected.lease_owner IS DISTINCT FROM p_lease_owner THEN
    RAISE EXCEPTION 'LEASE_MISMATCH';
  END IF;
  IF selected.status NOT IN ('processing', 'pending') THEN
    RAISE EXCEPTION 'JOB_NOT_CLAIMABLE';
  END IF;
  IF p_status NOT IN ('approved', 'rejected', 'error', 'pending') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  UPDATE public.moderation_jobs
  SET status = p_status,
      decision = p_decision,
      policy_version = p_policy_version,
      max_severity = p_max_severity,
      provider_operation_id = p_provider_operation_id,
      last_error = p_last_error,
      lease_owner = NULL,
      lease_expires_at = NULL,
      next_attempt_at = CASE
        WHEN p_status = 'pending' AND p_retry_delay_seconds IS NOT NULL
          THEN NOW() + make_interval(secs => p_retry_delay_seconds)
        ELSE next_attempt_at
      END,
      completed_at = CASE
        WHEN p_status IN ('approved', 'rejected', 'error') THEN NOW()
        ELSE completed_at
      END,
      updated_at = NOW()
  WHERE id = p_job_id
  RETURNING * INTO selected;

  RETURN selected;
END;
$$;

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
      selected_batch.created_at + (recipient.sequence_index * INTERVAL '1 millisecond')
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

  DELETE FROM public.moderation_text_payloads
  WHERE id = selected_job.text_payload_id;

  RETURN inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_text_moderation_job(
  p_sender_id UUID,
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
  payload_id UUID;
  job_id UUID;
  existing public.moderation_jobs%ROWTYPE;
BEGIN
  IF NOT private.pre_delivery_moderation_enabled() THEN
    RAISE EXCEPTION 'MODERATION_DISABLED';
  END IF;
  IF NOT public.can_send_text_message(p_sender_id, p_receiver_id) THEN
    RAISE EXCEPTION 'NOT_FRIEND';
  END IF;
  IF NOT private.text_message_passes_safety_filter(p_body) THEN
    RAISE EXCEPTION 'CONTENT_NOT_ALLOWED';
  END IF;

  IF p_client_message_id IS NOT NULL THEN
    SELECT *
    INTO existing
    FROM public.moderation_jobs
    WHERE sender_id = p_sender_id
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
    p_sender_id,
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

CREATE OR REPLACE FUNCTION public.cleanup_expired_moderation_quarantine()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_payloads INTEGER := 0;
  deleted_jobs INTEGER := 0;
BEGIN
  DELETE FROM public.moderation_text_payloads
  WHERE expires_at <= NOW();
  GET DIAGNOSTICS deleted_payloads = ROW_COUNT;

  UPDATE public.moderation_jobs j
  SET status = 'error',
      decision = 'error',
      last_error = 'quarantine_ttl_expired',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE j.status IN ('pending', 'processing')
    AND j.created_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS deleted_jobs = ROW_COUNT;
  RETURN deleted_payloads + deleted_jobs;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_moderation_jobs(INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_moderation_job(UUID, TEXT, public.moderation_job_status, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materialize_approved_media_batch(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materialize_approved_text_message(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_text_moderation_job(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_moderation_quarantine() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_moderation_jobs(INTEGER, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_moderation_job(UUID, TEXT, public.moderation_job_status, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.materialize_approved_media_batch(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.materialize_approved_text_message(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_text_moderation_job(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_moderation_quarantine() TO service_role;

CREATE OR REPLACE FUNCTION private.finalize_media_upload_batch_legacy(
  p_batch_id UUID
)
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
      selected_batch.created_at + (recipient.sequence_index * INTERVAL '1 millisecond')
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
    SET status = 'moderation_pending', updated_at = NOW()
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
