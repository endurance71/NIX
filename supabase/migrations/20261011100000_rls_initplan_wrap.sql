-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- RLS initPlan wrap (audit DB-9, 2026-10-11).
--
-- Policies that called auth.uid() / auth.role() /
-- private.is_account_restricted(auth.uid()) / private.pre_delivery_moderation_enabled()
-- directly were evaluated once per candidate row. Wrapping row-independent
-- calls in a scalar sub-select lets Postgres evaluate them once per statement
-- (InitPlan) — the pattern Supabase's `auth_rls_initplan` advisor asks for.
--
-- Every policy keeps its name, command, roles, permissive mode and the exact
-- same boolean logic; only the evaluation strategy changes. Calls whose
-- arguments depend on row columns (private.is_pair_blocked(sender_id, …),
-- private.is_account_restricted(user_id), public.can_send_text_message(…),
-- private.text_message_passes_safety_filter(body)) stay per-row on purpose.
--
-- friendships_insert / friendships_update, media_*, content_reports,
-- age_attestations, upload_logs_select, user_blocks and storage media-vault
-- policies already use (SELECT auth.uid()) and are not touched.
--
-- The two SECURITY DEFINER profile RPCs get the same treatment: the actor id
-- and the actor restriction check are computed once instead of per profile.
-- Signatures, return types, volatility, search_path and grants are unchanged
-- (CREATE OR REPLACE keeps the existing ACL).

-- app_installations -----------------------------------------------------------
DROP POLICY IF EXISTS app_installations_owner_select ON public.app_installations;
CREATE POLICY app_installations_owner_select
  ON public.app_installations FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- conversation_mutes ----------------------------------------------------------
DROP POLICY IF EXISTS conversation_mutes_owner ON public.conversation_mutes;
CREATE POLICY conversation_mutes_owner
  ON public.conversation_mutes FOR ALL
  TO authenticated
  USING (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

-- conversation_read_states ----------------------------------------------------
DROP POLICY IF EXISTS conversation_read_states_owner ON public.conversation_read_states;
CREATE POLICY conversation_read_states_owner
  ON public.conversation_read_states FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- data_export_jobs ------------------------------------------------------------
DROP POLICY IF EXISTS data_export_jobs_owner_select ON public.data_export_jobs;
CREATE POLICY data_export_jobs_owner_select
  ON public.data_export_jobs FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- friend_invites --------------------------------------------------------------
DROP POLICY IF EXISTS friend_invites_insert ON public.friend_invites;
CREATE POLICY friend_invites_insert
  ON public.friend_invites FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = created_by AND expires_at > now());

DROP POLICY IF EXISTS friend_invites_select ON public.friend_invites;
CREATE POLICY friend_invites_select
  ON public.friend_invites FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = created_by OR (SELECT auth.uid()) = used_by);

DROP POLICY IF EXISTS friend_invites_update ON public.friend_invites;
CREATE POLICY friend_invites_update
  ON public.friend_invites FOR UPDATE
  TO public
  USING ((SELECT auth.uid()) = used_by)
  WITH CHECK ((SELECT auth.uid()) = used_by);

-- friendships -----------------------------------------------------------------
DROP POLICY IF EXISTS friendships_delete ON public.friendships;
CREATE POLICY friendships_delete
  ON public.friendships FOR DELETE
  TO public
  USING ((SELECT auth.uid()) = user_id OR (SELECT auth.uid()) = friend_id);

DROP POLICY IF EXISTS friendships_select ON public.friendships;
CREATE POLICY friendships_select
  ON public.friendships FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = user_id OR (SELECT auth.uid()) = friend_id);

-- legal_acceptances -----------------------------------------------------------
DROP POLICY IF EXISTS legal_acceptances_insert_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_insert_own
  ON public.legal_acceptances FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS legal_acceptances_select_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_select_own
  ON public.legal_acceptances FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = user_id);

-- message_reactions -----------------------------------------------------------
DROP POLICY IF EXISTS message_reactions_delete ON public.message_reactions;
CREATE POLICY message_reactions_delete
  ON public.message_reactions FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS message_reactions_insert ON public.message_reactions;
CREATE POLICY message_reactions_insert
  ON public.message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.text_messages tm
      WHERE tm.id = message_reactions.message_id
        AND (tm.sender_id = (SELECT auth.uid()) OR tm.receiver_id = (SELECT auth.uid()))
        AND tm.expires_at > now()
        AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
    )
  );

DROP POLICY IF EXISTS message_reactions_select ON public.message_reactions;
CREATE POLICY message_reactions_select
  ON public.message_reactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.text_messages tm
      WHERE tm.id = message_reactions.message_id
        AND (tm.sender_id = (SELECT auth.uid()) OR tm.receiver_id = (SELECT auth.uid()))
        AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
    )
  );

DROP POLICY IF EXISTS message_reactions_update ON public.message_reactions;
CREATE POLICY message_reactions_update
  ON public.message_reactions FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.text_messages tm
      WHERE tm.id = message_reactions.message_id
        AND (tm.sender_id = (SELECT auth.uid()) OR tm.receiver_id = (SELECT auth.uid()))
        AND tm.expires_at > now()
        AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
    )
  );

-- nix_capture_prefs -----------------------------------------------------------
DROP POLICY IF EXISTS nix_capture_prefs_delete ON public.nix_capture_prefs;
CREATE POLICY nix_capture_prefs_delete
  ON public.nix_capture_prefs FOR DELETE
  TO public
  USING ((SELECT auth.uid()) = owner_user_id);

DROP POLICY IF EXISTS nix_capture_prefs_insert ON public.nix_capture_prefs;
CREATE POLICY nix_capture_prefs_insert
  ON public.nix_capture_prefs FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = owner_user_id);

