-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Foreign-key and query indexes (audit DB-10, 2026-10-11).
--
-- Plain CREATE INDEX (not CONCURRENTLY): migrations run inside a transaction.
-- All affected tables are small at this stage, so the short SHARE lock taken
-- while each index builds is acceptable.
--
-- Every index below was checked against pg_index on a fully migrated local
-- database: none of these columns is the leading column of an existing index.
-- media_upload_batches(asset_id) and media_assets(upload_batch_id) from the
-- audit list are already covered by their UNIQUE constraints and are skipped.

-- 1) Covering indexes for foreign keys -----------------------------------------
-- Without them, deleting / updating the referenced row (account deletion,
-- nix cleanup, moderation removal, push device pruning) scans the child table.

CREATE INDEX IF NOT EXISTS idx_media_upload_recipients_nix_id
  ON public.media_upload_recipients (nix_id);

CREATE INDEX IF NOT EXISTS idx_content_reports_nix_id
  ON public.content_reports (nix_id);

CREATE INDEX IF NOT EXISTS idx_content_reports_text_message_id
  ON public.content_reports (text_message_id);

CREATE INDEX IF NOT EXISTS idx_content_reports_reported_user_id
  ON public.content_reports (reported_user_id);

CREATE INDEX IF NOT EXISTS idx_moderation_jobs_batch_id
  ON public.moderation_jobs (batch_id);

CREATE INDEX IF NOT EXISTS idx_moderation_jobs_text_payload_id
  ON public.moderation_jobs (text_payload_id);

CREATE INDEX IF NOT EXISTS idx_moderation_jobs_receiver_id
  ON public.moderation_jobs (receiver_id);

CREATE INDEX IF NOT EXISTS idx_push_notification_jobs_recipient_id
  ON public.push_notification_jobs (recipient_id);

CREATE INDEX IF NOT EXISTS idx_push_notification_jobs_actor_id
  ON public.push_notification_jobs (actor_id);

CREATE INDEX IF NOT EXISTS idx_push_notification_deliveries_device_id
  ON public.push_notification_deliveries (device_id);

CREATE INDEX IF NOT EXISTS idx_nix_capture_prefs_friend_user_id
  ON public.nix_capture_prefs (friend_user_id);

CREATE INDEX IF NOT EXISTS idx_friend_invites_used_by
  ON public.friend_invites (used_by);

CREATE INDEX IF NOT EXISTS idx_upload_logs_receiver_id
  ON public.upload_logs (receiver_id);

CREATE INDEX IF NOT EXISTS idx_conversation_read_states_peer_id
  ON public.conversation_read_states (peer_id);

CREATE INDEX IF NOT EXISTS idx_conversation_mutes_peer_user_id
  ON public.conversation_mutes (peer_user_id);

CREATE INDEX IF NOT EXISTS idx_account_actions_report_id
  ON moderation.account_actions (report_id);

CREATE INDEX IF NOT EXISTS idx_report_audit_report_id
  ON moderation.report_audit (report_id);

CREATE INDEX IF NOT EXISTS idx_moderation_f0_reservations_job_id
  ON private.moderation_f0_reservations (job_id);

-- 2) Query indexes on public.nixes ---------------------------------------------

-- Chat history (fetchChatNixEvents): (sender, receiver) pair OR the reverse
-- pair, newest first. Each OR arm becomes an exact pair range.
CREATE INDEX IF NOT EXISTS idx_nixes_pair_created_at
  ON public.nixes (sender_id, receiver_id, created_at DESC);

-- Unread / not-yet-cleaned NiX set. One partial index serves both readers:
--   get_unread_inbox_count_for_user: receiver_id = $1 AND is_viewed IS NOT TRUE AND status = 'sent'
--   fetchUnreadInboxQueueFromSender: receiver_id = $1 AND sender_id = $2 AND is_viewed = false
--                                    AND status NOT IN ('cleaned', 'cleanup_failed')
--                                    ORDER BY created_at
-- The predicate is on status only, on purpose: status = 'sent' implies
-- NOT IN ('cleaned', 'cleanup_failed'), and the second query states it
-- verbatim, so the planner proves the predicate for both. Postgres 17 cannot
-- prove `is_viewed IS NOT TRUE` from `is_viewed = false` (verified with
-- EXPLAIN), so is_viewed stays a cheap recheck filter instead of being part
-- of the predicate. Viewed NiX leave the set once cleanup marks them
-- 'cleaned' (replay window is 10 minutes), so the index stays small.
CREATE INDEX IF NOT EXISTS idx_nixes_active_receiver_sender_created_at
  ON public.nixes (receiver_id, sender_id, created_at)
  WHERE status NOT IN ('cleaned', 'cleanup_failed');

-- storage_select policy on storage.objects (n.media_path = objects.name) and
-- the shared-media checks in request/prepare_nix_cleanup look nixes up by path.
CREATE INDEX IF NOT EXISTS idx_nixes_media_path
  ON public.nixes (media_path);

-- 3) Redundant indexes ---------------------------------------------------------
-- Each one is a strict leading-column prefix of another btree index on the same
-- table (or, for is_viewed, a low-selectivity boolean index that no query uses
-- on its own), so it only costs write amplification.

-- (is_viewed): every reader also filters by id or receiver_id; superseded by
-- idx_nixes_active_receiver_sender_created_at.
DROP INDEX IF EXISTS public.idx_snaps_is_viewed;
-- (receiver_id): prefix of idx_nixes_receiver_created_at (receiver_id, created_at DESC).
DROP INDEX IF EXISTS public.idx_snaps_receiver_id;
-- (sender_id): prefix of idx_nixes_sender_created_at (sender_id, created_at DESC).
DROP INDEX IF EXISTS public.idx_snaps_sender_id;
-- (message_id): prefix of UNIQUE message_reactions_message_user_uniq (message_id, user_id).
DROP INDEX IF EXISTS public.message_reactions_message_id_idx;
-- (user_id): prefix of UNIQUE friendships_user_id_friend_id_key (user_id, friend_id).
DROP INDEX IF EXISTS public.idx_friendships_user;
-- (owner_user_id): prefix of snap_capture_prefs_pkey (owner_user_id, friend_user_id).
DROP INDEX IF EXISTS public.idx_snap_capture_prefs_owner;
