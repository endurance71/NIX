-- ============================================================
-- NiX — Supabase SQL Setup Script v1.0
-- Wklej całość do: Supabase Dashboard → SQL Editor → Run
-- ============================================================


-- ============================================================
-- 1. TABELE
-- ============================================================

-- 1.1 Profile użytkowników
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username    TEXT UNIQUE,
  apple_id    TEXT UNIQUE,               -- NULL do czasu wdrożenia Apple Auth (Sprint 4)
  push_token  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT username_length CHECK (username IS NULL OR char_length(username) >= 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Awatar: zdjęcie (ścieżka w bucketcie avatars, format "<user_uuid>/<plik>") lub jedno emoji
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS avatar_emoji TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_exclusive;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_exclusive CHECK (
    NOT (avatar_storage_path IS NOT NULL AND avatar_emoji IS NOT NULL)
  );

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_emoji_length;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_emoji_length CHECK (
    avatar_emoji IS NULL OR char_length(avatar_emoji) <= 32
  );

-- 1.2 Snaps (wiadomości efemeryczne)
CREATE TABLE IF NOT EXISTS public.snaps (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  media_path   TEXT NOT NULL,           -- Ścieżka w Supabase Storage bucket
  media_type   TEXT DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  is_viewed    BOOLEAN DEFAULT FALSE,
  status       TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'cleaned', 'cleanup_failed')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  viewed_at    TIMESTAMPTZ,
  cleaned_at   TIMESTAMPTZ
);

-- Czas wyświetlania u odbiorcy (sekundy); ustawiany przy wysyłce z aplikacji.
ALTER TABLE public.snaps
  ADD COLUMN IF NOT EXISTS view_duration_sec INT NOT NULL DEFAULT 5;

ALTER TABLE public.snaps
  ADD COLUMN IF NOT EXISTS playback_duration_ms INTEGER;

ALTER TABLE public.snaps
  ADD COLUMN IF NOT EXISTS client_upload_id TEXT;

-- Embedded miniatura wideo (data URL JPEG base64) — pozwala odbiorcy wyświetlić pierwszą klatkę
-- natychmiast po pobraniu listy snapów, bez dodatkowego pobrania pliku ze Storage.
-- Limit ~60 KB stringa (≈45 KB binarki) chroni rozmiar wiersza.
ALTER TABLE public.snaps
  ADD COLUMN IF NOT EXISTS thumbnail_b64 TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'snaps_thumbnail_b64_size'
      AND conrelid = 'public.snaps'::regclass
  ) THEN
    ALTER TABLE public.snaps
      ADD CONSTRAINT snaps_thumbnail_b64_size
      CHECK (thumbnail_b64 IS NULL OR octet_length(thumbnail_b64) <= 60000);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'snaps_view_duration_sec_check'
      AND conrelid = 'public.snaps'::regclass
  ) THEN
    ALTER TABLE public.snaps
      ADD CONSTRAINT snaps_view_duration_sec_check
      CHECK (view_duration_sec IN (5, 15, 30, 60, 180));
  END IF;
END $$;

ALTER TABLE public.snaps
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent';

ALTER TABLE public.snaps
  ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'snaps_status_check'
      AND conrelid = 'public.snaps'::regclass
  ) THEN
    ALTER TABLE public.snaps
      ADD CONSTRAINT snaps_status_check
      CHECK (status IN ('sent', 'viewed', 'cleaned', 'cleanup_failed'));
  END IF;
END $$;

