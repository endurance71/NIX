-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Chat: reply to a message, edit and unsend (2026-10-14).
--
-- 1) Reply: text_messages.reply_to_message_id quotes an earlier message of the SAME conversation
--    (either direction). An invalid target (another conversation, unknown id) is stored as NULL,
--    like reply_to_nix_id: the reply context is a nicety and never blocks delivery. ON DELETE SET
--    NULL: when the quoted message expires or is unsent the quote simply disappears.
--
-- 2) Edit (sender only, text only, within 15 minutes of sending, at most 5 times). With
--    pre-delivery moderation ON the new body goes through the same moderation queue as a new text
--    (moderation_jobs.is_edit + edit_of_message_id); materialize_approved_text_message then updates
--    the message instead of inserting one. With moderation OFF the edit is applied at once.
--    Every applied edit keeps the previous body in public.text_message_edits (no client access,
--    deleted with the message) so a report still shows what the receiver originally read.
--    Both participants get a `message_edited` broadcast on their private user topic.
--
-- 3) Unsend (sender only, text or voice, within 5 minutes of sending): deletes the message. The
--    existing DELETE triggers broadcast `messages_removed` to both participants and queue the voice
--    object for deletion; a push that has not gone out yet is skipped.
--
-- Backward compatibility: enqueue_own_text_moderation_job and fetch_text_messages_with_peer change
-- signature / return type (drop + create with grants restored, trailing parameters DEFAULT NULL,
-- extra trailing columns). Shipped clients call with named args and ignore extra columns.

-- 1) Columns ------------------------------------------------------------------------------------

ALTER TABLE public.text_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID NULL
    REFERENCES public.text_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS edit_count SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.text_messages
  DROP CONSTRAINT IF EXISTS text_messages_edit_count_chk,
  ADD CONSTRAINT text_messages_edit_count_chk CHECK (edit_count BETWEEN 0 AND 5),
  DROP CONSTRAINT IF EXISTS text_messages_edited_pair_chk,
  ADD CONSTRAINT text_messages_edited_pair_chk CHECK ((edited_at IS NULL) = (edit_count = 0));

COMMENT ON COLUMN public.text_messages.reply_to_message_id IS
  'Earlier message of the same conversation this message quotes (validated by trigger private.validate_text_message_reply_to_message; invalid values are stored as NULL). SET NULL when the quoted message is deleted.';
COMMENT ON COLUMN public.text_messages.edited_at IS
  'Last time the sender edited the body (edit_own_text_message); NULL when never edited.';
COMMENT ON COLUMN public.text_messages.edit_count IS
  'Number of applied edits (at most 5).';

-- FK action support (expiry deletes messages in bulk); equality implies NOT NULL.
CREATE INDEX IF NOT EXISTS idx_text_messages_reply_to_message_id
  ON public.text_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

ALTER TABLE public.moderation_jobs
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID NULL
    REFERENCES public.text_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_edit BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_of_message_id UUID NULL
    REFERENCES public.text_messages(id) ON DELETE SET NULL;

ALTER TABLE public.moderation_jobs
  DROP CONSTRAINT IF EXISTS moderation_jobs_edit_text_chk,
  ADD CONSTRAINT moderation_jobs_edit_text_chk CHECK (NOT is_edit OR content_kind = 'text');

COMMENT ON COLUMN public.moderation_jobs.reply_to_message_id IS
  'Text jobs only: validated quoted message carried to text_messages.reply_to_message_id by materialize_approved_text_message.';
COMMENT ON COLUMN public.moderation_jobs.is_edit IS
  'Text jobs only: the payload is a new body for edit_of_message_id, not a new message.';
COMMENT ON COLUMN public.moderation_jobs.edit_of_message_id IS
  'Edit jobs only: the message to update. NULL once the message is gone (the edit is then dropped).';

