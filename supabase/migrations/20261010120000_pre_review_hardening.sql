-- Pre-review hardening (2026-10-10).
--
-- 1) Receivers no longer write public.nixes directly. View/replay state moves
--    only through SECURITY DEFINER RPCs, so a modified client cannot reset
--    is_viewed / is_replayed to extend the replay window or skip cleanup.
-- 2) mark_nix_viewed_for_replay is idempotent on the server-owned replay state.
-- 3) nix_cleanup_queue retries stop after 24 hours and are audited as failed.
-- 4) mark_expired_media_uploads expires batches whose pending asset is past
--    its 24 hour upload window and returns a bounded page of deletions.
-- 5) Cancelled or expired upload batches can never be finalized.
-- 6) Moderator removal of reported media removes every recipient's copy.

-- 1) Direct UPDATE of nixes by clients -------------------------------------
DROP POLICY IF EXISTS nixes_update_viewed ON public.nixes;
DROP POLICY IF EXISTS "nixes_update_viewed" ON public.nixes;
REVOKE UPDATE ON TABLE public.nixes FROM anon, authenticated;

-- 2) Viewed-for-replay idempotence ------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_nix_viewed_for_replay(p_nix_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nix public.nixes%ROWTYPE;
BEGIN
  SELECT * INTO v_nix
  FROM public.nixes
  WHERE id = p_nix_id AND receiver_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nix not found or unauthorized';
  END IF;

  -- The replay deadline is set once; any later state is final.
  IF v_nix.is_viewed
    OR v_nix.status <> 'sent'
    OR v_nix.replay_expires_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.nixes
  SET is_viewed = true,
      viewed_at = now(),
      status = 'viewed',
      replay_expires_at = now() + interval '10 minutes'
  WHERE id = p_nix_id;

  INSERT INTO public.nix_cleanup_queue (
    nix_id, receiver_id, media_path, next_attempt_at, created_at, updated_at
  )
  VALUES (
    p_nix_id, v_nix.receiver_id, v_nix.media_path, now() + interval '10 minutes', now(), now()
  )
  ON CONFLICT (nix_id) DO UPDATE
  SET next_attempt_at = EXCLUDED.next_attempt_at,
      updated_at = now(),
      attempt_count = 0,
      last_error = NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_nix_viewed_for_replay(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_nix_viewed_for_replay(UUID) TO authenticated, service_role;

-- 3) Bounded cleanup retries ------------------------------------------------
-- 288 attempts at the 5 minute retry interval = 24 hours.
CREATE OR REPLACE FUNCTION public.finish_nix_cleanup(
  p_nix_id UUID, p_removed BOOLEAN DEFAULT FALSE, p_error TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  n public.nixes%ROWTYPE;
  attempts INTEGER;
BEGIN
  SELECT * INTO n FROM public.nixes WHERE id = p_nix_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_error IS NOT NULL THEN
    INSERT INTO public.nix_cleanup_queue(nix_id, receiver_id, media_path,
      attempt_count, next_attempt_at, last_error)
    VALUES(n.id, n.receiver_id, n.media_path, 1, NOW() + INTERVAL '5 minutes', left(p_error, 500))
    ON CONFLICT(nix_id) DO UPDATE SET receiver_id = EXCLUDED.receiver_id,
      media_path = EXCLUDED.media_path,
      attempt_count = COALESCE(public.nix_cleanup_queue.attempt_count, 0) + 1,
      next_attempt_at = EXCLUDED.next_attempt_at, last_error = EXCLUDED.last_error, updated_at = NOW()
    RETURNING attempt_count INTO attempts;
    IF attempts >= 288 THEN
      DELETE FROM public.nix_cleanup_queue WHERE nix_id = n.id;
      PERFORM public.log_cleanup_audit(n.id, n.receiver_id, n.media_path, 'failed',
        'retries_exhausted: ' || left(p_error, 450));
    END IF;
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

-- 4) Upload expiry aligned with the 24 hour pending asset window -------------
CREATE OR REPLACE FUNCTION public.mark_expired_media_uploads()
RETURNS TABLE(asset_id UUID, storage_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.media_upload_batches b
  SET status = 'expired', updated_at = NOW()
  WHERE b.status NOT IN (
      'completed', 'partially_completed', 'cancelled', 'expired', 'moderation_pending'
    )
    AND (
      b.expires_at <= NOW()
      OR EXISTS (
        SELECT 1
        FROM public.media_assets a
        WHERE a.id = b.asset_id
          AND a.status = 'pending'
          AND a.created_at <= NOW() - INTERVAL '24 hours'
      )
    );

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

  -- Bounded page; the cron picks up the remainder on its next run.
  RETURN QUERY
  SELECT a.id, a.storage_path
  FROM public.media_assets a
  WHERE a.status = 'deleting'
  ORDER BY a.created_at
  LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_expired_media_uploads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_expired_media_uploads() TO service_role;

-- 5) Terminal batches cannot be finalized ----------------------------------
CREATE OR REPLACE FUNCTION private.guard_media_upload_batch_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IN ('cancelled', 'expired')
    AND NEW.status IN ('finalizing', 'completed', 'partially_completed', 'moderation_pending') THEN
    RAISE EXCEPTION 'BATCH_NOT_ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_media_upload_batch_terminal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_media_upload_batch_terminal ON public.media_upload_batches;
CREATE TRIGGER guard_media_upload_batch_terminal
  BEFORE UPDATE OF status ON public.media_upload_batches
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_media_upload_batch_terminal();

-- 6) Moderator removal applies to every copy of shared media -----------------
CREATE OR REPLACE FUNCTION public.moderation_remove_reported_content(p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  report_nix UUID;
  report_text UUID;
  target_asset UUID;
  target_path TEXT;
  target_sender UUID;
  deleted_anything BOOLEAN := FALSE;
BEGIN
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  SELECT r.nix_id, r.text_message_id
    INTO report_nix, report_text
  FROM public.content_reports r
  WHERE r.id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  IF report_nix IS NULL AND report_text IS NULL THEN
    RETURN;
  END IF;

  IF report_text IS NOT NULL THEN
    DELETE FROM public.text_messages tm
    WHERE tm.id = report_text;
    IF FOUND THEN
      deleted_anything := TRUE;
    END IF;
  END IF;

  IF report_nix IS NOT NULL THEN
    SELECT n.asset_id, n.media_path, n.sender_id
      INTO target_asset, target_path, target_sender
    FROM public.nixes n
    WHERE n.id = report_nix;

    IF target_asset IS NOT NULL THEN
      PERFORM 1
      FROM public.media_assets a
      WHERE a.id = target_asset
      FOR UPDATE;

      -- The reported media itself is removed for every recipient.
      DELETE FROM public.nixes n
      WHERE n.asset_id = target_asset;
      IF FOUND THEN
        deleted_anything := TRUE;
      END IF;

      UPDATE public.media_assets a
      SET status = 'deleting'
      WHERE a.id = target_asset
        AND a.status <> 'deleted';
    ELSIF target_path IS NOT NULL THEN
      -- Legacy nix without an asset: remove every reference to the same object.
      DELETE FROM public.nixes n
      WHERE n.media_path = target_path
        AND n.sender_id = target_sender;
      IF FOUND THEN
        deleted_anything := TRUE;
      END IF;
    END IF;
  END IF;

  IF deleted_anything THEN
    INSERT INTO moderation.report_audit(report_id, action, note)
    VALUES (p_report_id, 'content_removed', NULL);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.moderation_remove_reported_content(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_remove_reported_content(UUID) TO service_role;