-- 1.3 Znajomości
CREATE TABLE IF NOT EXISTS public.friendships (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status     TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- 1.4 Zaproszenia QR (jednorazowe tokeny)
CREATE TABLE IF NOT EXISTS public.friend_invites (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  channel    TEXT NOT NULL CHECK (channel = 'qr'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  used_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 Kolejka cleanupu (retry/safety-net)
CREATE TABLE IF NOT EXISTS public.snap_cleanup_queue (
  snap_id UUID PRIMARY KEY REFERENCES public.snaps(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  media_path TEXT NOT NULL,
  attempt_count INT DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.5 Audit cleanupu
CREATE TABLE IF NOT EXISTS public.snap_cleanup_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snap_id UUID,
  receiver_id UUID,
  media_path TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'success', 'failed', 'not_found', 'forbidden')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.6 Upload logs (metryki jakości i SLA uploadu)
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


-- ============================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- 2.1 Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Użytkownik czyta tylko własny profil (dane publiczne udostępniają dedykowane RPC)
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Użytkownik może wstawiać tylko swój własny profil
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Użytkownik może aktualizować tylko swój profil
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Użytkownik może usunąć własny profil
CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);


-- 2.2 Snaps
ALTER TABLE public.snaps ENABLE ROW LEVEL SECURITY;

-- Nadawca i odbiorca widzą snap
CREATE POLICY "snaps_select"
  ON public.snaps FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Tylko zalogowany użytkownik może wysłać snap (jako nadawca)
CREATE POLICY "snaps_insert"
  ON public.snaps FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.can_send_snap(sender_id, receiver_id)
  );

-- Tylko odbiorca może oznaczyć snap jako przeczytany
CREATE POLICY "snaps_update_viewed"
  ON public.snaps FOR UPDATE
  USING (auth.uid() = receiver_id);


-- 2.3 Friendships
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Użytkownik widzi swoje znajomości
CREATE POLICY "friendships_select"
  ON public.friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Użytkownik może wysłać zaproszenie
CREATE POLICY "friendships_insert"
  ON public.friendships FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND user_id <> friend_id
    AND (
      SELECT COUNT(*)
      FROM public.friendships f
      WHERE f.user_id = auth.uid()
        AND f.created_at > NOW() - INTERVAL '1 hour'
    ) < 30
  );

-- Użytkownik może zaakceptować zaproszenie (gdzie jest friend_id)
CREATE POLICY "friendships_update"
  ON public.friendships FOR UPDATE
  USING (auth.uid() = friend_id);

-- Obie strony mogą usunąć znajomość
CREATE POLICY "friendships_delete"
  ON public.friendships FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- 2.4 Friend invites
ALTER TABLE public.friend_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friend_invites_select"
  ON public.friend_invites FOR SELECT
  USING (auth.uid() = created_by OR auth.uid() = used_by);

CREATE POLICY "friend_invites_insert"
  ON public.friend_invites FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND expires_at > NOW()
  );

CREATE POLICY "friend_invites_update"
  ON public.friend_invites FOR UPDATE
  USING (auth.uid() = used_by OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = used_by OR auth.role() = 'service_role');

-- 2.5 Cleanup queue
ALTER TABLE public.snap_cleanup_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snap_cleanup_queue_select"
  ON public.snap_cleanup_queue FOR SELECT
  USING (auth.uid() = receiver_id);

CREATE POLICY "snap_cleanup_queue_insert"
  ON public.snap_cleanup_queue FOR INSERT
  WITH CHECK (auth.uid() = receiver_id);

CREATE POLICY "snap_cleanup_queue_update"
  ON public.snap_cleanup_queue FOR UPDATE
  USING (auth.uid() = receiver_id);

CREATE POLICY "snap_cleanup_queue_delete"
  ON public.snap_cleanup_queue FOR DELETE
  USING (auth.uid() = receiver_id OR auth.role() = 'service_role');

-- 2.6 Cleanup audit (tylko serwis)
ALTER TABLE public.snap_cleanup_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snap_cleanup_audit_select"
  ON public.snap_cleanup_audit FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "snap_cleanup_audit_insert"
  ON public.snap_cleanup_audit FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- 2.7 Upload logs
ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upload_logs_select"
  ON public.upload_logs FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "upload_logs_insert"
  ON public.upload_logs FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "upload_logs_delete"
  ON public.upload_logs FOR DELETE
  USING (auth.role() = 'service_role');


-- ============================================================
-- 3. FUNKCJA: Auto-tworzenie profilu po rejestracji
-- Wyzwala się automatycznie gdy użytkownik potwierdzi OTP
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Profil tworzony bez username — onboarding uzupełni username przy pierwszym logowaniu.
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Username jest jednorazowy: po ustawieniu nie można go już zmienić.
CREATE OR REPLACE FUNCTION public.prevent_username_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'Username cannot be changed once set';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_snap_payload_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.sender_id IS DISTINCT FROM NEW.sender_id
    OR OLD.receiver_id IS DISTINCT FROM NEW.receiver_id
    OR OLD.media_path IS DISTINCT FROM NEW.media_path
    OR OLD.media_type IS DISTINCT FROM NEW.media_type
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.view_duration_sec IS DISTINCT FROM NEW.view_duration_sec
    OR OLD.thumbnail_b64 IS DISTINCT FROM NEW.thumbnail_b64
  THEN
    RAISE EXCEPTION 'Only delivery status fields can be updated on snaps';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_send_snap(sender UUID, receiver UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  friendship_exists BOOLEAN;
  recent_count INT;
BEGIN
  IF sender IS NULL OR receiver IS NULL OR sender = receiver THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = sender AND f.friend_id = receiver)
        OR
        (f.user_id = receiver AND f.friend_id = sender)
      )
  ) INTO friendship_exists;

  IF NOT friendship_exists THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*)
    INTO recent_count
  FROM public.snaps s
  WHERE s.sender_id = sender
    AND s.created_at > NOW() - INTERVAL '1 minute';

  RETURN recent_count < 20;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(search_username TEXT)
