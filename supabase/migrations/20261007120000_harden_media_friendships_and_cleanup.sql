-- Close client write paths that bypass moderation or forge cleanup targets.
-- The text INSERT policy evaluates this private flag as the caller.
GRANT EXECUTE ON FUNCTION private.pre_delivery_moderation_enabled() TO authenticated;
GRANT EXECUTE ON FUNCTION private.text_message_passes_safety_filter(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.text_message_safety_normalized(TEXT) TO authenticated;
DROP POLICY IF EXISTS nixes_insert ON public.nixes;
REVOKE INSERT ON public.nixes FROM anon, authenticated;
-- Undo broad default table grants; these resources are written by RPC/workers.
REVOKE ALL ON public.media_assets, public.media_upload_batches,
  public.media_upload_recipients, public.data_export_jobs FROM anon, authenticated;
GRANT SELECT ON public.media_assets, public.media_upload_batches,
  public.media_upload_recipients, public.data_export_jobs TO authenticated;
DROP POLICY IF EXISTS storage_update ON storage.objects;
DROP POLICY IF EXISTS storage_insert ON storage.objects;
CREATE POLICY storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media-vault'
  AND EXISTS (
    SELECT 1 FROM public.media_assets a
    JOIN public.media_upload_batches b ON b.asset_id = a.id
    WHERE a.storage_path = storage.objects.name
      AND a.owner_id = (SELECT auth.uid()) AND a.status = 'pending'
      AND b.sender_id = (SELECT auth.uid()) AND b.status IN ('pending', 'uploading')
  )
);
CREATE POLICY storage_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'media-vault' AND EXISTS (
  SELECT 1 FROM public.media_assets a JOIN public.media_upload_batches b ON b.asset_id = a.id
  WHERE a.storage_path = storage.objects.name AND a.owner_id = (SELECT auth.uid())
    AND a.status = 'pending' AND b.status IN ('pending', 'uploading')
))
WITH CHECK (bucket_id = 'media-vault' AND EXISTS (
  SELECT 1 FROM public.media_assets a JOIN public.media_upload_batches b ON b.asset_id = a.id
  WHERE a.storage_path = storage.objects.name AND a.owner_id = (SELECT auth.uid())
    AND a.status = 'pending' AND b.status IN ('pending', 'uploading')
));
DROP POLICY IF EXISTS storage_select ON storage.objects;
CREATE POLICY storage_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'media-vault' AND (
  EXISTS (SELECT 1 FROM public.media_assets a WHERE a.storage_path = storage.objects.name
    AND a.owner_id = (SELECT auth.uid()) AND a.status IN ('pending', 'ready'))
  OR EXISTS (SELECT 1 FROM public.nixes n WHERE n.media_path = storage.objects.name
    AND (n.sender_id = (SELECT auth.uid()) OR (n.receiver_id = (SELECT auth.uid())
      AND n.status IN ('sent', 'viewed', 'cleanup_failed')))
    AND NOT private.is_pair_blocked(n.sender_id, n.receiver_id))
));

-- Signed uploads also pass this guard. Lock order matches finalize: batch, asset.
CREATE OR REPLACE FUNCTION private.guard_media_storage_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.media_assets%ROWTYPE; b public.media_upload_batches%ROWTYPE;
BEGIN
  IF NEW.bucket_id <> 'media-vault' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.name IS DISTINCT FROM OLD.name
    OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id) THEN
    RAISE EXCEPTION 'STORAGE_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM public.media_upload_batches WHERE asset_id = (
    SELECT id FROM public.media_assets WHERE storage_path = NEW.name
  ) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UPLOAD_BATCH_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.media_assets WHERE id = b.asset_id FOR UPDATE;
  IF a.status <> 'pending' OR b.status NOT IN ('pending', 'uploading')
    OR b.expires_at <= NOW() THEN RAISE EXCEPTION 'MEDIA_OBJECT_IMMUTABLE' USING ERRCODE = '42501'; END IF;
  IF a.owner_id IS DISTINCT FROM b.sender_id
    OR a.storage_path NOT LIKE ('nixes/' || a.owner_id::TEXT || '/%') THEN
    RAISE EXCEPTION 'ASSET_IDENTITY_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_media_storage_write() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_media_storage_write BEFORE INSERT OR UPDATE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION private.guard_media_storage_write();

