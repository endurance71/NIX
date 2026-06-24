BEGIN;

-- ============================================================
-- A) Reset danych operacyjnych (zachowaj auth.users + profiles + avatars)
-- ============================================================

TRUNCATE public.nix_cleanup_queue;
TRUNCATE public.nix_cleanup_audit;
DELETE FROM public.nixes;
DELETE FROM public.nix_capture_prefs;
DELETE FROM public.friend_invites;
DELETE FROM public.friendships;

-- Supabase blokuje bezpośredni DELETE na storage.objects bez jawnej zgody.
SET LOCAL storage.allow_delete_query = 'true';
DELETE FROM storage.objects WHERE bucket_id = 'media-vault';

-- ============================================================
-- B) Naprawa schematu
-- ============================================================

-- B1) Triggery ochronne
DROP TRIGGER IF EXISTS prevent_username_update ON public.profiles;
CREATE TRIGGER prevent_username_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_username_change();

DROP TRIGGER IF EXISTS protect_snap_payload ON public.nixes;
DROP TRIGGER IF EXISTS protect_nix_payload ON public.nixes;
CREATE TRIGGER protect_nix_payload
  BEFORE UPDATE ON public.nixes
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_nix_payload_update();

-- B2) RLS UPDATE z WITH CHECK
DROP POLICY IF EXISTS nixes_update_viewed ON public.nixes;
CREATE POLICY nixes_update_viewed
  ON public.nixes FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

DROP POLICY IF EXISTS friendships_update ON public.friendships;
CREATE POLICY friendships_update
  ON public.friendships FOR UPDATE
  USING (auth.uid() = friend_id)
  WITH CHECK (auth.uid() = friend_id);

-- B3) Storage: limit 400MB + polityki UPDATE (TUS/resumable upload)
UPDATE storage.buckets
SET file_size_limit = 419430400
WHERE id = 'media-vault';

DROP POLICY IF EXISTS storage_update ON storage.objects;
CREATE POLICY storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND name LIKE ('nixes/' || auth.uid() || '/%')
  )
  WITH CHECK (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND name LIKE ('nixes/' || auth.uid() || '/%')
  );

DROP POLICY IF EXISTS avatars_storage_update ON storage.objects;
CREATE POLICY avatars_storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1)::uuid = auth.uid()
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1)::uuid = auth.uid()
  );

-- B4) Porządki indeksów
DROP INDEX IF EXISTS public.idx_snaps_sender_created_at;

-- B5) upload_logs (brakująca tabela observability)
CREATE TABLE IF NOT EXISTS public.upload_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id TEXT NOT NULL,
  upload_flow_id TEXT,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'success', 'failed', 'retrying')),
  retry_count INT NOT NULL DEFAULT 0,
  failure_stage TEXT,
  error_message TEXT,
  connection_type TEXT,
  original_size_bytes BIGINT,
  final_size_bytes BIGINT,
  compression_ratio NUMERIC(5,2),
  compression_duration_ms INT,
  upload_duration_ms INT,
  end_to_end_duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upload_logs_select ON public.upload_logs;
CREATE POLICY upload_logs_select
  ON public.upload_logs FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS upload_logs_insert ON public.upload_logs;
CREATE POLICY upload_logs_insert
  ON public.upload_logs FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS upload_logs_delete ON public.upload_logs;
CREATE POLICY upload_logs_delete
  ON public.upload_logs FOR DELETE
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_upload_logs_sender_created_at
  ON public.upload_logs(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_logs_status_created_at
  ON public.upload_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_logs_upload_flow_id
  ON public.upload_logs(upload_flow_id)
  WHERE upload_flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upload_logs_failure_stage
  ON public.upload_logs(failure_stage)
  WHERE failure_stage IS NOT NULL;

-- B6) Bezpieczeństwo: usuń enumerację profili; can_send_nix tylko przez RLS
DROP FUNCTION IF EXISTS public.list_public_profiles();

REVOKE ALL ON FUNCTION public.can_send_nix(UUID, UUID) FROM PUBLIC, anon, authenticated;

COMMIT;
