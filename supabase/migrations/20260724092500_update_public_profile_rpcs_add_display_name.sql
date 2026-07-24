-- Update get_public_profile_by_username, get_public_profiles_by_ids, list_accepted_friends_paginated, preview_friend_invite RPCs to return display_name

DROP FUNCTION IF EXISTS public.get_public_profile_by_username(TEXT);
DROP FUNCTION IF EXISTS public.get_public_profiles_by_ids(UUID[]);
DROP FUNCTION IF EXISTS public.list_accepted_friends_paginated(INT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.preview_friend_invite(TEXT);

CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(search_username TEXT)
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, avatar_storage_path TEXT, avatar_emoji TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND NOT private.is_account_restricted(auth.uid())
    AND lower(p.username) = lower(search_username)
    AND p.id <> auth.uid()
    AND NOT private.is_pair_blocked(auth.uid(), p.id)
    AND NOT private.is_account_restricted(p.id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profiles_by_ids(profile_ids UUID[])
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, avatar_storage_path TEXT, avatar_emoji TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.id = ANY(profile_ids)
    AND NOT private.is_account_restricted(auth.uid())
    AND p.username IS NOT NULL
    AND NOT private.is_pair_blocked(auth.uid(), p.id)
    AND NOT private.is_account_restricted(p.id)
  ORDER BY p.username ASC;
$$;

CREATE OR REPLACE FUNCTION public.list_accepted_friends_paginated(
  page_limit INT DEFAULT 50,
  before_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, avatar_storage_path TEXT, avatar_emoji TEXT, friendship_created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH relations AS (
    SELECT CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END AS friend_profile_id,
           f.created_at
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.user_id = auth.uid() OR f.friend_id = auth.uid())
      AND (before_created_at IS NULL OR f.created_at < before_created_at)
    ORDER BY f.created_at DESC
    LIMIT LEAST(GREATEST(page_limit, 1), 100)
  )
  SELECT p.id, p.username, p.display_name, p.avatar_storage_path, p.avatar_emoji, r.created_at
  FROM relations r
  JOIN public.profiles p ON p.id = r.friend_profile_id
  WHERE NOT private.is_account_restricted(auth.uid())
    AND p.username IS NOT NULL
    AND NOT private.is_pair_blocked(auth.uid(), p.id)
    AND NOT private.is_account_restricted(p.id)
  ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.preview_friend_invite(invite_token TEXT)
RETURNS TABLE(status TEXT, profile_id UUID, username TEXT, display_name TEXT, avatar_storage_path TEXT, avatar_emoji TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inviter_id UUID;
  requester_id UUID := (SELECT auth.uid());
  token_digest TEXT;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF invite_token IS NULL OR char_length(invite_token) < 16 THEN
    RETURN QUERY SELECT 'invalid_or_expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  token_digest := md5(invite_token);
  SELECT fi.created_by INTO inviter_id
  FROM public.friend_invites fi
  WHERE fi.token_hash = token_digest AND fi.used_at IS NULL AND fi.expires_at > NOW()
  LIMIT 1;

  IF inviter_id IS NULL
    OR private.is_pair_blocked(requester_id, inviter_id)
    OR private.is_account_restricted(requester_id)
    OR private.is_account_restricted(inviter_id) THEN
    RETURN QUERY SELECT 'invalid_or_expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  IF inviter_id = requester_id THEN
    RETURN QUERY SELECT 'own_invite'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.friend_invites fi
  SET previewed_by = requester_id, previewed_at = NOW()
  WHERE fi.token_hash = token_digest AND fi.used_at IS NULL AND fi.expires_at > NOW();

  RETURN QUERY
  SELECT 'ok'::TEXT, p.id, p.username, p.display_name, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p WHERE p.id = inviter_id AND p.username IS NOT NULL LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profiles_by_ids(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_accepted_friends_paginated(INT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_friend_invite(TEXT) TO authenticated;