DROP POLICY IF EXISTS nix_capture_prefs_select ON public.nix_capture_prefs;
CREATE POLICY nix_capture_prefs_select
  ON public.nix_capture_prefs FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = owner_user_id);

DROP POLICY IF EXISTS nix_capture_prefs_update ON public.nix_capture_prefs;
CREATE POLICY nix_capture_prefs_update
  ON public.nix_capture_prefs FOR UPDATE
  TO public
  USING ((SELECT auth.uid()) = owner_user_id)
  WITH CHECK ((SELECT auth.uid()) = owner_user_id);

-- nix_cleanup_queue -----------------------------------------------------------
DROP POLICY IF EXISTS nix_cleanup_queue_select ON public.nix_cleanup_queue;
CREATE POLICY nix_cleanup_queue_select
  ON public.nix_cleanup_queue FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = receiver_id);

-- nixes -----------------------------------------------------------------------
DROP POLICY IF EXISTS nixes_select ON public.nixes;
CREATE POLICY nixes_select
  ON public.nixes FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.uid()) = sender_id OR (SELECT auth.uid()) = receiver_id)
    AND NOT private.is_pair_blocked(sender_id, receiver_id)
    AND NOT (SELECT private.is_account_restricted((SELECT auth.uid())))
  );

-- notification_preferences ----------------------------------------------------
DROP POLICY IF EXISTS notification_preferences_owner ON public.notification_preferences;
CREATE POLICY notification_preferences_owner
  ON public.notification_preferences FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- product_analytics_preferences -----------------------------------------------
DROP POLICY IF EXISTS product_analytics_preferences_owner ON public.product_analytics_preferences;
CREATE POLICY product_analytics_preferences_owner
  ON public.product_analytics_preferences FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- profiles --------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete
  ON public.profiles FOR DELETE
  TO public
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert
  ON public.profiles FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select
  ON public.profiles FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = id);

-- No WITH CHECK on purpose: identical to the previous definition, where the
-- USING expression is also applied to the new row.
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update
  ON public.profiles FOR UPDATE
  TO public
  USING ((SELECT auth.uid()) = id);

-- text_messages ---------------------------------------------------------------
DROP POLICY IF EXISTS text_messages_insert ON public.text_messages;
CREATE POLICY text_messages_insert
  ON public.text_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT (SELECT private.pre_delivery_moderation_enabled())
    AND sender_id = (SELECT auth.uid())
    AND public.can_send_text_message(sender_id, receiver_id)
    AND private.text_message_passes_safety_filter(body)
  );

DROP POLICY IF EXISTS text_messages_select ON public.text_messages;
CREATE POLICY text_messages_select
  ON public.text_messages FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.uid()) = sender_id OR (SELECT auth.uid()) = receiver_id)
    AND NOT private.is_pair_blocked(sender_id, receiver_id)
  );

-- upload_logs -----------------------------------------------------------------
DROP POLICY IF EXISTS upload_logs_insert ON public.upload_logs;
CREATE POLICY upload_logs_insert
  ON public.upload_logs FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = sender_id);

-- user_activation_state -------------------------------------------------------
DROP POLICY IF EXISTS user_activation_state_owner ON public.user_activation_state;
CREATE POLICY user_activation_state_owner
  ON public.user_activation_state FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- storage.objects (avatars bucket) --------------------------------------------
-- auth.role() is kept (semantics unchanged), only wrapped like auth.uid().
DROP POLICY IF EXISTS avatars_storage_delete ON storage.objects;
CREATE POLICY avatars_storage_delete
  ON storage.objects FOR DELETE
  TO public
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.role()) = 'authenticated'
    AND split_part(name, '/', 1)::uuid = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS avatars_storage_insert ON storage.objects;
CREATE POLICY avatars_storage_insert
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.role()) = 'authenticated'
    AND split_part(name, '/', 1)::uuid = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS avatars_storage_update ON storage.objects;
CREATE POLICY avatars_storage_update
  ON storage.objects FOR UPDATE
  TO public
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.role()) = 'authenticated'
    AND split_part(name, '/', 1)::uuid = (SELECT auth.uid())
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.role()) = 'authenticated'
    AND split_part(name, '/', 1)::uuid = (SELECT auth.uid())
  );

-- SECURITY DEFINER profile RPCs ----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_profiles_by_ids(profile_ids uuid[])
RETURNS TABLE(id uuid, username text, display_name text, avatar_storage_path text, avatar_emoji text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.id = ANY(profile_ids)
    AND NOT (SELECT private.is_account_restricted((SELECT auth.uid())))
    AND p.username IS NOT NULL
    AND NOT private.is_pair_blocked((SELECT auth.uid()), p.id)
    AND NOT private.is_account_restricted(p.id)
  ORDER BY p.username ASC;
$$;

CREATE OR REPLACE FUNCTION public.list_accepted_friends_paginated(
  page_limit integer DEFAULT 50,
  before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_storage_path text,
  avatar_emoji text,
  friendship_created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH relations AS (
    SELECT CASE WHEN f.user_id = (SELECT auth.uid()) THEN f.friend_id ELSE f.user_id END AS friend_profile_id,
           f.created_at
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.user_id = (SELECT auth.uid()) OR f.friend_id = (SELECT auth.uid()))
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
  WHERE NOT (SELECT private.is_account_restricted((SELECT auth.uid())))
    AND p.username IS NOT NULL
    AND NOT private.is_pair_blocked((SELECT auth.uid()), p.id)
    AND NOT private.is_account_restricted(p.id)
  ORDER BY r.created_at DESC;
$$;
