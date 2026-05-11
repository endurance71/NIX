BEGIN;

ALTER FUNCTION public.prevent_username_change() SET search_path = public;
ALTER FUNCTION public.prevent_snap_payload_update() SET search_path = public;

REVOKE ALL ON FUNCTION public.can_send_snap(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_friend_invite(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_conversation_with_peer(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_capture_policy_for_sender(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_profile_by_username(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_profiles_by_ids(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_public_profiles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_cleanup_audit(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_friend_invite(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_send_snap(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_friend_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_conversation_with_peer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_capture_policy_for_sender(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profiles_by_ids(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_friend_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_cleanup_audit(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
