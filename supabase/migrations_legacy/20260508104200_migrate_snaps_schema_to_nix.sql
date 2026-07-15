BEGIN;

ALTER TABLE IF EXISTS public.snaps RENAME TO nixes;
ALTER TABLE IF EXISTS public.snap_cleanup_queue RENAME TO nix_cleanup_queue;
ALTER TABLE IF EXISTS public.snap_cleanup_audit RENAME TO nix_cleanup_audit;
ALTER TABLE IF EXISTS public.snap_capture_prefs RENAME TO nix_capture_prefs;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nix_cleanup_queue' AND column_name = 'snap_id'
  ) THEN
    ALTER TABLE public.nix_cleanup_queue RENAME COLUMN snap_id TO nix_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nix_cleanup_audit' AND column_name = 'snap_id'
  ) THEN
    ALTER TABLE public.nix_cleanup_audit RENAME COLUMN snap_id TO nix_id;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.nixes
  ADD COLUMN IF NOT EXISTS playback_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS client_upload_id TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_b64 TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nixes_playback_duration_positive'
  ) THEN
    ALTER TABLE public.nixes
      ADD CONSTRAINT nixes_playback_duration_positive
      CHECK (playback_duration_ms IS NULL OR playback_duration_ms > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nixes_client_upload_id_len'
  ) THEN
    ALTER TABLE public.nixes
      ADD CONSTRAINT nixes_client_upload_id_len
      CHECK (client_upload_id IS NULL OR char_length(client_upload_id) BETWEEN 1 AND 128);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nixes_thumbnail_b64_data_url'
  ) THEN
    ALTER TABLE public.nixes
      ADD CONSTRAINT nixes_thumbnail_b64_data_url
      CHECK (thumbnail_b64 IS NULL OR thumbnail_b64 LIKE 'data:image/%;base64,%');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nixes' AND policyname = 'snaps_select') THEN
    ALTER POLICY snaps_select ON public.nixes RENAME TO nixes_select;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nixes' AND policyname = 'snaps_insert') THEN
    ALTER POLICY snaps_insert ON public.nixes RENAME TO nixes_insert;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nixes' AND policyname = 'snaps_update_viewed') THEN
    ALTER POLICY snaps_update_viewed ON public.nixes RENAME TO nixes_update_viewed;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_send_snap'
  ) THEN
    ALTER FUNCTION public.can_send_snap(UUID, UUID) RENAME TO can_send_nix;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'prevent_snap_payload_update'
  ) THEN
    ALTER FUNCTION public.prevent_snap_payload_update() RENAME TO prevent_nix_payload_update;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.log_cleanup_audit(UUID, UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.log_cleanup_audit(
  p_nix_id UUID,
  p_receiver_id UUID,
  p_media_path TEXT,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.nix_cleanup_audit (nix_id, receiver_id, media_path, status, error_message)
  VALUES (p_nix_id, p_receiver_id, p_media_path, p_status, p_error_message);
$$;
REVOKE ALL ON FUNCTION public.log_cleanup_audit(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_cleanup_audit(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nixes' AND policyname = 'nixes_insert') THEN
    DROP POLICY nixes_insert ON public.nixes;
  END IF;
END $$;

CREATE POLICY nixes_insert
  ON public.nixes FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.can_send_nix(sender_id, receiver_id)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_insert') THEN
    DROP POLICY storage_insert ON storage.objects;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_select') THEN
    DROP POLICY storage_select ON storage.objects;
  END IF;
END $$;

CREATE POLICY storage_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND name LIKE ('nixes/' || auth.uid() || '/%')
  );

CREATE POLICY storage_select
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.nixes s
      WHERE s.media_path = name
        AND (s.sender_id = auth.uid() OR s.receiver_id = auth.uid())
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_nixes_sender_receiver_upload_id_unique
  ON public.nixes(sender_id, receiver_id, client_upload_id)
  WHERE client_upload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nixes_sender_created_at
  ON public.nixes(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nixes_receiver_created_at
  ON public.nixes(receiver_id, created_at DESC);

COMMIT;
