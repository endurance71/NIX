-- Migration: fix_replay_unlimited
-- 1. Poprawka funkcji RPC dla kolejki
CREATE OR REPLACE FUNCTION public.mark_nix_viewed_for_replay(p_nix_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nix public.nixes%ROWTYPE;
BEGIN
  -- 1. Sprawdź, czy nix istnieje i należy do usera
  SELECT * INTO v_nix
  FROM public.nixes
  WHERE id = p_nix_id AND receiver_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nix not found or unauthorized';
  END IF;

  -- 2. Jeśli już viewed, to idempotencja
  IF v_nix.is_viewed = true THEN
    RETURN;
  END IF;

  -- 3. Zaktualizuj nixa
  UPDATE public.nixes
  SET is_viewed = true,
      viewed_at = now(),
      status = 'viewed',
      replay_expires_at = now() + interval '10 minutes'
  WHERE id = p_nix_id;

  -- 4. Zapisz/zaktualizuj wpis w nix_cleanup_queue na deadline
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

CREATE OR REPLACE FUNCTION public.mark_nix_replayed(p_nix_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nix public.nixes%ROWTYPE;
BEGIN
  -- 1. Sprawdź uprawnienia i wczytaj do FOR UPDATE
  SELECT * INTO v_nix
  FROM public.nixes
  WHERE id = p_nix_id AND receiver_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nix not found or unauthorized';
  END IF;

  -- 2. Walidacja stanu (musi być viewed, nie może być już replayed)
  IF v_nix.is_viewed = false THEN
    RAISE EXCEPTION 'Cannot replay an unviewed nix';
  END IF;

  IF v_nix.is_replayed = true THEN
    RAISE EXCEPTION 'Nix already replayed';
  END IF;

  -- 3. Zaktualizuj flage, ALE NIE cleaned_at, bo to robi funkcja cleanup po usunięciu storage
  UPDATE public.nixes
  SET is_replayed = true
  WHERE id = p_nix_id;

  -- 4. Zaktualizuj queue żeby cleanup nastąpił jak najszybciej
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
END;
$$;

-- 2. Naprawa CHECK constraint na nixes (0 oznacza nielimitowany widok)
ALTER TABLE public.nixes
  DROP CONSTRAINT IF EXISTS snaps_view_duration_sec_check,
  DROP CONSTRAINT IF EXISTS nixes_view_duration_sec_check;

ALTER TABLE public.nixes
  ADD CONSTRAINT nixes_view_duration_sec_check
  CHECK (view_duration_sec = ANY (ARRAY[0, 5, 15, 30, 60, 180]));

-- 3. Udzielenie dostępu do nowej funkcji fetch z capture_attempt (jeśli brakuje)
GRANT EXECUTE ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mark_nix_viewed_for_replay(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_nix_viewed_for_replay(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mark_nix_replayed(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_nix_replayed(UUID) FROM PUBLIC, anon;
