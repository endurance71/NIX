BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

CREATE TEMP TABLE security_definer_grant_allowlist (
  schema_name text NOT NULL,
  function_name text NOT NULL,
  allowed_roles text[] NOT NULL,
  PRIMARY KEY (schema_name, function_name)
);

INSERT INTO security_definer_grant_allowlist (schema_name, function_name, allowed_roles)
VALUES
  ('private', 'invoke_cleanup_media_upload_orphans', ARRAY[]::text[]),
  ('private', 'invoke_cleanup_moderation_evidence', ARRAY[]::text[]),
  ('private', 'invoke_cleanup_nix_due', ARRAY[]::text[]),
  ('private', 'invoke_cleanup_text_messages', ARRAY[]::text[]),
  ('private', 'invoke_process_data_exports', ARRAY[]::text[]),
  ('private', 'invoke_push_dispatch', ARRAY[]::text[]),
  ('private', 'invoke_push_receipts', ARRAY[]::text[]),
  ('private', 'is_account_restricted', ARRAY['authenticated', 'service_role']),
  ('private', 'is_pair_blocked', ARRAY['authenticated', 'service_role']),
  ('private', 'moderation_cleanup_auth_headers', ARRAY[]::text[]),
  ('private', 'pre_delivery_moderation_enabled', ARRAY['service_role']),
  ('private', 'finalize_media_upload_batch_legacy', ARRAY['service_role']),
  ('private', 'push_edge_auth_headers', ARRAY[]::text[]),
  ('private', 'trigger_push_dispatch', ARRAY[]::text[]),
  ('public', 'archive_blocked_shared_media', ARRAY['service_role']),
  ('public', 'archive_shared_media_nix', ARRAY['service_role']),
  ('public', 'begin_media_upload_batch', ARRAY['authenticated', 'service_role']),
  ('public', 'block_user', ARRAY['authenticated', 'service_role']),
  ('public', 'can_send_nix', ARRAY['authenticated', 'service_role']),
  ('public', 'can_send_text_message', ARRAY['authenticated', 'service_role']),
  ('public', 'cancel_media_upload_batch', ARRAY['service_role']),
  ('public', 'claim_push_notification_jobs', ARRAY['service_role']),
  ('public', 'claim_moderation_jobs', ARRAY['service_role']),
  ('public', 'cleanup_expired_data_exports', ARRAY['service_role']),
  ('public', 'cleanup_expired_moderation_quarantine', ARRAY['service_role']),
  ('public', 'complete_moderation_job', ARRAY['service_role']),
  ('public', 'create_content_report_v2', ARRAY['authenticated', 'service_role']),
  ('public', 'create_friend_invite', ARRAY['authenticated', 'service_role']),
  ('public', 'delete_my_account_data', ARRAY['service_role']),
  ('public', 'delete_my_conversation_with_peer', ARRAY['authenticated', 'service_role']),
  ('public', 'disable_push_device', ARRAY['authenticated', 'service_role']),
  ('public', 'enqueue_push_notification_job', ARRAY[]::text[]),
  ('public', 'enqueue_text_moderation_job', ARRAY['service_role']),
  ('public', 'fetch_inbox_nixes_paginated', ARRAY['authenticated', 'service_role']),
  ('public', 'fetch_message_reactions_with_peer', ARRAY['authenticated', 'service_role']),
  ('public', 'fetch_sent_nixes_paginated', ARRAY['authenticated', 'service_role']),
  ('public', 'fetch_text_messages_with_peer', ARRAY['authenticated', 'service_role']),
  ('public', 'finalize_media_upload_batch', ARRAY['service_role']),
  ('public', 'get_capture_policy_for_sender', ARRAY['authenticated', 'service_role']),
  ('public', 'get_public_profile_by_username', ARRAY['authenticated', 'service_role']),
  ('public', 'get_public_profiles_by_ids', ARRAY['authenticated', 'service_role']),
  ('public', 'get_push_device_state', ARRAY['authenticated', 'service_role']),
  ('public', 'get_unread_inbox_count', ARRAY['authenticated', 'service_role']),
  ('public', 'get_unread_inbox_count_for_user', ARRAY['service_role']),
  ('public', 'get_user_activation_state', ARRAY['authenticated', 'service_role']),
  ('public', 'handle_new_user', ARRAY['service_role']),
  ('public', 'list_accepted_friends_paginated', ARRAY['authenticated', 'service_role']),
  ('public', 'list_blocked_users', ARRAY['authenticated', 'service_role']),
  ('public', 'list_moderation_evidence_orphans', ARRAY['service_role']),
  ('public', 'list_my_content_reports', ARRAY['authenticated', 'service_role']),
  ('public', 'log_cleanup_audit', ARRAY['service_role']),
  ('public', 'materialize_approved_media_batch', ARRAY['service_role']),
  ('public', 'materialize_approved_text_message', ARRAY['service_role']),
  ('public', 'mark_expired_media_uploads', ARRAY['service_role']),
  ('public', 'mark_nix_replayed', ARRAY['authenticated', 'service_role']),
  ('public', 'mark_nix_unplayable', ARRAY['authenticated', 'service_role']),
  ('public', 'mark_nix_viewed_for_replay', ARRAY['authenticated', 'service_role']),
  ('public', 'mark_text_conversation_read', ARRAY['authenticated', 'service_role']),
  ('public', 'moderation_decide_report', ARRAY['service_role']),
  ('public', 'moderation_record_appeal', ARRAY['service_role']),
  ('public', 'moderation_remove_reported_content', ARRAY['service_role']),
  ('public', 'preview_friend_invite', ARRAY['authenticated', 'service_role']),
  ('public', 'prune_push_notification_history', ARRAY['service_role']),
  ('public', 'record_age_attestation', ARRAY['authenticated', 'service_role']),
  ('public', 'record_product_analytics_event', ARRAY['authenticated', 'service_role']),
  ('public', 'redeem_friend_invite', ARRAY['authenticated', 'service_role']),
  ('public', 'register_app_installation', ARRAY['authenticated', 'service_role']),
  ('public', 'register_push_device', ARRAY['authenticated', 'service_role']),
  ('public', 'remove_message_reaction', ARRAY['authenticated', 'service_role']),
  ('public', 'report_capture_attempt', ARRAY['authenticated', 'service_role']),
  ('public', 'request_data_export', ARRAY['authenticated', 'service_role']),
  ('public', 'revoke_other_app_installations', ARRAY['authenticated', 'service_role']),
  ('public', 'rollup_and_cleanup_product_analytics', ARRAY['service_role']),
  ('public', 'set_conversation_mute', ARRAY['authenticated', 'service_role']),
  ('public', 'set_notification_preferences', ARRAY['authenticated', 'service_role']),
  ('public', 'set_product_analytics_consent', ARRAY['authenticated', 'service_role']),
  ('public', 'touch_push_device', ARRAY['authenticated', 'service_role']),
  ('public', 'unblock_user', ARRAY['authenticated', 'service_role']),
  ('public', 'update_user_activation_state', ARRAY['authenticated', 'service_role']),
  ('public', 'upsert_message_reaction', ARRAY['authenticated', 'service_role']);

