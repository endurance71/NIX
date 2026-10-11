BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(33);

-- Foreign-key covering indexes ---------------------------------------------------
SELECT has_index('public', 'media_upload_recipients', 'idx_media_upload_recipients_nix_id', ARRAY['nix_id']);
SELECT has_index('public', 'content_reports', 'idx_content_reports_nix_id', ARRAY['nix_id']);
SELECT has_index('public', 'content_reports', 'idx_content_reports_text_message_id', ARRAY['text_message_id']);
SELECT has_index('public', 'content_reports', 'idx_content_reports_reported_user_id', ARRAY['reported_user_id']);
SELECT has_index('public', 'moderation_jobs', 'idx_moderation_jobs_batch_id', ARRAY['batch_id']);
SELECT has_index('public', 'moderation_jobs', 'idx_moderation_jobs_text_payload_id', ARRAY['text_payload_id']);
SELECT has_index('public', 'moderation_jobs', 'idx_moderation_jobs_receiver_id', ARRAY['receiver_id']);
SELECT has_index('public', 'push_notification_jobs', 'idx_push_notification_jobs_recipient_id', ARRAY['recipient_id']);
SELECT has_index('public', 'push_notification_jobs', 'idx_push_notification_jobs_actor_id', ARRAY['actor_id']);
SELECT has_index('public', 'push_notification_deliveries', 'idx_push_notification_deliveries_device_id', ARRAY['device_id']);
SELECT has_index('public', 'nix_capture_prefs', 'idx_nix_capture_prefs_friend_user_id', ARRAY['friend_user_id']);
SELECT has_index('public', 'friend_invites', 'idx_friend_invites_used_by', ARRAY['used_by']);
SELECT has_index('public', 'upload_logs', 'idx_upload_logs_receiver_id', ARRAY['receiver_id']);
SELECT has_index('public', 'conversation_read_states', 'idx_conversation_read_states_peer_id', ARRAY['peer_id']);
SELECT has_index('public', 'conversation_mutes', 'idx_conversation_mutes_peer_user_id', ARRAY['peer_user_id']);
SELECT has_index('moderation', 'account_actions', 'idx_account_actions_report_id', ARRAY['report_id']);
SELECT has_index('moderation', 'report_audit', 'idx_report_audit_report_id', ARRAY['report_id']);
SELECT has_index('private', 'moderation_f0_reservations', 'idx_moderation_f0_reservations_job_id', ARRAY['job_id']);

-- The audit list's media_upload_batches(asset_id) / media_assets(upload_batch_id)
-- stay covered by their UNIQUE constraints.
SELECT has_index('public', 'media_upload_batches', 'media_upload_batches_asset_id_key', ARRAY['asset_id']);
SELECT has_index('public', 'media_assets', 'media_assets_upload_batch_id_key', ARRAY['upload_batch_id']);

-- Every single-column FK in public/moderation/private that this migration targets
-- now has a non-partial index leading with that column.
SELECT is_empty(
  $$
    SELECT c.conrelid::regclass::text || '.' || c.conname
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conname IN (
        'media_upload_recipients_nix_id_fkey', 'content_reports_nix_id_fkey',
        'content_reports_text_message_id_fkey', 'content_reports_reported_user_id_fkey',
        'moderation_jobs_batch_id_fkey', 'moderation_jobs_text_payload_id_fkey',
        'moderation_jobs_receiver_id_fkey', 'push_notification_jobs_recipient_id_fkey',
        'push_notification_jobs_actor_id_fkey', 'push_notification_deliveries_device_id_fkey',
        'snap_capture_prefs_friend_user_id_fkey', 'friend_invites_used_by_fkey',
        'upload_logs_receiver_id_fkey', 'conversation_read_states_peer_id_fkey',
        'conversation_mutes_peer_user_id_fkey', 'account_actions_report_id_fkey',
        'report_audit_report_id_fkey', 'moderation_f0_reservations_job_id_fkey',
        'media_upload_batches_asset_id_fkey', 'media_assets_upload_batch_id_fkey'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND i.indpred IS NULL
          AND i.indkey[0] = c.conkey[1]
      )
  $$,
  'targeted foreign keys are covered by a leading-column index'
);

-- Query indexes on nixes ---------------------------------------------------------
SELECT has_index('public', 'nixes', 'idx_nixes_pair_created_at', ARRAY['sender_id', 'receiver_id', 'created_at']);
SELECT ok(
  (SELECT (indoption[2] & 1) = 1 FROM pg_index WHERE indexrelid = 'public.idx_nixes_pair_created_at'::regclass),
  'idx_nixes_pair_created_at orders created_at DESC'
);
SELECT has_index('public', 'nixes', 'idx_nixes_active_receiver_sender_created_at', ARRAY['receiver_id', 'sender_id', 'created_at']);
SELECT is(
  (SELECT pg_get_expr(indpred, indrelid) FROM pg_index WHERE indexrelid = 'public.idx_nixes_active_receiver_sender_created_at'::regclass),
  '(status <> ALL (ARRAY[''cleaned''::text, ''cleanup_failed''::text]))',
  'unread index predicate matches the client queue filter and is implied by status = ''sent'''
);
SELECT has_index('public', 'nixes', 'idx_nixes_media_path', ARRAY['media_path']);

-- Redundant indexes are gone, their replacements stay -----------------------------
SELECT hasnt_index('public', 'nixes', 'idx_snaps_is_viewed');
SELECT hasnt_index('public', 'nixes', 'idx_snaps_receiver_id');
SELECT hasnt_index('public', 'nixes', 'idx_snaps_sender_id');
SELECT hasnt_index('public', 'message_reactions', 'message_reactions_message_id_idx');
SELECT hasnt_index('public', 'friendships', 'idx_friendships_user');
SELECT hasnt_index('public', 'nix_capture_prefs', 'idx_snap_capture_prefs_owner');
SELECT ok(
  to_regclass('public.idx_nixes_receiver_created_at') IS NOT NULL
  AND to_regclass('public.idx_nixes_sender_created_at') IS NOT NULL
  AND to_regclass('public.message_reactions_message_user_uniq') IS NOT NULL
  AND to_regclass('public.friendships_user_id_friend_id_key') IS NOT NULL
  AND to_regclass('public.snap_capture_prefs_pkey') IS NOT NULL,
  'composite indexes that cover the dropped prefixes are still present'
);

SELECT * FROM finish();
ROLLBACK;
