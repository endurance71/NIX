-- C1: explicit least-privilege EXECUTE grants for SECURITY DEFINER functions.
-- Registry: docs/supabase-function-grants.md

-- 1) Remove default PUBLIC/anon EXECUTE from every SECURITY DEFINER function.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'moderation')
      AND p.prokind = 'f'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      fn.schema_name,
      fn.function_name,
      fn.args
    );
  END LOOP;
END $$;

-- 2) Defense in depth: CHECK helpers are not callable by anon.
REVOKE ALL ON FUNCTION private.text_message_safety_normalized(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.text_message_safety_folded(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.text_message_passes_safety_filter(text) FROM PUBLIC, anon, authenticated;

-- 3) Trigger-only / worker-only: revoke direct EXECUTE from authenticated and service_role.
REVOKE ALL ON FUNCTION public.enqueue_push_notification_job() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.trigger_push_dispatch() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.finalize_media_upload_batch(UUID, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.cancel_media_upload_batch(UUID, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.archive_shared_media_nix(UUID, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.archive_blocked_shared_media(UUID, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.mark_expired_media_uploads() FROM authenticated;
REVOKE ALL ON FUNCTION public.claim_push_notification_jobs(INTEGER) FROM authenticated;
REVOKE ALL ON FUNCTION public.prune_push_notification_history() FROM authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.moderation_decide_report(UUID, TEXT, TEXT, INT) FROM authenticated;
REVOKE ALL ON FUNCTION public.moderation_record_appeal(UUID, TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.moderation_remove_reported_content(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.list_moderation_evidence_orphans() FROM authenticated;
REVOKE ALL ON FUNCTION public.rollup_and_cleanup_product_analytics() FROM authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_data_exports() FROM authenticated;
REVOKE ALL ON FUNCTION public.get_unread_inbox_count_for_user(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.log_cleanup_audit(UUID, UUID, TEXT, TEXT, TEXT) FROM authenticated;

REVOKE ALL ON FUNCTION private.invoke_cleanup_media_upload_orphans() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_cleanup_moderation_evidence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_cleanup_nix_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_cleanup_text_messages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_process_data_exports() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_push_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_push_receipts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.moderation_cleanup_auth_headers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.push_edge_auth_headers() FROM PUBLIC, anon, authenticated;

-- 4) authenticated client RPCs (mapa wywołań w docs/supabase-function-grants.md)
GRANT EXECUTE ON FUNCTION public.begin_media_upload_batch(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, TEXT, JSONB
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.block_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_send_nix(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_send_text_message(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_content_report_v2(TEXT, UUID, UUID, UUID, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_friend_invite(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_conversation_with_peer(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disable_push_device(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fetch_inbox_nixes_paginated(INTEGER, TIMESTAMPTZ)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fetch_message_reactions_with_peer(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fetch_sent_nixes_paginated(INTEGER, TIMESTAMPTZ)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_capture_policy_for_sender(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_profiles_by_ids(UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_push_device_state(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unread_inbox_count() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_activation_state() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_accepted_friends_paginated(INT, TIMESTAMPTZ)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_blocked_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_content_reports() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_nix_replayed(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_nix_unplayable(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_nix_viewed_for_replay(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_text_conversation_read(UUID, TIMESTAMPTZ)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_friend_invite(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_age_attestation(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_product_analytics_event(UUID, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_friend_invite(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_app_installation(UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_push_device(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_message_reaction(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_capture_attempt(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_data_export() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_other_app_installations(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_conversation_mute(UUID, TIMESTAMPTZ, BOOLEAN)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_notification_preferences(BOOLEAN, BOOLEAN, BOOLEAN)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_product_analytics_consent(BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_push_device(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unblock_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_user_activation_state(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_message_reaction(UUID, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.is_pair_blocked(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_account_restricted(UUID) TO authenticated, service_role;

-- 5) service_role workers / Edge Functions
GRANT EXECUTE ON FUNCTION public.finalize_media_upload_batch(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_media_upload_batch(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_shared_media_nix(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_blocked_shared_media(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_expired_media_uploads() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_notification_jobs(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_push_notification_history() TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.moderation_decide_report(UUID, TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.moderation_record_appeal(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.moderation_remove_reported_content(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_moderation_evidence_orphans() TO service_role;
GRANT EXECUTE ON FUNCTION public.rollup_and_cleanup_product_analytics() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_data_exports() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_unread_inbox_count_for_user(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_cleanup_audit(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