CREATE OR REPLACE FUNCTION private.guard_materialized_nix_asset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.media_assets%ROWTYPE;
BEGIN
  IF NEW.asset_id IS NULL THEN
    IF private.pre_delivery_moderation_enabled() THEN RAISE EXCEPTION 'MEDIA_ASSET_REQUIRED'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO a FROM public.media_assets WHERE id = NEW.asset_id;
  IF NOT FOUND OR a.owner_id IS DISTINCT FROM NEW.sender_id
    OR a.storage_path IS DISTINCT FROM NEW.media_path
    OR a.media_type IS DISTINCT FROM NEW.media_type OR a.status IN ('deleting', 'deleted') THEN
    RAISE EXCEPTION 'ASSET_IDENTITY_MISMATCH';
  END IF;
  IF private.pre_delivery_moderation_enabled() AND NOT EXISTS (
    SELECT 1 FROM public.moderation_jobs j WHERE j.asset_id = a.id
      AND j.sender_id = NEW.sender_id AND j.status = 'approved'
  ) THEN RAISE EXCEPTION 'JOB_NOT_APPROVED'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_materialized_nix_asset() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_materialized_nix_asset BEFORE INSERT ON public.nixes
FOR EACH ROW EXECUTE FUNCTION private.guard_materialized_nix_asset();

CREATE OR REPLACE FUNCTION private.guard_nix_media_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
    OR NEW.media_path IS DISTINCT FROM OLD.media_path
    OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
    OR NEW.media_type IS DISTINCT FROM OLD.media_type
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.replay_expires_at IS DISTINCT FROM OLD.replay_expires_at
    OR NEW.status IS DISTINCT FROM OLD.status OR NEW.cleaned_at IS DISTINCT FROM OLD.cleaned_at
  ) THEN RAISE EXCEPTION 'NIX_IDENTITY_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_nix_media_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_nix_media_identity BEFORE UPDATE ON public.nixes
FOR EACH ROW EXECUTE FUNCTION private.guard_nix_media_identity();

DROP POLICY IF EXISTS friendships_insert ON public.friendships;
CREATE POLICY friendships_insert ON public.friendships FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid()) AND user_id <> friend_id AND status = 'pending'
  AND NOT private.is_pair_blocked(user_id, friend_id)
  AND NOT private.is_account_restricted(user_id)
  AND NOT private.is_account_restricted(friend_id)
);
DROP POLICY IF EXISTS friendships_update ON public.friendships;
CREATE POLICY friendships_update ON public.friendships FOR UPDATE TO authenticated
USING (friend_id = (SELECT auth.uid()) AND status = 'pending'
  AND NOT private.is_pair_blocked(user_id, friend_id)
  AND NOT private.is_account_restricted(user_id)
  AND NOT private.is_account_restricted(friend_id))
WITH CHECK (friend_id = (SELECT auth.uid()) AND status = 'accepted'
  AND NOT private.is_pair_blocked(user_id, friend_id)
  AND NOT private.is_account_restricted(user_id)
  AND NOT private.is_account_restricted(friend_id));
CREATE OR REPLACE FUNCTION private.guard_friendship_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.friend_id IS DISTINCT FROM OLD.friend_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'FRIENDSHIP_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_friendship_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_friendship_identity BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION private.guard_friendship_identity();

REVOKE INSERT, UPDATE, DELETE ON public.nix_cleanup_queue FROM anon, authenticated;
DROP POLICY IF EXISTS nix_cleanup_queue_insert ON public.nix_cleanup_queue;
DROP POLICY IF EXISTS nix_cleanup_queue_update ON public.nix_cleanup_queue;
DROP POLICY IF EXISTS nix_cleanup_queue_delete ON public.nix_cleanup_queue;
-- Discard poisoned legacy entries rather than allowing service-role deletion.
DELETE FROM public.nix_cleanup_queue q USING public.nixes n
WHERE q.nix_id = n.id AND (q.receiver_id IS DISTINCT FROM n.receiver_id
  OR q.media_path IS DISTINCT FROM n.media_path);