CREATE INDEX IF NOT EXISTS idx_moderation_jobs_reply_to_message_id
  ON public.moderation_jobs (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_jobs_edit_of_message_id
  ON public.moderation_jobs (edit_of_message_id, created_at DESC)
  WHERE edit_of_message_id IS NOT NULL;

-- Previous bodies of edited messages: moderation evidence only (service role), never shown in the
-- app. Lives exactly as long as the message.
CREATE TABLE IF NOT EXISTS public.text_message_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.text_messages(id) ON DELETE CASCADE,
  previous_body TEXT NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_text_message_edits_message_id
  ON public.text_message_edits (message_id, edited_at);

ALTER TABLE public.text_message_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.text_message_edits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.text_message_edits TO service_role;

COMMENT ON TABLE public.text_message_edits IS
  'Bodies a sender replaced by editing (evidence for reports). No client access; cascades with the message.';

-- A client inserting directly (moderation OFF) must not claim an edit.
ALTER POLICY text_messages_insert ON public.text_messages
  WITH CHECK (
    (NOT (SELECT private.pre_delivery_moderation_enabled()))
    AND sender_id = (SELECT auth.uid())
    AND public.can_send_text_message(sender_id, receiver_id)
    AND private.text_message_passes_safety_filter(body)
    AND saved_at IS NULL
    AND saved_by IS NULL
    AND expires_at <= now() + interval '24 hours'
    AND kind = 'text'
    AND voice_path IS NULL
    AND read_at IS NULL
    AND edited_at IS NULL
    AND edit_count = 0
  );

-- 2) Reply validation ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_valid_text_reply_message(
  p_text_sender_id UUID,
  p_text_receiver_id UUID,
  p_message_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_message_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.text_messages tm
      WHERE tm.id = p_message_id
        AND tm.expires_at > now()
        AND (
          (tm.sender_id = p_text_sender_id AND tm.receiver_id = p_text_receiver_id)
          OR (tm.sender_id = p_text_receiver_id AND tm.receiver_id = p_text_sender_id)
        )
    );
$$;

