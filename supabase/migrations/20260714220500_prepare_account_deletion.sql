-- Account deletion is performed exclusively by the delete-account Edge Function
-- using the service role. Retained operational logs are removed with the account
-- because NiX currently has no separately approved legal retention period.

CREATE OR REPLACE FUNCTION public.delete_my_account_data(p_user_id UUID)
RETURNS TABLE(media_path TEXT, avatar_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  -- Return paths before cascades remove the application rows. Storage is cleaned
  -- by the service-role Edge Function because SQL cannot remove Storage objects.
  RETURN QUERY
  SELECT n.media_path, NULL::TEXT
  FROM public.nixes AS n
  WHERE n.sender_id = p_user_id OR n.receiver_id = p_user_id;

  RETURN QUERY
  SELECT NULL::TEXT, p.avatar_storage_path
  FROM public.profiles AS p
  WHERE p.id = p_user_id
    AND p.avatar_storage_path IS NOT NULL;

  -- These tables intentionally have nullable/no foreign keys, so a cascade from
  -- auth.users would not erase them.
  DELETE FROM public.upload_logs
  WHERE sender_id = p_user_id OR receiver_id = p_user_id;

  DELETE FROM public.nix_cleanup_audit
  WHERE receiver_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account_data(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data(UUID) TO service_role;
