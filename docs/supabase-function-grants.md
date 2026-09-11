# Supabase function EXECUTE grants

Single registry for `SECURITY DEFINER` functions in schemas `public`, `private`, and
`moderation`. Enforced by migration
[`20260831120000_harden_security_definer_execute_grants.sql`](../supabase/migrations/20260831120000_harden_security_definer_execute_grants.sql)
and pgTAP [`security_definer_grants_test.sql`](../supabase/tests/security_definer_grants_test.sql).

## Rules

- `PUBLIC` and `anon` never receive `EXECUTE` on `SECURITY DEFINER` functions.
- Client-facing RPCs: `authenticated` + `service_role`.
- Workers, cron helpers, moderation admin: `service_role` only (or postgres via trigger).
- Trigger-only functions have no role grants; postgres owner executes them.

## authenticated (+ service_role)

| Function | Client / caller |
| --- | --- |
| `begin_media_upload_batch` | Edge `begin-media-upload` (JWT) |
| `block_user`, `unblock_user`, `list_blocked_users` | `safetyService` |
| `can_send_nix` | RLS policies |
| `can_send_text_message` | RLS + future `send-text-message` |
| `create_content_report_v2` | Edge `report-content` |
| `create_friend_invite`, `preview_friend_invite`, `redeem_friend_invite` | `friendService` |
| `delete_my_conversation_with_peer` | `textMessageService`, `nixService` |
| `disable_push_device`, `get_push_device_state`, `register_push_device`, `touch_push_device` | `pushNotificationService` |
| `fetch_*` (inbox, sent, text, reactions) | chat / nix services |
| `get_capture_policy_for_sender` | `capturePolicyService` |
| `get_public_profile_*`, `list_accepted_friends_paginated` | profile / friends |
| `get_unread_inbox_count`, `mark_text_conversation_read` | `conversationReadService` |
| `get_user_activation_state`, `update_user_activation_state` | `activationService` |
| `list_my_content_reports` | `safetyService` |
| `mark_nix_*` | `nixService`, `captureAttemptService` |
| `record_age_attestation` | `safetyService` |
| `record_product_analytics_event`, `set_product_analytics_consent` | `productAnalyticsService` |
| `register_app_installation`, `revoke_other_app_installations` | `appInstallationService` |
| `request_data_export` | `dataExportService` |
| `set_conversation_mute`, `set_notification_preferences` | `notificationPreferencesService` |
| `upsert_message_reaction`, `remove_message_reaction` | `messageReactionService` |
| `private.is_pair_blocked`, `private.is_account_restricted` | RLS (documented exception) |

## service_role only

| Function | Caller |
| --- | --- |
| `finalize_media_upload_batch`, `cancel_media_upload_batch` | Edge media upload |
| `archive_shared_media_nix`, `archive_blocked_shared_media` | Edge cleanup / block |
| `mark_expired_media_uploads` | cron / Edge orphan cleanup |
| `claim_push_notification_jobs`, `prune_push_notification_history` | `push-dispatch` |
| `delete_my_account_data` | `delete-account` |
| `moderation_decide_report`, `moderation_record_appeal`, `moderation_remove_reported_content` | `moderation-admin` |
| `list_moderation_evidence_orphans` | `cleanup-moderation-evidence` |
| `rollup_and_cleanup_product_analytics`, `cleanup_expired_data_exports` | cron workers |
| `get_unread_inbox_count_for_user` | `push-dispatch` |
| `log_cleanup_audit` | `cleanup-nix` |
| `handle_new_user` | auth trigger |

| `cleanup_expired_moderation_quarantine` | cron / worker tail |
| `enqueue_text_moderation_job` | Edge `send-text-message` |
| `claim_moderation_jobs`, `complete_moderation_job` | `moderation-worker` |
| `materialize_approved_media_batch`, `materialize_approved_text_message` | worker after Azure approve |
| `private.pre_delivery_moderation_enabled` | feature flag read |
| `private.finalize_media_upload_batch_legacy` | finalize when flag off |

## trigger-only (no EXECUTE grants)

| Function | Notes |
| --- | --- |
| `enqueue_push_notification_job` | AFTER INSERT on `nixes` / `text_messages`; **must not** be callable by roles |
| `private.trigger_push_dispatch` | pg_cron pipeline |
| `private.invoke_*` | pg_cron HTTP callers (postgres owner) |

## CHECK helpers (not SECURITY DEFINER)

`private.text_message_safety_*` — no EXECUTE for any application role; used only inside CHECK constraints.
