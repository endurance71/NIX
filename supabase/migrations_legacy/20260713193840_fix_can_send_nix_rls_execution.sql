BEGIN;

-- nixes_insert invokes this function from its WITH CHECK expression. Revoking
-- EXECUTE from authenticated therefore blocks every insert before the policy
-- can evaluate the friendship. Keep direct calls safe by binding sender to the
-- authenticated user, then grant the permission required by the RLS policy.
CREATE OR REPLACE FUNCTION public.can_send_nix(sender UUID, receiver UUID)
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
  IF auth.uid() IS NULL OR sender IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

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
  FROM public.nixes n
  WHERE n.sender_id = sender
    AND n.created_at > NOW() - INTERVAL '1 minute';

  RETURN recent_count < 20;
END;
$$;

REVOKE ALL ON FUNCTION public.can_send_nix(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_nix(UUID, UUID) TO authenticated;

COMMIT;
