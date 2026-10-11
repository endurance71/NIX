-- Private accounts are enforced, not just stored.
--
-- `profiles.is_private` was only a column and a toggle; the app promises that a private account can
-- be found only through its QR code or an invite link. This makes it true:
-- * username search (`get_public_profile_by_username`) never returns a private profile;
-- * a direct friend request (client INSERT into `friendships`) to a private profile is rejected.
-- Invites and QR codes keep working: `redeem_friend_invite` is SECURITY DEFINER and creates the
-- friendship itself, so the invitee's choice to share the code is the consent. Accepting a request
-- the private user sent (UPDATE) is unaffected, as are existing friendships.

-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION private.is_profile_private(profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT p.is_private FROM public.profiles p WHERE p.id = profile_id), false);
$$;

REVOKE ALL ON FUNCTION private.is_profile_private(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_profile_private(UUID) TO authenticated, service_role;

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
    AND NOT p.is_private
    AND NOT private.is_pair_blocked(auth.uid(), p.id)
    AND NOT private.is_account_restricted(p.id)
  LIMIT 1;
$$;

DROP POLICY IF EXISTS friendships_insert ON public.friendships;
CREATE POLICY friendships_insert ON public.friendships FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid()) AND user_id <> friend_id AND status = 'pending'
  AND NOT private.is_pair_blocked(user_id, friend_id)
  AND NOT private.is_account_restricted(user_id)
  AND NOT private.is_account_restricted(friend_id)
  AND NOT private.is_profile_private(friend_id)
);