SELECT plan(5);

SELECT is(
  (
    SELECT COUNT(*)::integer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'moderation')
      AND p.prokind = 'f'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1
        FROM security_definer_grant_allowlist a
        WHERE a.schema_name = n.nspname
          AND a.function_name = p.proname
      )
  ),
  0,
  'every SECURITY DEFINER function has an allowlist entry'
);

SELECT is(
  (
    SELECT COUNT(*)::integer
    FROM security_definer_grant_allowlist a
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = a.schema_name
        AND p.proname = a.function_name
        AND p.prokind = 'f'
        AND p.prosecdef = true
    )
  ),
  0,
  'allowlist has no stale SECURITY DEFINER entries'
);

SELECT is(
  has_function_privilege('anon', 'public.enqueue_push_notification_job()', 'EXECUTE'),
  FALSE,
  'anon cannot execute enqueue_push_notification_job'
);

DO $$
DECLARE
  fn record;
  role_name text;
  allowed boolean;
BEGIN
  FOR fn IN
    SELECT
      a.schema_name,
      a.function_name,
      a.allowed_roles,
      p.oid AS function_oid
    FROM security_definer_grant_allowlist a
    JOIN pg_namespace n ON n.nspname = a.schema_name
    JOIN pg_proc p ON p.pronamespace = n.oid AND p.proname = a.function_name AND p.prosecdef = true
  LOOP
    IF has_function_privilege('anon', fn.function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon has EXECUTE on %.%', fn.schema_name, fn.function_name;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM aclexplode(coalesce(
        (SELECT proacl FROM pg_proc WHERE oid = fn.function_oid),
        acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = fn.function_oid))
      )) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PUBLIC has EXECUTE on %.%', fn.schema_name, fn.function_name;
    END IF;

    FOREACH role_name IN ARRAY ARRAY['authenticated', 'service_role'] LOOP
      allowed := role_name = ANY (fn.allowed_roles);
      IF has_function_privilege(role_name, fn.function_oid, 'EXECUTE') <> allowed THEN
        RAISE EXCEPTION 'unexpected % EXECUTE on %.% (allowed=%)', role_name, fn.schema_name, fn.function_name, allowed;
      END IF;
    END LOOP;
  END LOOP;
END $$;

SELECT pass('anon and PUBLIC never execute SECURITY DEFINER functions');
SELECT pass('authenticated/service_role grants match allowlist');

SELECT finish();
ROLLBACK;