RETURNS TABLE(id UUID, username TEXT, avatar_storage_path TEXT, avatar_emoji TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND lower(p.username) = lower(search_username)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profiles_by_ids(profile_ids UUID[])
RETURNS TABLE(id UUID, username TEXT, avatar_storage_path TEXT, avatar_emoji TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.id = ANY(profile_ids)
    AND p.username IS NOT NULL
  ORDER BY p.username ASC;
$$;

CREATE OR REPLACE FUNCTION public.create_friend_invite(invite_channel TEXT)
RETURNS TABLE(invite_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_plain TEXT;
  token_digest TEXT;
  expiration TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF lower(trim(invite_channel)) <> 'qr' THEN
    RAISE EXCEPTION 'Invalid invite channel';
  END IF;

  token_plain := replace(gen_random_uuid()::TEXT, '-', '') || replace(gen_random_uuid()::TEXT, '-', '');
  token_digest := md5(token_plain);
  expiration := NOW() + INTERVAL '5 minutes';

  INSERT INTO public.friend_invites (created_by, token_hash, channel, expires_at)
  VALUES (auth.uid(), token_digest, 'qr', expiration);

  RETURN QUERY SELECT token_plain, expiration;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_friend_invite(invite_token TEXT)
RETURNS TABLE(result TEXT, friend_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_id UUID;
  current_user UUID;
  token_digest TEXT;
  pending_row_id UUID;
BEGIN
  current_user := auth.uid();
  IF current_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF invite_token IS NULL OR char_length(invite_token) < 16 THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;

  token_digest := md5(invite_token);

  UPDATE public.friend_invites fi
  SET used_at = NOW(), used_by = current_user
  WHERE fi.token_hash = token_digest
    AND fi.used_at IS NULL
    AND fi.expires_at > NOW()
  RETURNING fi.created_by INTO inviter_id;

  IF inviter_id IS NULL THEN
    RAISE EXCEPTION 'Invite token expired, invalid, or already used';
  END IF;

  IF inviter_id = current_user THEN
    RAISE EXCEPTION 'Cannot redeem your own invite';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = current_user AND f.friend_id = inviter_id)
        OR
        (f.user_id = inviter_id AND f.friend_id = current_user)
      )
  ) THEN
    RETURN QUERY SELECT 'already_friends'::TEXT, inviter_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'pending'
      AND f.user_id = current_user
      AND f.friend_id = inviter_id
  ) THEN
    RETURN QUERY SELECT 'already_requested'::TEXT, inviter_id;
    RETURN;
  END IF;

  SELECT f.id
  INTO pending_row_id
  FROM public.friendships f
  WHERE f.status = 'pending'
    AND f.user_id = inviter_id
    AND f.friend_id = current_user
  LIMIT 1;

  IF pending_row_id IS NOT NULL THEN
    UPDATE public.friendships f
    SET status = 'accepted'
    WHERE f.id = pending_row_id;
    RETURN QUERY SELECT 'accepted_reverse_request'::TEXT, inviter_id;
    RETURN;
  END IF;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (current_user, inviter_id, 'pending');

  RETURN QUERY SELECT 'request_sent'::TEXT, inviter_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_public_profiles()