REVOKE ALL ON FUNCTION private.is_valid_text_reply_message(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_valid_text_reply_message(UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION private.validate_text_message_reply_to_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.reply_to_message_id IS NOT NULL
    AND (
      NEW.reply_to_message_id = NEW.id
      OR NOT private.is_valid_text_reply_message(NEW.sender_id, NEW.receiver_id, NEW.reply_to_message_id)
    )
  THEN
    NEW.reply_to_message_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_text_message_reply_to_message() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS validate_text_message_reply_to_message ON public.text_messages;
CREATE TRIGGER validate_text_message_reply_to_message
  BEFORE INSERT OR UPDATE OF reply_to_message_id ON public.text_messages
  FOR EACH ROW
  WHEN (NEW.reply_to_message_id IS NOT NULL)
  EXECUTE FUNCTION private.validate_text_message_reply_to_message();

-- 3) Edit helpers -------------------------------------------------------------------------------

-- Tells both participants' open apps to refetch the conversation. Never fails the caller.
CREATE OR REPLACE FUNCTION private.broadcast_text_message_edited(
  p_message_id UUID,
  p_sender_id UUID,
  p_receiver_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('v', 1, 'message_id', p_message_id, 'peer_id', p_receiver_id),
      'message_edited',
      'user:' || p_sender_id::text,
      true
    );
    PERFORM realtime.send(
      jsonb_build_object('v', 1, 'message_id', p_message_id, 'peer_id', p_sender_id),
      'message_edited',
      'user:' || p_receiver_id::text,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast_text_message_edited skipped: % (%)', SQLERRM, SQLSTATE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_text_message_edited(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Applies one edit: keeps the previous body, bumps edited_at / edit_count, broadcasts. Returns
-- false when the message is gone, not the sender's text, or out of edits.
CREATE OR REPLACE FUNCTION private.apply_text_message_edit(
  p_message_id UUID,
  p_sender_id UUID,
  p_body TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.text_messages%ROWTYPE;
BEGIN
  SELECT *
  INTO target
  FROM public.text_messages
  WHERE id = p_message_id
  FOR UPDATE;

  IF NOT FOUND
    OR target.sender_id IS DISTINCT FROM p_sender_id
    OR target.kind <> 'text'
    OR target.is_system
    OR target.expires_at <= now()
    OR target.edit_count >= 5
  THEN
    RETURN false;
  END IF;
  IF target.body = p_body THEN
    RETURN true;
  END IF;

  INSERT INTO public.text_message_edits (message_id, previous_body)
  VALUES (target.id, target.body);

  UPDATE public.text_messages
  SET body = p_body,
      edited_at = now(),
      edit_count = target.edit_count + 1
  WHERE id = target.id;

  PERFORM private.broadcast_text_message_edited(target.id, target.sender_id, target.receiver_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_text_message_edit(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- 4) edit_own_text_message ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.edit_own_text_message(p_message_id UUID, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  target public.text_messages%ROWTYPE;
  new_body TEXT := btrim(COALESCE(p_body, ''));
  payload_id UUID;
  job_id UUID;
  stale RECORD;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT *
  INTO target
  FROM public.text_messages
  WHERE id = p_message_id
    AND sender_id = actor_id
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF target.kind <> 'text' OR target.is_system THEN
    RAISE EXCEPTION 'NOT_EDITABLE';
  END IF;
  IF target.created_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'EDIT_WINDOW_CLOSED';
  END IF;
  IF target.edit_count >= 5 THEN
    RAISE EXCEPTION 'EDIT_LIMIT_REACHED';
  END IF;
  IF char_length(new_body) < 1 OR char_length(new_body) > 2000 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF new_body = target.body THEN
    RETURN jsonb_build_object('status', 'unchanged', 'messageId', target.id);
  END IF;
  IF NOT public.can_send_text_message(actor_id, target.receiver_id) THEN
    RAISE EXCEPTION 'NOT_FRIEND';
  END IF;
  IF NOT private.text_message_passes_safety_filter(new_body) THEN
    RAISE EXCEPTION 'CONTENT_NOT_ALLOWED';
  END IF;

  IF NOT private.pre_delivery_moderation_enabled() THEN
    PERFORM private.apply_text_message_edit(target.id, actor_id, new_body);
    RETURN jsonb_build_object('status', 'applied', 'messageId', target.id);
  END IF;

  -- A newer edit supersedes queued ones that no worker has claimed yet.
  FOR stale IN
    SELECT j.id, j.text_payload_id
    FROM public.moderation_jobs j
    WHERE j.edit_of_message_id = target.id
      AND j.is_edit
      AND j.status = 'pending'
    FOR UPDATE
  LOOP
    UPDATE public.moderation_jobs
    SET status = 'error',
        decision = 'error',
        last_error = 'superseded_by_newer_edit',
        completed_at = now(),
        updated_at = now(),
        lease_owner = NULL,
        lease_expires_at = NULL
    WHERE id = stale.id;
    IF stale.text_payload_id IS NOT NULL THEN
      DELETE FROM public.moderation_text_payloads WHERE id = stale.text_payload_id;
    END IF;
  END LOOP;

  INSERT INTO public.moderation_text_payloads (body)
  VALUES (new_body)
  RETURNING id INTO payload_id;

  INSERT INTO public.moderation_jobs (
    content_kind,
    text_payload_id,
    sender_id,
    receiver_id,
    is_edit,
    edit_of_message_id,
    status
  )
  VALUES (
    'text',
    payload_id,
    actor_id,
    target.receiver_id,
    true,
    target.id,
    'pending'
  )
  RETURNING id INTO job_id;

  RETURN jsonb_build_object('status', 'pending', 'jobId', job_id, 'messageId', target.id);
END;
$$;

REVOKE ALL ON FUNCTION public.edit_own_text_message(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_own_text_message(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.edit_own_text_message(UUID, TEXT) IS
  'Sender edits own text within 15 minutes (max 5 edits). Moderation ON: queues an edit job ({status: pending, jobId}); OFF: applies at once ({status: applied}).';

-- 5) unsend_own_text_message --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unsend_own_text_message(p_message_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  target public.text_messages%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT *
  INTO target
  FROM public.text_messages
  WHERE id = p_message_id
    AND sender_id = actor_id
  FOR UPDATE;

  IF NOT FOUND OR target.expires_at <= now() THEN
    RETURN 'not_found';
  END IF;
  IF target.is_system THEN
    RAISE EXCEPTION 'NOT_EDITABLE';
  END IF;
  IF target.created_at < now() - interval '5 minutes' THEN
    RETURN 'window_closed';
  END IF;

  -- Not delivered yet: do not let the push show a message that no longer exists.
  UPDATE public.push_notification_jobs
  SET status = 'skipped',
      last_error = 'unsent_by_sender',
      updated_at = now()
  WHERE event_key = 'new_text_message:' || target.id::text
    AND status IN ('pending', 'failed');

  -- Pending edits of this message become no-ops (edit_of_message_id is SET NULL by the FK).
  DELETE FROM public.text_messages WHERE id = target.id;

  RETURN 'unsent';
END;
$$;

REVOKE ALL ON FUNCTION public.unsend_own_text_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unsend_own_text_message(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.unsend_own_text_message(UUID) IS
  'Sender deletes own text or voice message within 5 minutes of sending: unsent | window_closed | not_found.';

-- 6) Moderation path ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.enqueue_own_text_moderation_job(UUID, TEXT, TEXT, UUID);

CREATE FUNCTION public.enqueue_own_text_moderation_job(
  p_receiver_id UUID,
  p_body TEXT,
  p_client_message_id TEXT DEFAULT NULL,
  p_reply_to_nix_id UUID DEFAULT NULL,
  p_reply_to_message_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  payload_id UUID;
  job_id UUID;
  existing public.moderation_jobs%ROWTYPE;
  reply_nix_id UUID;
  reply_message_id UUID;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF NOT private.pre_delivery_moderation_enabled() THEN
    RAISE EXCEPTION 'MODERATION_DISABLED';
  END IF;
  IF NOT public.can_send_text_message(actor_id, p_receiver_id) THEN
    RAISE EXCEPTION 'NOT_FRIEND';
  END IF;
  IF NOT private.text_message_passes_safety_filter(p_body) THEN
    RAISE EXCEPTION 'CONTENT_NOT_ALLOWED';
  END IF;

  IF p_client_message_id IS NOT NULL THEN
    SELECT *
    INTO existing
    FROM public.moderation_jobs
    WHERE sender_id = actor_id
      AND receiver_id = p_receiver_id
      AND client_message_id = p_client_message_id
      AND content_kind = 'text'
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'jobId', existing.id,
        'status', existing.status,
        'decision', existing.decision
      );
    END IF;
  END IF;

  -- Invalid reply targets never fail the send; they are dropped.
  reply_nix_id := CASE
    WHEN private.is_valid_text_reply_nix(actor_id, p_receiver_id, p_reply_to_nix_id)
      THEN p_reply_to_nix_id
    ELSE NULL
  END;
  reply_message_id := CASE
    WHEN private.is_valid_text_reply_message(actor_id, p_receiver_id, p_reply_to_message_id)
      THEN p_reply_to_message_id
    ELSE NULL
  END;

  INSERT INTO public.moderation_text_payloads(body)
  VALUES (p_body)
  RETURNING id INTO payload_id;

  INSERT INTO public.moderation_jobs (
    content_kind,
    text_payload_id,
    sender_id,
    receiver_id,
    client_message_id,
    reply_to_nix_id,
    reply_to_message_id,
    status
  )
  VALUES (
    'text',
    payload_id,
    actor_id,
    p_receiver_id,
    p_client_message_id,
    reply_nix_id,
    reply_message_id,
    'pending'
  )
  RETURNING id INTO job_id;

  RETURN jsonb_build_object(
    'jobId', job_id,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_own_text_moderation_job(UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_own_text_moderation_job(UUID, TEXT, TEXT, UUID, UUID)
  TO authenticated, service_role;

-- Same signature; an edit job updates its message, a send job also carries the quoted message.
CREATE OR REPLACE FUNCTION public.materialize_approved_text_message(p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_job public.moderation_jobs%ROWTYPE;
  payload_body TEXT;
  inserted_id UUID;
BEGIN
  SELECT *
  INTO selected_job
  FROM public.moderation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND OR selected_job.content_kind <> 'text' THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;
  IF selected_job.status <> 'approved' THEN
    RAISE EXCEPTION 'JOB_NOT_APPROVED';
  END IF;

  IF selected_job.is_edit THEN
    IF selected_job.materialized_at IS NOT NULL THEN
      RETURN selected_job.edit_of_message_id;
    END IF;

    SELECT body
    INTO payload_body
    FROM public.moderation_text_payloads
    WHERE id = selected_job.text_payload_id;

    -- The message is gone (unsent / expired) or a newer edit is queued or already applied: drop
    -- this one. A newer edit that ends up rejected leaves the message as it was before both.
    IF payload_body IS NOT NULL
      AND selected_job.edit_of_message_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.moderation_jobs newer
        WHERE newer.edit_of_message_id = selected_job.edit_of_message_id
          AND newer.is_edit
          AND newer.created_at > selected_job.created_at
          AND newer.status IN ('pending', 'processing', 'approved')
      )
    THEN
      PERFORM private.apply_text_message_edit(
        selected_job.edit_of_message_id,
        selected_job.sender_id,
        payload_body
      );
    END IF;

    UPDATE public.moderation_jobs
    SET materialized_at = NOW(),
        updated_at = NOW()
    WHERE id = p_job_id;

    IF selected_job.text_payload_id IS NOT NULL THEN
      DELETE FROM public.moderation_text_payloads
      WHERE id = selected_job.text_payload_id;
    END IF;

    RETURN selected_job.edit_of_message_id;
  END IF;

  IF selected_job.materialized_at IS NOT NULL THEN
    SELECT tm.id
    INTO inserted_id
    FROM public.text_messages tm
    WHERE tm.sender_id = selected_job.sender_id
      AND tm.receiver_id = selected_job.receiver_id
      AND (
        (
          selected_job.client_message_id IS NOT NULL
          AND tm.client_message_id = selected_job.client_message_id
        )
        OR (
          selected_job.client_message_id IS NULL
          AND tm.created_at >= selected_job.created_at
        )
      )
    ORDER BY tm.created_at DESC
    LIMIT 1;
    RETURN inserted_id;
  END IF;

  SELECT body
  INTO payload_body
  FROM public.moderation_text_payloads
  WHERE id = selected_job.text_payload_id;

  IF payload_body IS NULL THEN
    RAISE EXCEPTION 'PAYLOAD_NOT_FOUND';
  END IF;

  INSERT INTO public.text_messages (
    sender_id,
    receiver_id,
    body,
    client_message_id,
    reply_to_nix_id,
    reply_to_message_id
  )
  VALUES (
    selected_job.sender_id,
    selected_job.receiver_id,
    payload_body,
    selected_job.client_message_id,
    selected_job.reply_to_nix_id,
    selected_job.reply_to_message_id
  )
  ON CONFLICT (sender_id, receiver_id, client_message_id)
    WHERE client_message_id IS NOT NULL
  DO UPDATE SET body = EXCLUDED.body
  RETURNING id INTO inserted_id;

  UPDATE public.moderation_jobs
  SET materialized_at = NOW(),
      updated_at = NOW()
  WHERE id = p_job_id;

  DELETE FROM public.moderation_text_payloads
  WHERE id = selected_job.text_payload_id;

  RETURN inserted_id;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_approved_text_message(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_approved_text_message(UUID) TO service_role;

-- Same signature and send-job behaviour as 20260912150000; adds the edit-job case.
CREATE OR REPLACE FUNCTION public.get_own_text_moderation_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  selected public.moderation_jobs%ROWTYPE;
  delivered_id UUID;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  SELECT *
  INTO selected
  FROM public.moderation_jobs
  WHERE id = p_job_id
    AND content_kind = 'text';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;
  IF selected.sender_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- A send job reports its message as soon as it exists (20260912150000); an edit job reports
  -- the edited message only once the edit has been applied.
  IF selected.status = 'approved' THEN
    IF selected.is_edit THEN
      delivered_id := CASE WHEN selected.materialized_at IS NULL THEN NULL ELSE selected.edit_of_message_id END;
    ELSE
      SELECT tm.id
      INTO delivered_id
      FROM public.text_messages tm
      WHERE tm.sender_id = selected.sender_id
        AND tm.receiver_id = selected.receiver_id
        AND (
          (
            selected.client_message_id IS NOT NULL
            AND tm.client_message_id = selected.client_message_id
          )
          OR (
            selected.client_message_id IS NULL
            AND tm.created_at >= selected.created_at
          )
        )
      ORDER BY tm.created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'jobId', selected.id,
    'status', selected.status,
    'decision', selected.decision,
    'messageId', delivered_id,
    'isEdit', selected.is_edit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_own_text_moderation_job(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_text_moderation_job(UUID) TO authenticated, service_role;

-- 7) Chat read path -----------------------------------------------------------------------------

-- The quoted message is in the same conversation (trigger above) and still unexpired, so the
-- preview columns expose nothing the reader cannot already fetch.
DROP FUNCTION IF EXISTS public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INTEGER);

CREATE FUNCTION public.fetch_text_messages_with_peer(
  peer_id UUID,
  before_created_at TIMESTAMPTZ DEFAULT NULL,
  msg_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  receiver_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  client_message_id TEXT,
  metadata JSONB,
  is_system BOOLEAN,
  read_at TIMESTAMPTZ,
  saved_at TIMESTAMPTZ,
  saved_by UUID,
  kind TEXT,
  voice_path TEXT,
  voice_duration_ms INTEGER,
  voice_waveform SMALLINT[],
  reply_to_nix_id UUID,
  reply_to_nix_media_type TEXT,
  edited_at TIMESTAMPTZ,
  reply_to_message_id UUID,
  reply_to_message_sender_id UUID,
  reply_to_message_kind TEXT,
  reply_to_message_body TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tm.id, tm.sender_id, tm.receiver_id, tm.body, tm.created_at, tm.expires_at,
         tm.client_message_id, tm.metadata, tm.is_system, tm.read_at, tm.saved_at, tm.saved_by,
         tm.kind, tm.voice_path, tm.voice_duration_ms, tm.voice_waveform,
         tm.reply_to_nix_id, rn.media_type AS reply_to_nix_media_type,
         tm.edited_at,
         rm.id AS reply_to_message_id,
         rm.sender_id AS reply_to_message_sender_id,
         rm.kind AS reply_to_message_kind,
         CASE WHEN rm.kind = 'text' THEN left(rm.body, 200) END AS reply_to_message_body
  FROM public.text_messages tm
  LEFT JOIN public.nixes rn ON rn.id = tm.reply_to_nix_id
  LEFT JOIN public.text_messages rm
    ON rm.id = tm.reply_to_message_id
   AND rm.expires_at > now()
  WHERE
    ((tm.sender_id = (SELECT auth.uid()) AND tm.receiver_id = peer_id)
      OR (tm.receiver_id = (SELECT auth.uid()) AND tm.sender_id = peer_id))
    AND tm.expires_at > now()
    AND NOT private.is_pair_blocked((SELECT auth.uid()), peer_id)
    AND (before_created_at IS NULL OR tm.created_at < before_created_at)
  ORDER BY tm.created_at DESC
  LIMIT LEAST(COALESCE(msg_limit, 50), 100);
$$;

REVOKE ALL ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INTEGER)
  TO authenticated, service_role;

-- 8) Capabilities -------------------------------------------------------------------------------

-- Clients show Reply / Edit / Unsend only on backends that announce them.
CREATE OR REPLACE FUNCTION public.get_chat_capabilities()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'v', 1,
    'saved_messages', TRUE,
    'voice_messages', TRUE,
    'message_replies', TRUE,
    'message_edits', TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.get_chat_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_capabilities() TO authenticated, service_role;
