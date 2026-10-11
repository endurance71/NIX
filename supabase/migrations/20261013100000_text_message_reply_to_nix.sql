-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Text replies to a NiX (photo/video), 2026-10-13.
--
-- The NiX viewer's reply field and the notification "Reply" action send a text that answers one
-- NiX. The chat shows that text with a quoted "reply to a NiX" header, so the text records which
-- NiX it answers: text_messages.reply_to_nix_id.
--
-- Valid reply target: a NiX the text's SENDER received from the text's RECEIVER
-- (nixes.sender_id = text.receiver_id AND nixes.receiver_id = text.sender_id). Anything else
-- (someone else's NiX, my own sent NiX, a NiX already deleted) is silently stored as NULL instead
-- of rejecting the text: the reply context is a nicety, the text itself must still be delivered,
-- and a NULL never tells the caller anything about other users' NiXes.
--
-- Both delivery paths carry it:
--   * pre-delivery moderation ON: enqueue_own_text_moderation_job(..., p_reply_to_nix_id) stores it
--     on the job (moderation_jobs.reply_to_nix_id); materialize_approved_text_message copies it into
--     text_messages. The moderation worker calls materialize by job id only, so it needs no change.
--   * moderation OFF: the client inserts text_messages directly (RLS policy text_messages_insert).
-- One BEFORE trigger on text_messages validates the value for every path (direct insert,
-- materialize, any future writer).
--
-- NiXes are cleaned up / deleted over time: ON DELETE SET NULL keeps the text; the reply header
-- then simply disappears.
--
-- Backward compatibility:
--   * enqueue_own_text_moderation_job gains a trailing parameter with DEFAULT NULL. Postgres cannot
--     add a parameter with CREATE OR REPLACE (that would create an ambiguous overload for
--     PostgREST), so the function is dropped and recreated in this transaction with its grants.
--     Shipped clients call it with named args (p_receiver_id, p_body, p_client_message_id), which
--     still resolve to the new signature.
--   * fetch_text_messages_with_peer returns two extra trailing columns (drop/create, grants
--     restored); old clients ignore them.
--   * New clients retry without the parameter / column when this migration is not deployed.

-- 1) Columns -----------------------------------------------------------------------------------

ALTER TABLE public.text_messages
  ADD COLUMN IF NOT EXISTS reply_to_nix_id UUID NULL
    REFERENCES public.nixes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.text_messages.reply_to_nix_id IS
  'NiX this text replies to: one the text sender received from the text receiver (enforced by trigger private.validate_text_message_reply_to_nix; invalid values are stored as NULL). SET NULL when the NiX is deleted.';

-- FK action support (NiX cleanup deletes NiXes in bulk): equality on the column implies NOT NULL,
-- so the partial index serves the ON DELETE SET NULL lookup while staying tiny.
CREATE INDEX IF NOT EXISTS idx_text_messages_reply_to_nix_id
  ON public.text_messages (reply_to_nix_id)
  WHERE reply_to_nix_id IS NOT NULL;

ALTER TABLE public.moderation_jobs
  ADD COLUMN IF NOT EXISTS reply_to_nix_id UUID NULL
    REFERENCES public.nixes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.moderation_jobs.reply_to_nix_id IS
  'Text jobs only: validated reply target carried to text_messages.reply_to_nix_id by materialize_approved_text_message.';

CREATE INDEX IF NOT EXISTS idx_moderation_jobs_reply_to_nix_id
  ON public.moderation_jobs (reply_to_nix_id)
  WHERE reply_to_nix_id IS NOT NULL;

-- 2) Validation --------------------------------------------------------------------------------

-- Internal helper (SECURITY INVOKER): only called from SECURITY DEFINER code below.
CREATE OR REPLACE FUNCTION private.is_valid_text_reply_nix(
  p_text_sender_id UUID,
  p_text_receiver_id UUID,
  p_nix_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_nix_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.nixes n
      WHERE n.id = p_nix_id
        AND n.sender_id = p_text_receiver_id
        AND n.receiver_id = p_text_sender_id
    );
$$;

REVOKE ALL ON FUNCTION private.is_valid_text_reply_nix(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_valid_text_reply_nix(UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION private.validate_text_message_reply_to_nix()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.reply_to_nix_id IS NOT NULL
    AND NOT private.is_valid_text_reply_nix(NEW.sender_id, NEW.receiver_id, NEW.reply_to_nix_id)
  THEN
    NEW.reply_to_nix_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_text_message_reply_to_nix() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_text_message_reply_to_nix ON public.text_messages;
CREATE TRIGGER validate_text_message_reply_to_nix
  BEFORE INSERT OR UPDATE OF reply_to_nix_id ON public.text_messages
  FOR EACH ROW
  WHEN (NEW.reply_to_nix_id IS NOT NULL)
  EXECUTE FUNCTION private.validate_text_message_reply_to_nix();

-- 3) Moderation path ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.enqueue_own_text_moderation_job(UUID, TEXT, TEXT);

CREATE FUNCTION public.enqueue_own_text_moderation_job(
  p_receiver_id UUID,
  p_body TEXT,
  p_client_message_id TEXT DEFAULT NULL,
  p_reply_to_nix_id UUID DEFAULT NULL
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

  -- Not a NiX this sender received from this receiver → no reply context (never an error).
  reply_nix_id := CASE
    WHEN private.is_valid_text_reply_nix(actor_id, p_receiver_id, p_reply_to_nix_id)
      THEN p_reply_to_nix_id
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
    status
  )
  VALUES (
    'text',
    payload_id,
    actor_id,
    p_receiver_id,
    p_client_message_id,
    reply_nix_id,
    'pending'
  )
  RETURNING id INTO job_id;

  RETURN jsonb_build_object(
    'jobId', job_id,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_own_text_moderation_job(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_own_text_moderation_job(UUID, TEXT, TEXT, UUID)
  TO authenticated, service_role;

-- Same signature as before; only copies the job's reply target into the message.
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
    reply_to_nix_id
  )
  VALUES (
    selected_job.sender_id,
    selected_job.receiver_id,
    payload_body,
    selected_job.client_message_id,
    selected_job.reply_to_nix_id
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

-- 4) Chat read path ----------------------------------------------------------------------------

-- Return type changes → drop/create. reply_to_nix_media_type lets the header show the photo/video
-- symbol even when the NiX is not loaded in the chat; the NiX is between the same two people
-- (trigger above), so the join exposes nothing new.
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
  reply_to_nix_media_type TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tm.id, tm.sender_id, tm.receiver_id, tm.body, tm.created_at, tm.expires_at,
         tm.client_message_id, tm.metadata, tm.is_system, tm.read_at, tm.saved_at, tm.saved_by,
         tm.kind, tm.voice_path, tm.voice_duration_ms, tm.voice_waveform,
         tm.reply_to_nix_id, rn.media_type AS reply_to_nix_media_type
  FROM public.text_messages tm
  LEFT JOIN public.nixes rn ON rn.id = tm.reply_to_nix_id
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
