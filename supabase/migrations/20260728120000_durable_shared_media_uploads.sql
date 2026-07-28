-- Durable, idempotent media batches. Existing nixes continue to use media_path;
-- asset_id is nullable to keep the migration backwards compatible.

CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 104857600),
  playback_duration_ms INTEGER CHECK (playback_duration_ms IS NULL OR playback_duration_ms > 0),
  thumbnail_b64 TEXT CHECK (
    thumbnail_b64 IS NULL
    OR (
      char_length(thumbnail_b64) <= 70000
      AND thumbnail_b64 LIKE 'data:image/jpeg;base64,%'
    )
  ),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'deleting', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner_status
  ON public.media_assets(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_pending_expiry
  ON public.media_assets(expires_at)
  WHERE status IN ('pending', 'deleting');

CREATE TABLE IF NOT EXISTS public.media_upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL UNIQUE REFERENCES public.media_assets(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  finalize_token_hash TEXT NOT NULL CHECK (char_length(finalize_token_hash) = 64),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'uploading',
      'finalizing',
      'completed',
      'partially_completed',
      'failed',
      'cancelled',
      'expired'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  UNIQUE (sender_id, idempotency_key)
);

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS upload_batch_id UUID UNIQUE
  REFERENCES public.media_upload_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_upload_batches_sender_status
  ON public.media_upload_batches(sender_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_upload_batches_expiry
  ON public.media_upload_batches(expires_at)
  WHERE status NOT IN ('completed', 'partially_completed', 'cancelled', 'expired');

CREATE TABLE IF NOT EXISTS public.media_upload_recipients (
  batch_id UUID NOT NULL REFERENCES public.media_upload_batches(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  view_duration_sec INTEGER NOT NULL DEFAULT 5
    CHECK (view_duration_sec IN (0, 5, 15, 30, 60, 180)),
  sequence_index INTEGER NOT NULL DEFAULT 0 CHECK (sequence_index >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'rejected')),
  error_code TEXT,
  nix_id UUID REFERENCES public.nixes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (batch_id, receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_media_upload_recipients_receiver
  ON public.media_upload_recipients(receiver_id, status, created_at DESC);

ALTER TABLE public.nixes
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nixes_asset_active
  ON public.nixes(asset_id, status)
  WHERE asset_id IS NOT NULL;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_upload_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_assets_select_participant ON public.media_assets;
CREATE POLICY media_assets_select_participant
  ON public.media_assets FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.nixes n
      WHERE n.asset_id = media_assets.id
        AND n.receiver_id = (SELECT auth.uid())
        AND n.status IN ('sent', 'viewed', 'cleanup_failed')
    )
  );

DROP POLICY IF EXISTS media_upload_batches_select_sender ON public.media_upload_batches;
CREATE POLICY media_upload_batches_select_sender
  ON public.media_upload_batches FOR SELECT TO authenticated
  USING (sender_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS media_upload_recipients_select_participant ON public.media_upload_recipients;
CREATE POLICY media_upload_recipients_select_participant
  ON public.media_upload_recipients FOR SELECT TO authenticated
  USING (
    receiver_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.media_upload_batches b
      WHERE b.id = media_upload_recipients.batch_id
        AND b.sender_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.media_assets FROM PUBLIC, anon;
REVOKE ALL ON public.media_upload_batches FROM PUBLIC, anon;
REVOKE ALL ON public.media_upload_recipients FROM PUBLIC, anon;
GRANT SELECT ON public.media_assets TO authenticated;
GRANT SELECT ON public.media_upload_batches TO authenticated;
GRANT SELECT ON public.media_upload_recipients TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
GRANT ALL ON public.media_upload_batches TO service_role;
GRANT ALL ON public.media_upload_recipients TO service_role;

-- A shared object can remain in Storage after one recipient has completed
-- cleanup because other recipients still need it. Do not let the cleaned
-- recipient mint a new signed URL merely because their historical nix row
-- still exists. Senders remain owners; legacy rows without asset_id keep the
-- same sender access semantics.
DROP POLICY IF EXISTS storage_select ON storage.objects;
DROP POLICY IF EXISTS "storage_select" ON storage.objects;
CREATE POLICY storage_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'media-vault'
    AND (
      EXISTS (
        SELECT 1
        FROM public.media_assets a
        WHERE a.storage_path = storage.objects.name
          AND a.owner_id = (SELECT auth.uid())
          AND a.status = 'ready'
      )
      OR EXISTS (
        SELECT 1
        FROM public.nixes n
        WHERE n.media_path = storage.objects.name
          AND (
            n.sender_id = (SELECT auth.uid())
            OR (
              n.receiver_id = (SELECT auth.uid())
              AND n.status IN ('sent', 'viewed', 'cleanup_failed')
            )
          )
          AND NOT private.is_pair_blocked(n.sender_id, n.receiver_id)
      )
    )
  );

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
    RAISE EXCEPTION 'INVALID_MEDIA_SIZE';
  END IF;
  IF p_media_type = 'image' AND p_size_bytes > 10485760 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_SIZE';
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

REVOKE ALL ON FUNCTION public.begin_media_upload_batch(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, TEXT, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_media_upload_batch(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, TEXT, JSONB
) TO authenticated;

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
  recipient public.media_upload_recipients%ROWTYPE;
  created_nix_id UUID;
  total_count INTEGER := 0;
  sent_count INTEGER := 0;
  rejected_count INTEGER := 0;
  final_status TEXT;
  recipient_results JSONB := '[]'::JSONB;
  stored_size_bytes BIGINT;
  stored_content_type TEXT;
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

  IF selected_batch.status IN ('completed', 'partially_completed') THEN
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

REVOKE ALL ON FUNCTION public.finalize_media_upload_batch(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_media_upload_batch(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_media_upload_batch(
  p_batch_id UUID,
  p_sender_id UUID
)
RETURNS TABLE(storage_path TEXT, asset_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_batch public.media_upload_batches%ROWTYPE;
BEGIN
  SELECT *
  INTO selected_batch
  FROM public.media_upload_batches b
  WHERE b.id = p_batch_id
    AND b.sender_id = p_sender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND';
  END IF;
  IF selected_batch.status IN ('completed', 'partially_completed') THEN
    RAISE EXCEPTION 'BATCH_ALREADY_FINALIZED';
  END IF;

  UPDATE public.media_upload_batches
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = selected_batch.id;
  UPDATE public.media_assets
  SET status = 'deleting'
  WHERE id = selected_batch.asset_id;

  RETURN QUERY
  SELECT a.storage_path, a.id
  FROM public.media_assets a
  WHERE a.id = selected_batch.asset_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_media_upload_batch(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_media_upload_batch(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.archive_shared_media_nix(
  p_nix_id UUID,
  p_receiver_id UUID
)
RETURNS TABLE (
  asset_id UUID,
  storage_path TEXT,
  should_delete BOOLEAN,
  already_cleaned BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_nix public.nixes%ROWTYPE;
  selected_asset public.media_assets%ROWTYPE;
  remaining_count INTEGER;
  was_cleaned BOOLEAN;
BEGIN
  SELECT *
  INTO selected_nix
  FROM public.nixes n
  WHERE n.id = p_nix_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NIX_NOT_FOUND';
  END IF;
  IF selected_nix.receiver_id <> p_receiver_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF selected_nix.asset_id IS NULL THEN
    RAISE EXCEPTION 'NOT_SHARED_ASSET';
  END IF;

  SELECT *
  INTO selected_asset
  FROM public.media_assets a
  WHERE a.id = selected_nix.asset_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND';
  END IF;

  was_cleaned := selected_nix.status = 'cleaned';
  IF NOT was_cleaned THEN
    UPDATE public.nixes
    SET is_viewed = TRUE,
        viewed_at = COALESCE(viewed_at, NOW()),
        status = 'cleaned',
        cleaned_at = COALESCE(cleaned_at, NOW())
    WHERE id = selected_nix.id;
  END IF;

  SELECT COUNT(*)
  INTO remaining_count
  FROM public.nixes n
  WHERE n.asset_id = selected_asset.id
    AND n.status IN ('sent', 'viewed', 'cleanup_failed');

  IF remaining_count = 0 AND selected_asset.status <> 'deleted' THEN
    UPDATE public.media_assets
    SET status = 'deleting'
    WHERE id = selected_asset.id;
  END IF;

  RETURN QUERY
  SELECT
    selected_asset.id,
    selected_asset.storage_path,
    remaining_count = 0 AND selected_asset.status <> 'deleted',
    was_cleaned;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_shared_media_nix(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_shared_media_nix(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.archive_blocked_shared_media(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS TABLE(asset_id UUID, storage_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_asset_ids UUID[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT n.asset_id), ARRAY[]::UUID[])
  INTO affected_asset_ids
  FROM public.nixes n
  WHERE n.asset_id IS NOT NULL
    AND (
      (n.sender_id = p_user_a AND n.receiver_id = p_user_b)
      OR (n.sender_id = p_user_b AND n.receiver_id = p_user_a)
    );

  -- Serialize against recipient cleanup and finalization for every affected
  -- asset before removing this pair's references.
  PERFORM 1
  FROM public.media_assets a
  WHERE a.id = ANY(affected_asset_ids)
  ORDER BY a.id
  FOR UPDATE;

  DELETE FROM public.nixes n
  WHERE n.asset_id IS NOT NULL
    AND (
      (n.sender_id = p_user_a AND n.receiver_id = p_user_b)
      OR (n.sender_id = p_user_b AND n.receiver_id = p_user_a)
    );

  UPDATE public.media_assets a
  SET status = 'deleting'
  WHERE a.id = ANY(affected_asset_ids)
    AND a.status <> 'deleted'
    AND NOT EXISTS (
      SELECT 1
      FROM public.nixes n
      WHERE n.asset_id = a.id
        AND n.status IN ('sent', 'viewed', 'cleanup_failed')
    );

  RETURN QUERY
  SELECT a.id, a.storage_path
  FROM public.media_assets a
  WHERE a.id = ANY(affected_asset_ids)
    AND a.status = 'deleting'
    AND NOT EXISTS (
      SELECT 1
      FROM public.nixes n
      WHERE n.asset_id = a.id
        AND n.status IN ('sent', 'viewed', 'cleanup_failed')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_blocked_shared_media(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_blocked_shared_media(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_expired_media_uploads()
RETURNS TABLE(asset_id UUID, storage_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.media_upload_batches b
  SET status = 'expired', updated_at = NOW()
  WHERE b.expires_at <= NOW()
    AND b.status NOT IN ('completed', 'partially_completed', 'cancelled', 'expired');

  UPDATE public.media_assets a
  SET status = 'deleting'
  WHERE (
      a.status = 'pending'
      AND a.created_at <= NOW() - INTERVAL '24 hours'
    )
    OR (
      a.status = 'ready'
      AND NOT EXISTS (
        SELECT 1
        FROM public.nixes n
        WHERE n.asset_id = a.id
          AND n.status IN ('sent', 'viewed', 'cleanup_failed')
      )
    );

  RETURN QUERY
  SELECT a.id, a.storage_path
  FROM public.media_assets a
  WHERE a.status = 'deleting';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_expired_media_uploads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_expired_media_uploads() TO service_role;