CREATE OR REPLACE FUNCTION public.request_nix_cleanup(p_nix_id UUID)
RETURNS TABLE(cleanup_requested BOOLEAN, next_attempt_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n public.nixes%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.nixes WHERE id = p_nix_id
    AND receiver_id = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NIX_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF n.status <> 'cleaned' AND (NOT n.is_viewed OR (
    NOT COALESCE(n.is_replayed, FALSE) AND
    (COALESCE(n.replay_expires_at, n.viewed_at + INTERVAL '10 minutes') IS NULL
      OR COALESCE(n.replay_expires_at, n.viewed_at + INTERVAL '10 minutes') > NOW())
  )) THEN RAISE EXCEPTION 'REPLAY_WINDOW_ACTIVE'; END IF;
  INSERT INTO public.nix_cleanup_queue(nix_id, receiver_id, media_path, next_attempt_at)
    VALUES(n.id, n.receiver_id, n.media_path, NOW())
  ON CONFLICT(nix_id) DO UPDATE SET receiver_id = EXCLUDED.receiver_id,
    media_path = EXCLUDED.media_path, next_attempt_at = NOW(), updated_at = NOW();
  RETURN QUERY SELECT TRUE, NOW();
END;
$$;
REVOKE ALL ON FUNCTION public.request_nix_cleanup(UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_nix_cleanup(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_nix_cleanup(p_nix_id UUID)
RETURNS TABLE(asset_id UUID, storage_path TEXT, should_delete BOOLEAN, already_cleaned BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n public.nixes%ROWTYPE; a public.media_assets%ROWTYPE; was_cleaned BOOLEAN;
BEGIN
  SELECT * INTO n FROM public.nixes WHERE id = p_nix_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NIX_NOT_FOUND'; END IF;
  IF n.status <> 'cleaned' AND (NOT n.is_viewed OR (
    NOT COALESCE(n.is_replayed, FALSE) AND
    (COALESCE(n.replay_expires_at, n.viewed_at + INTERVAL '10 minutes') IS NULL
      OR COALESCE(n.replay_expires_at, n.viewed_at + INTERVAL '10 minutes') > NOW())
  )) THEN RAISE EXCEPTION 'REPLAY_WINDOW_ACTIVE'; END IF;
  IF n.media_path NOT LIKE ('nixes/' || n.sender_id::TEXT || '/%')
    OR n.media_path ~ '(^|/)\.\.?(/|$)' OR position(chr(92) IN n.media_path) > 0 THEN
    RAISE EXCEPTION 'INVALID_CANONICAL_MEDIA_PATH';
  END IF;
  IF n.asset_id IS NOT NULL THEN
    SELECT * INTO a FROM public.media_assets WHERE id = n.asset_id FOR UPDATE;
    IF NOT FOUND OR a.owner_id IS DISTINCT FROM n.sender_id
      OR a.storage_path IS DISTINCT FROM n.media_path THEN
      RAISE EXCEPTION 'ASSET_IDENTITY_MISMATCH';
    END IF;
  END IF;
  was_cleaned := n.status = 'cleaned';
  UPDATE public.nixes SET status = 'cleaned', cleaned_at = COALESCE(cleaned_at, NOW())
  WHERE id = n.id;
  -- Count by canonical path too, protecting legacy shared references.
  IF EXISTS (SELECT 1 FROM public.nixes r WHERE r.media_path = n.media_path
    AND r.status IN ('sent', 'viewed', 'cleanup_failed')) THEN
    RETURN QUERY SELECT n.asset_id, n.media_path, FALSE, was_cleaned;
  ELSE
    UPDATE public.media_assets SET status = 'deleting'
      WHERE id = n.asset_id AND status <> 'deleted';
    RETURN QUERY SELECT n.asset_id, n.media_path,
      (n.asset_id IS NULL OR a.status <> 'deleted'), was_cleaned;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_nix_cleanup(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_nix_cleanup(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_nix_cleanup(
  p_nix_id UUID, p_removed BOOLEAN DEFAULT FALSE, p_error TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n public.nixes%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.nixes WHERE id = p_nix_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_error IS NOT NULL THEN
    INSERT INTO public.nix_cleanup_queue(nix_id, receiver_id, media_path,
      attempt_count, next_attempt_at, last_error)
    VALUES(n.id, n.receiver_id, n.media_path, 1, NOW() + INTERVAL '5 minutes', left(p_error, 500))
    ON CONFLICT(nix_id) DO UPDATE SET receiver_id = EXCLUDED.receiver_id,
      media_path = EXCLUDED.media_path, attempt_count = public.nix_cleanup_queue.attempt_count + 1,
      next_attempt_at = EXCLUDED.next_attempt_at, last_error = EXCLUDED.last_error, updated_at = NOW();
    RETURN;
  END IF;
  IF n.status <> 'cleaned' THEN RAISE EXCEPTION 'CLEANUP_NOT_PREPARED'; END IF;
  IF p_removed AND n.asset_id IS NOT NULL THEN
    UPDATE public.media_assets a SET status = 'deleted', deleted_at = NOW()
    WHERE a.id = n.asset_id AND a.status = 'deleting'
      AND NOT EXISTS(SELECT 1 FROM public.nixes r WHERE r.media_path = n.media_path
        AND r.status IN ('sent', 'viewed', 'cleanup_failed'));
  END IF;
  DELETE FROM public.nix_cleanup_queue WHERE nix_id = n.id;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_nix_cleanup(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_nix_cleanup(UUID, BOOLEAN, TEXT) TO service_role;
