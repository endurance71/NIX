ALTER TABLE public.profiles
ADD COLUMN bio TEXT,
ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 140);

DROP FUNCTION IF EXISTS public.list_accepted_friends_paginated(INT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.list_accepted_friends_paginated(
  page_limit INT DEFAULT 50,
  before_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  username TEXT,
  display_name TEXT,
  bio TEXT,
  avatar_storage_path TEXT,
  avatar_emoji TEXT,
  friendship_created_at TIMESTAMPTZ
)
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
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_storage_path,
    p.avatar_emoji,
    r.created_at
  FROM relations r
  JOIN public.profiles p ON p.id = r.friend_profile_id
  WHERE NOT private.is_account_restricted(auth.uid())
    AND p.username IS NOT NULL
    AND NOT private.is_pair_blocked(auth.uid(), p.id)
    AND NOT private.is_account_restricted(p.id)
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_accepted_friends_paginated(INT, TIMESTAMPTZ) TO authenticated;
