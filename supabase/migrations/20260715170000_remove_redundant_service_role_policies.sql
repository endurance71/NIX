-- The service_role bypasses RLS by design. Policies that explicitly test for
-- service_role are therefore redundant and increase the impact of a malformed
-- or incorrectly trusted JWT. Keep client access scoped only to authenticated
-- ownership rules while preserving all server-side maintenance operations.

DROP POLICY IF EXISTS friend_invites_update ON public.friend_invites;
CREATE POLICY friend_invites_update
  ON public.friend_invites
  FOR UPDATE
  USING (auth.uid() = used_by)
  WITH CHECK (auth.uid() = used_by);

DROP POLICY IF EXISTS nix_cleanup_audit_insert ON public.nix_cleanup_audit;
DROP POLICY IF EXISTS nix_cleanup_audit_select ON public.nix_cleanup_audit;

DROP POLICY IF EXISTS nix_cleanup_queue_delete ON public.nix_cleanup_queue;
CREATE POLICY nix_cleanup_queue_delete
  ON public.nix_cleanup_queue
  FOR DELETE
  USING (auth.uid() = receiver_id);

DROP POLICY IF EXISTS upload_logs_delete ON public.upload_logs;
DROP POLICY IF EXISTS storage_delete ON storage.objects;

-- Repair RPCs left behind by the snaps -> nixes rename. The baseline mirrors
-- the linked schema, so these replacements must live in an applied migration
-- to fix both fresh databases and the existing project.
CREATE OR REPLACE FUNCTION public.delete_my_conversation_with_peer(peer_profile_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF peer_profile_id IS NULL OR peer_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid peer id';
  END IF;

  DELETE FROM public.nixes n
  WHERE
    (n.sender_id = auth.uid() AND n.receiver_id = peer_profile_id)
    OR (n.receiver_id = auth.uid() AND n.sender_id = peer_profile_id);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN COALESCE(deleted_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_capture_policy_for_sender(sender_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT prefs.capture_policy
      FROM public.nix_capture_prefs AS prefs
      WHERE prefs.owner_user_id = auth.uid()
        AND prefs.friend_user_id = sender_id
      LIMIT 1
    ),
    'deny'
  );
$$;