RETURNS TABLE(id UUID, username TEXT, avatar_storage_path TEXT, avatar_emoji TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.username IS NOT NULL
  ORDER BY p.username ASC;
$$;

CREATE OR REPLACE FUNCTION public.list_accepted_friends_paginated(page_limit INT DEFAULT 50, before_created_at TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE(id UUID, username TEXT, avatar_storage_path TEXT, avatar_emoji TEXT, friendship_created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH relations AS (
    SELECT
      CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END AS friend_profile_id,
      f.created_at
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.user_id = auth.uid() OR f.friend_id = auth.uid())
      AND (before_created_at IS NULL OR f.created_at < before_created_at)
    ORDER BY f.created_at DESC
    LIMIT LEAST(GREATEST(page_limit, 1), 100)
  )
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji, r.created_at
  FROM relations r
  JOIN public.profiles p ON p.id = r.friend_profile_id
  WHERE p.username IS NOT NULL
  ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.fetch_inbox_snaps_paginated(page_limit INT DEFAULT 50, before_created_at TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF public.snaps
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.snaps s
  WHERE s.receiver_id = auth.uid()
    AND (before_created_at IS NULL OR s.created_at < before_created_at)
  ORDER BY s.created_at DESC
  LIMIT LEAST(GREATEST(page_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.fetch_sent_snaps_paginated(page_limit INT DEFAULT 50, before_created_at TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF public.snaps
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.snaps s
  WHERE s.sender_id = auth.uid()
    AND (before_created_at IS NULL OR s.created_at < before_created_at)
  ORDER BY s.created_at DESC
  LIMIT LEAST(GREATEST(page_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.log_cleanup_audit(
  p_snap_id UUID,
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
  INSERT INTO public.snap_cleanup_audit (snap_id, receiver_id, media_path, status, error_message)
  VALUES (p_snap_id, p_receiver_id, p_media_path, p_status, p_error_message);
$$;

CREATE OR REPLACE FUNCTION public.delete_my_conversation_with_peer(peer_profile_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF peer_profile_id IS NULL OR peer_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid peer id';
  END IF;

  DELETE FROM public.snaps s
  WHERE
    (s.sender_id = auth.uid() AND s.receiver_id = peer_profile_id)
    OR (s.receiver_id = auth.uid() AND s.sender_id = peer_profile_id);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN COALESCE(deleted_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_by_username(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_profiles_by_ids(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_friend_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_friend_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_profiles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_accepted_friends_paginated(INT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fetch_inbox_snaps_paginated(INT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fetch_sent_snaps_paginated(INT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_send_snap(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_cleanup_audit(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_conversation_with_peer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profiles_by_ids(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_friend_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_friend_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_accepted_friends_paginated(INT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_inbox_snaps_paginated(INT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_sent_snaps_paginated(INT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_snap(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_cleanup_audit(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_conversation_with_peer(UUID) TO authenticated;

-- Trigger na auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS prevent_username_update ON public.profiles;
CREATE TRIGGER prevent_username_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_username_change();

DROP TRIGGER IF EXISTS protect_snap_payload ON public.snaps;
CREATE TRIGGER protect_snap_payload
  BEFORE UPDATE ON public.snaps
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_snap_payload_update();


-- ============================================================
-- 4. STORAGE BUCKET: media-vault
-- ============================================================

-- Utwórz prywatny bucket (nie publiczny!)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-vault',
  'media-vault',
  FALSE,                                    -- PRYWATNY — wymagana autoryzacja
  419430400,                                -- Max 400MB na plik (wideo do 180 s)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Aktualizacja limitu dla istniejącego bucketa.
UPDATE storage.buckets
SET file_size_limit = 419430400
WHERE id = 'media-vault';

-- Polityki Storage: nadawca może wgrywać
CREATE POLICY "storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND name LIKE ('snaps/' || auth.uid() || '/%')
  );

-- Nadawca i odbiorca mogą pobrać plik (sprawdzane przez snap record)
CREATE POLICY "storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.snaps s
      WHERE s.media_path = name
        AND (s.sender_id = auth.uid() OR s.receiver_id = auth.uid())
    )
  );

-- Tylko serwis (service_role) może usuwać — wywołuje Edge Function
CREATE POLICY "storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media-vault'
    AND auth.role() = 'service_role'
  );


-- ============================================================
-- 4b. STORAGE BUCKET: avatars (zdjęcia profilowe, prywatny odczyk dla znajomych)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Ścieżka obiektu w bucketcie: "<user_uuid>/<plik>" (bez prefiksu nazwy bucketa)
CREATE POLICY "avatars_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1)::uuid = auth.uid()
  );

CREATE POLICY "avatars_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (
      split_part(name, '/', 1)::uuid = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.user_id = auth.uid() AND f.friend_id = split_part(name, '/', 1)::uuid)
            OR (f.friend_id = auth.uid() AND f.user_id = split_part(name, '/', 1)::uuid)
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.snaps s
        WHERE
          (
            s.sender_id = auth.uid()
            AND s.receiver_id = split_part(name, '/', 1)::uuid
          )
          OR (
            s.receiver_id = auth.uid()
            AND s.sender_id = split_part(name, '/', 1)::uuid
          )
      )
    )
  );

CREATE POLICY "avatars_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1)::uuid = auth.uid()
  );


-- ============================================================
-- 5. INDEKSY (wydajność)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_snaps_receiver_id ON public.snaps(receiver_id);
CREATE INDEX IF NOT EXISTS idx_snaps_sender_id   ON public.snaps(sender_id);
CREATE INDEX IF NOT EXISTS idx_snaps_is_viewed   ON public.snaps(is_viewed);
CREATE INDEX IF NOT EXISTS idx_snaps_sender_created_at ON public.snaps(sender_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_snaps_sender_receiver_upload_id_unique
  ON public.snaps(sender_id, receiver_id, client_upload_id)
  WHERE client_upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_friendships_user  ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_invites_created_by ON public.friend_invites(created_by);
CREATE INDEX IF NOT EXISTS idx_friend_invites_expires_at ON public.friend_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_snap_cleanup_queue_receiver_next_attempt
  ON public.snap_cleanup_queue(receiver_id, next_attempt_at);
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


-- ============================================================
-- GOTOWE ✅
-- Sprawdź w: Table Editor → profiles / snaps / friendships
-- ============================================================
