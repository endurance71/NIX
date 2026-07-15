BEGIN;

-- Compatibility rollback for a safety rollout regression. It intentionally
-- preserves all moderation tables, evidence and audit records.
UPDATE private.safety_policy_config
SET age_gate_mode = 'cohort', updated_at = NOW()
WHERE singleton;

DELETE FROM private.safety_policy_cohort
WHERE user_id IS NOT NULL;

-- Temporarily disable pair blocking while preserving global moderation actions.
CREATE OR REPLACE FUNCTION private.is_pair_blocked(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT FALSE; $$;

CREATE OR REPLACE FUNCTION private.is_account_restricted(target_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM moderation.account_actions a
    WHERE a.target_user_id = target_user
      AND a.revoked_at IS NULL
      AND a.action IN ('suspension', 'ban')
      AND (a.action = 'ban' OR a.expires_at > NOW())
  );
$$;

-- Restore the pre-rollout RLS surface for the legacy client.
DROP POLICY IF EXISTS nixes_select ON public.nixes;
CREATE POLICY nixes_select ON public.nixes FOR SELECT TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS nixes_update_viewed ON public.nixes;
CREATE POLICY nixes_update_viewed ON public.nixes FOR UPDATE TO authenticated
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);

DROP POLICY IF EXISTS friendships_insert ON public.friendships;
CREATE POLICY friendships_insert ON public.friendships FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND user_id <> friend_id
  AND (
    SELECT COUNT(*) FROM public.friendships f
    WHERE f.user_id = auth.uid() AND f.created_at > NOW() - INTERVAL '1 hour'
  ) < 30
);

DROP POLICY IF EXISTS friendships_update ON public.friendships;
CREATE POLICY friendships_update ON public.friendships FOR UPDATE TO authenticated
USING (auth.uid() = friend_id)
WITH CHECK (auth.uid() = friend_id);

DROP POLICY IF EXISTS upload_logs_select ON public.upload_logs;
CREATE POLICY upload_logs_select ON public.upload_logs FOR SELECT TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS storage_select ON storage.objects;
CREATE POLICY storage_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'media-vault'
  AND EXISTS (
    SELECT 1 FROM public.nixes n
    WHERE n.media_path = storage.objects.name
      AND (n.sender_id = auth.uid() OR n.receiver_id = auth.uid())
  )
);

DROP POLICY IF EXISTS avatars_storage_select ON storage.objects;
CREATE POLICY avatars_storage_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    split_part(name, '/', 1)::UUID = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.user_id = auth.uid() AND f.friend_id = split_part(storage.objects.name, '/', 1)::UUID)
          OR (f.friend_id = auth.uid() AND f.user_id = split_part(storage.objects.name, '/', 1)::UUID))
    )
    OR EXISTS (
      SELECT 1 FROM public.nixes n
      WHERE (n.sender_id = auth.uid() AND n.receiver_id = split_part(storage.objects.name, '/', 1)::UUID)
         OR (n.receiver_id = auth.uid() AND n.sender_id = split_part(storage.objects.name, '/', 1)::UUID)
    )
    OR EXISTS (
      SELECT 1 FROM public.friend_invites fi
      WHERE fi.created_by = split_part(storage.objects.name, '/', 1)::UUID
        AND fi.previewed_by = auth.uid()
        AND fi.used_at IS NULL
        AND fi.expires_at > NOW()
    )
  )
);

COMMIT;
