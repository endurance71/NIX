-- Privacy retention fixes found while writing the 2026-10-12 privacy policy.
--
-- 1. A video NiX's poster (`thumbnail_b64`) is deleted together with its media: when the NiX is
--    cleaned up and when its shared asset is released. Existing cleaned rows are backfilled.
-- 2. An unopened NiX expires 30 days after sending: a daily job queues it for the regular
--    cleanup (the `cleanup-nix-due` worker deletes the file), and `prepare_nix_cleanup` accepts it.
-- 3. Signing out deletes the device's push registration (token included) instead of only
--    disabling it. Turning notifications off in the app still keeps the row, disabled, so the
--    preference survives.
-- 4. Technical logs are pruned daily:
--    - upload logs and NiX-cleanup audit after 30 days;
--    - finished moderation jobs after 30 days (rejected ones after 90);
--    - app installations unseen for 180 days.
-- 5. Blocking someone unsaves the pair's saved messages, so they expire within 24 hours, like
--    any unsaved message, instead of staying hidden indefinitely.

-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- 1. Posters die with the media ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.clear_thumbnail()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.thumbnail_b64 := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.clear_thumbnail() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clear_thumbnail_on_cleanup ON public.nixes;
CREATE TRIGGER clear_thumbnail_on_cleanup
BEFORE UPDATE OF status ON public.nixes
FOR EACH ROW
WHEN (NEW.status = 'cleaned' AND NEW.thumbnail_b64 IS NOT NULL)
EXECUTE FUNCTION private.clear_thumbnail();

DROP TRIGGER IF EXISTS clear_thumbnail_on_release ON public.media_assets;
CREATE TRIGGER clear_thumbnail_on_release
BEFORE UPDATE OF status ON public.media_assets
FOR EACH ROW
WHEN (NEW.status IN ('deleting', 'deleted') AND NEW.thumbnail_b64 IS NOT NULL)
EXECUTE FUNCTION private.clear_thumbnail();

UPDATE public.nixes SET thumbnail_b64 = NULL
WHERE status = 'cleaned' AND thumbnail_b64 IS NOT NULL;

UPDATE public.media_assets SET thumbnail_b64 = NULL
WHERE status IN ('deleting', 'deleted') AND thumbnail_b64 IS NOT NULL;

-- 2. Unopened NiXes expire after 30 days -------------------------------------------------------

-- Same as 20261007120000 apart from the replay-window guard, which no longer holds back a NiX
-- older than 30 days (unopened ones included).
CREATE OR REPLACE FUNCTION public.prepare_nix_cleanup(p_nix_id UUID)
RETURNS TABLE(asset_id UUID, storage_path TEXT, should_delete BOOLEAN, already_cleaned BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n public.nixes%ROWTYPE; a public.media_assets%ROWTYPE; was_cleaned BOOLEAN;
BEGIN
  SELECT * INTO n FROM public.nixes WHERE id = p_nix_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NIX_NOT_FOUND'; END IF;
  IF n.status <> 'cleaned' AND n.created_at > NOW() - INTERVAL '30 days' AND (NOT n.is_viewed OR (
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

-- Queues NiXes nobody opened within 30 days for the regular cleanup worker.
CREATE OR REPLACE FUNCTION private.enqueue_expired_unopened_nixes()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE queued INTEGER;
BEGIN
  INSERT INTO public.nix_cleanup_queue (
    nix_id, receiver_id, media_path, next_attempt_at, created_at, updated_at
  )
  SELECT n.id, n.receiver_id, n.media_path, now(), now(), now()
  FROM public.nixes n
  WHERE n.status = 'sent'
    AND NOT COALESCE(n.is_viewed, FALSE)
    AND n.created_at <= now() - INTERVAL '30 days'
  ON CONFLICT (nix_id) DO NOTHING;
  GET DIAGNOSTICS queued = ROW_COUNT;
  RETURN queued;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_expired_unopened_nixes() FROM PUBLIC, anon, authenticated;

-- 3. Signing out deletes the push registration -------------------------------------------------

CREATE OR REPLACE FUNCTION public.disable_push_device(p_installation_id UUID, p_reason TEXT DEFAULT 'user_disabled')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_reason = 'signed_out' THEN
    -- The token (and its delivery history, by cascade) leaves with the account on this device.
    DELETE FROM public.push_devices
    WHERE installation_id = p_installation_id AND user_id = auth.uid();
    RETURN;
  END IF;
  UPDATE public.push_devices
  SET enabled = FALSE,
      disabled_reason = left(COALESCE(NULLIF(trim(p_reason), ''), 'user_disabled'), 80),
      updated_at = now()
  WHERE installation_id = p_installation_id AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.disable_push_device(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_push_device(UUID, TEXT) TO authenticated, service_role;

-- 4. Technical logs are pruned -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.prune_technical_logs()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.upload_logs WHERE created_at < now() - INTERVAL '30 days';
  DELETE FROM public.nix_cleanup_audit WHERE created_at < now() - INTERVAL '30 days';
  DELETE FROM public.moderation_jobs
  WHERE status IN ('approved', 'error')
    AND COALESCE(completed_at, updated_at) < now() - INTERVAL '30 days';
  DELETE FROM public.moderation_jobs
  WHERE status = 'rejected'
    AND COALESCE(completed_at, updated_at) < now() - INTERVAL '90 days';
  DELETE FROM public.app_installations WHERE last_seen_at < now() - INTERVAL '180 days';
END;
$$;

REVOKE ALL ON FUNCTION private.prune_technical_logs() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
      WHERE jobname IN ('expire-unopened-nixes', 'prune-technical-logs');
    PERFORM cron.schedule('expire-unopened-nixes', '50 3 * * *',
      'SELECT private.enqueue_expired_unopened_nixes();');
    PERFORM cron.schedule('prune-technical-logs', '55 3 * * *',
      'SELECT private.prune_technical_logs();');
  END IF;
END;
$$;

-- 5. Blocking unsaves the pair's messages ------------------------------------------------------

CREATE OR REPLACE FUNCTION private.expire_saved_texts_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.text_messages tm
  SET saved_at = NULL,
      saved_by = NULL,
      expires_at = LEAST(tm.expires_at, now() + INTERVAL '24 hours')
  WHERE tm.saved_at IS NOT NULL
    AND (
      (tm.sender_id = NEW.blocker_id AND tm.receiver_id = NEW.blocked_id)
      OR (tm.sender_id = NEW.blocked_id AND tm.receiver_id = NEW.blocker_id)
    );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.expire_saved_texts_on_block() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS expire_saved_texts_on_block ON public.user_blocks;
CREATE TRIGGER expire_saved_texts_on_block
AFTER INSERT ON public.user_blocks
FOR EACH ROW
EXECUTE FUNCTION private.expire_saved_texts_on_block();
