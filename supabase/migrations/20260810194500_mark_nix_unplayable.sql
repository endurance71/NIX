-- Mark unplayable unread as cleaned without granting a replay window.
-- Used when viewer cannot load media so dead items do not consume "viewed" UX
-- or block the oldest→newest FIFO queue.

CREATE OR REPLACE FUNCTION public.mark_nix_unplayable(p_nix_id UUID)
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

  -- Already terminal / already acknowledged — idempotent.
  IF v_nix.status IN ('cleaned', 'cleanup_failed') THEN
    RETURN;
  END IF;

  IF v_nix.is_viewed = true AND v_nix.is_replayed = true THEN
    RETURN;
  END IF;

  UPDATE public.nixes
  SET
    is_viewed = true,
    viewed_at = COALESCE(viewed_at, now()),
    status = 'cleaned',
    replay_expires_at = NULL,
    is_replayed = true
  WHERE id = p_nix_id;

  IF v_nix.media_path IS NOT NULL AND length(trim(v_nix.media_path)) > 0 THEN
    INSERT INTO public.nix_cleanup_queue (
      nix_id, receiver_id, media_path, next_attempt_at, created_at, updated_at
    )
    VALUES (
      p_nix_id, v_nix.receiver_id, v_nix.media_path, now(), now(), now()
    )
    ON CONFLICT (nix_id) DO UPDATE
    SET next_attempt_at = EXCLUDED.next_attempt_at,
        updated_at = now(),
        attempt_count = 0,
        last_error = NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_nix_unplayable(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_nix_unplayable(UUID) TO authenticated;
