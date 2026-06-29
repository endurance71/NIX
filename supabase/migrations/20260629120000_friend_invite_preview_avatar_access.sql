ALTER TABLE public.friend_invites
  ADD COLUMN IF NOT EXISTS previewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previewed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.preview_friend_invite(invite_token TEXT)
RETURNS TABLE(
  status TEXT,
  profile_id UUID,
  username TEXT,
  avatar_storage_path TEXT,
  avatar_emoji TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_id UUID;
  requester_id UUID;
  token_digest TEXT;
BEGIN
  requester_id := auth.uid();
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF invite_token IS NULL OR char_length(invite_token) < 16 THEN
    RETURN QUERY SELECT 'invalid_or_expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  token_digest := md5(invite_token);

  SELECT fi.created_by
  INTO inviter_id
  FROM public.friend_invites fi
  WHERE fi.token_hash = token_digest
    AND fi.used_at IS NULL
    AND fi.expires_at > NOW()
  LIMIT 1;

  IF inviter_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_or_expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF inviter_id = requester_id THEN
    RETURN QUERY SELECT 'own_invite'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.friend_invites fi
  SET previewed_by = requester_id, previewed_at = NOW()
  WHERE fi.token_hash = token_digest
    AND fi.used_at IS NULL
    AND fi.expires_at > NOW();

  RETURN QUERY
  SELECT
    'ok'::TEXT,
    p.id,
    p.username,
    p.avatar_storage_path,
    p.avatar_emoji
  FROM public.profiles p
  WHERE p.id = inviter_id
    AND p.username IS NOT NULL
  LIMIT 1;
END;
$$;

DROP POLICY IF EXISTS "avatars_storage_select" ON storage.objects;
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
        FROM public.nixes s
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
      OR EXISTS (
        SELECT 1
        FROM public.friend_invites fi
        WHERE fi.created_by = split_part(name, '/', 1)::uuid
          AND fi.previewed_by = auth.uid()
          AND fi.used_at IS NULL
          AND fi.expires_at > NOW()
      )
    )
  );

REVOKE ALL ON FUNCTION public.preview_friend_invite(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_friend_invite(TEXT) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_friend_invites_previewed_by
  ON public.friend_invites(previewed_by);
