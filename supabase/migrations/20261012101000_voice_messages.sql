-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Voice messages in the 1:1 chat.
--
-- Model
-- * A voice message is a `text_messages` row with `kind = 'voice'`, so it inherits everything a
--   text has: the pair's RLS, block filtering, the 24 h expiry and its sweep, read receipts,
--   reactions, reports, saving (20261012100000) and the realtime/broadcast plumbing.
--   `body` holds a neutral placeholder („🎤 0:12”) so every existing reader (inbox preview, older
--   clients) shows something sensible without changes.
-- * Audio lives in the private Storage bucket `voice-messages` at
--   `<sender uuid>/<receiver uuid>/<uuid>.m4a`. Upload is allowed only into the uploader's own
--   folder for a receiver they may message; reading is allowed only to the two participants of a
--   live (unexpired, unblocked) message referencing the object, plus the uploader's own folder.
--   Playback uses short-lived signed URLs.
-- * The row is created by `send_voice_message` (SECURITY DEFINER): same friendship / block /
--   restriction / rate gate as text (`can_send_text_message`), the object must exist in the
--   uploader's folder, and direct client INSERTs of voice rows stay impossible (the insert policy
--   already pins `kind = 'text'` below).
-- * Moderation: the audio is NOT content-moderated (no speech pipeline). Voice messages go
--   through the same sender/receiver friendship + block + account restriction checks and can be
--   reported and blocked like text; the moderator sees the placeholder body, not the audio.
-- * Deleting a voice row by any path (expiry sweep, conversation deletion, moderation removal,
--   account deletion cascade) queues its object in `private.voice_message_object_deletions`; the
--   `cleanup-text-messages` cron drains the queue through the Storage API (plus objects that were
--   uploaded but never sent, after an hour).

-- ---------------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.text_messages
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS voice_path TEXT,
  ADD COLUMN IF NOT EXISTS voice_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS voice_waveform SMALLINT[];

COMMENT ON COLUMN public.text_messages.kind IS '''text'' or ''voice''.';
COMMENT ON COLUMN public.text_messages.voice_path IS
  'Object in the private voice-messages bucket (<sender>/<receiver>/<uuid>.m4a).';
COMMENT ON COLUMN public.text_messages.voice_waveform IS
  'Up to 64 loudness samples (0-100) captured while recording, for the bubble waveform.';

ALTER TABLE public.text_messages
  DROP CONSTRAINT IF EXISTS text_messages_kind_chk,
  ADD CONSTRAINT text_messages_kind_chk CHECK (kind IN ('text', 'voice')),
  DROP CONSTRAINT IF EXISTS text_messages_voice_shape_chk,
  ADD CONSTRAINT text_messages_voice_shape_chk CHECK (
    CASE
      WHEN kind = 'voice' THEN
        voice_path IS NOT NULL
        AND voice_duration_ms BETWEEN 1 AND 61000
        AND (
          voice_waveform IS NULL
          OR (
            cardinality(voice_waveform) <= 64
            AND 0 <= ALL (voice_waveform)
            AND 100 >= ALL (voice_waveform)
          )
        )
      ELSE voice_path IS NULL AND voice_duration_ms IS NULL AND voice_waveform IS NULL
    END
  );

-- One message per object; also the lookup used by the storage SELECT policy.
CREATE UNIQUE INDEX IF NOT EXISTS text_messages_voice_path_uniq_idx
  ON public.text_messages (voice_path)
  WHERE voice_path IS NOT NULL;

-- Direct client inserts are text only (voice rows come from send_voice_message).
ALTER POLICY text_messages_insert ON public.text_messages
WITH CHECK (
  (NOT (SELECT private.pre_delivery_moderation_enabled()))
  AND sender_id = (SELECT auth.uid())
  AND public.can_send_text_message(sender_id, receiver_id)
  AND private.text_message_passes_safety_filter(body)
  AND saved_at IS NULL
  AND saved_by IS NULL
  AND expires_at <= now() + INTERVAL '24 hours'
  AND kind = 'text'
  AND voice_path IS NULL
  -- A sender must not insert a message already marked as opened.
  AND read_at IS NULL
);

-- ---------------------------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------------------------
-- 60 s of mono AAC at 64 kbit/s is ~0.5 MB; 2 MB leaves room for encoder variance.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-messages',
  'voice-messages',
  FALSE,
  2097152,
  ARRAY['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------------------------
-- Storage policy helpers (evaluated as the requesting user, so `authenticated` executes them)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.voice_message_object_receiver(p_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- `<sender>/<receiver>/<uuid>.m4a`, lowercase uuids only; anything else is NULL.
  SELECT CASE
    WHEN p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.m4a$'
    THEN split_part(p_name, '/', 2)::UUID
  END;
$$;

CREATE OR REPLACE FUNCTION private.can_upload_voice_message_object(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_receiver UUID := private.voice_message_object_receiver(p_name);
BEGIN
  IF v_uid IS NULL OR v_receiver IS NULL THEN RETURN FALSE; END IF;
  IF split_part(p_name, '/', 1) <> v_uid::TEXT THEN RETURN FALSE; END IF;
  RETURN public.can_send_text_message(v_uid, v_receiver);
END;
$$;

CREATE OR REPLACE FUNCTION private.can_read_voice_message_object(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      -- The uploader's own folder (e.g. checking an upload before the message exists).
      split_part(p_name, '/', 1) = auth.uid()::TEXT
      OR EXISTS (
        SELECT 1
        FROM public.text_messages tm
        WHERE tm.voice_path = p_name
          AND (tm.sender_id = auth.uid() OR tm.receiver_id = auth.uid())
          AND tm.expires_at > now()
          AND NOT private.is_pair_blocked(tm.sender_id, tm.receiver_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION private.can_delete_voice_message_object(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Only the uploader, and only an object no message uses yet (a failed send cleaning up).
  SELECT auth.uid() IS NOT NULL
    AND split_part(p_name, '/', 1) = auth.uid()::TEXT
    AND NOT EXISTS (SELECT 1 FROM public.text_messages tm WHERE tm.voice_path = p_name);
$$;

REVOKE ALL ON FUNCTION private.voice_message_object_receiver(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_upload_voice_message_object(TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.can_read_voice_message_object(TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.can_delete_voice_message_object(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.voice_message_object_receiver(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_upload_voice_message_object(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_voice_message_object(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_delete_voice_message_object(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage policies (no UPDATE policy: no upsert, objects are immutable)
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS voice_messages_insert ON storage.objects;
CREATE POLICY voice_messages_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voice-messages'
  AND private.can_upload_voice_message_object(name)
);

DROP POLICY IF EXISTS voice_messages_select ON storage.objects;
CREATE POLICY voice_messages_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'voice-messages'
  AND private.can_read_voice_message_object(name)
);

DROP POLICY IF EXISTS voice_messages_delete ON storage.objects;
CREATE POLICY voice_messages_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'voice-messages'
  AND private.can_delete_voice_message_object(name)
);

-- ---------------------------------------------------------------------------------------------
-- send_voice_message
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_voice_message(
  p_receiver_id UUID,
  p_voice_path TEXT,
  p_duration_ms INTEGER,
  p_waveform SMALLINT[] DEFAULT NULL,
  p_client_message_id TEXT DEFAULT NULL
)
RETURNS public.text_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.text_messages%ROWTYPE;
  v_seconds INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_receiver_id IS NULL OR p_voice_path IS NULL OR p_duration_ms IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  -- Idempotent retry: the same client id returns the row that already exists.
  IF p_client_message_id IS NOT NULL THEN
    SELECT tm.* INTO v_row
    FROM public.text_messages tm
    WHERE tm.sender_id = v_uid
      AND tm.receiver_id = p_receiver_id
      AND tm.client_message_id = p_client_message_id;
    IF FOUND THEN
      RETURN v_row;
    END IF;
  END IF;

  IF NOT public.can_send_text_message(v_uid, p_receiver_id) THEN
    RAISE EXCEPTION 'NOT_FRIEND' USING ERRCODE = '42501';
  END IF;

  IF private.voice_message_object_receiver(p_voice_path) IS DISTINCT FROM p_receiver_id
     OR split_part(p_voice_path, '/', 1) <> v_uid::TEXT
     OR p_duration_ms NOT BETWEEN 1 AND 61000
     OR (p_waveform IS NOT NULL AND (
       cardinality(p_waveform) > 64
       OR NOT (0 <= ALL (p_waveform))
       OR NOT (100 >= ALL (p_waveform))
     ))
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'voice-messages'
      AND o.name = p_voice_path
  ) THEN
    RAISE EXCEPTION 'VOICE_OBJECT_MISSING' USING ERRCODE = 'P0002';
  END IF;

  v_seconds := GREATEST(1, round(p_duration_ms / 1000.0)::INTEGER);

  BEGIN
    INSERT INTO public.text_messages (
      sender_id, receiver_id, body, client_message_id, kind,
      voice_path, voice_duration_ms, voice_waveform
    )
    VALUES (
      v_uid,
      p_receiver_id,
      '🎤 ' || (v_seconds / 60)::TEXT || ':' || lpad((v_seconds % 60)::TEXT, 2, '0'),
      p_client_message_id,
      'voice',
      p_voice_path,
      p_duration_ms,
      p_waveform
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent retry with the same client id won the race, or the object is already used.
    SELECT tm.* INTO v_row
    FROM public.text_messages tm
    WHERE tm.sender_id = v_uid
      AND tm.receiver_id = p_receiver_id
      AND p_client_message_id IS NOT NULL
      AND tm.client_message_id = p_client_message_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
    END IF;
  END;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.send_voice_message(UUID, TEXT, INTEGER, SMALLINT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_voice_message(UUID, TEXT, INTEGER, SMALLINT[], TEXT)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Object deletion queue (drained by the cleanup-text-messages Edge Function)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.voice_message_object_deletions (
  object_path TEXT PRIMARY KEY,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE private.voice_message_object_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.voice_message_object_deletions FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS voice_message_object_deletions_queued_idx
  ON private.voice_message_object_deletions (queued_at);

CREATE OR REPLACE FUNCTION private.queue_voice_message_object_deletions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.voice_message_object_deletions (object_path)
  SELECT DISTINCT o.voice_path
  FROM old_voice_rows o
  WHERE o.voice_path IS NOT NULL
  ON CONFLICT (object_path) DO NOTHING;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.queue_voice_message_object_deletions() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS queue_voice_message_object_deletions ON public.text_messages;
CREATE TRIGGER queue_voice_message_object_deletions
AFTER DELETE ON public.text_messages
REFERENCING OLD TABLE AS old_voice_rows
FOR EACH STATEMENT
EXECUTE FUNCTION private.queue_voice_message_object_deletions();

-- Service role only: the next batch of objects to remove from Storage. Also picks up objects that
-- were uploaded more than an hour ago but never became a message (failed or abandoned send).
CREATE OR REPLACE FUNCTION public.claim_voice_message_object_deletions(p_limit INTEGER DEFAULT 100)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000);
  v_paths TEXT[];
BEGIN
  INSERT INTO private.voice_message_object_deletions (object_path)
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'voice-messages'
    AND o.created_at < now() - INTERVAL '1 hour'
    AND NOT EXISTS (SELECT 1 FROM public.text_messages tm WHERE tm.voice_path = o.name)
  ORDER BY o.created_at
  LIMIT v_limit
  ON CONFLICT (object_path) DO NOTHING;

  WITH batch AS (
    SELECT d.object_path
    FROM private.voice_message_object_deletions d
    -- A path still referenced by a live row is never removed (cannot happen today: paths are
    -- unique and only queued on delete; this keeps the queue from ever hurting a message).
    WHERE NOT EXISTS (SELECT 1 FROM public.text_messages tm WHERE tm.voice_path = d.object_path)
    ORDER BY d.queued_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE private.voice_message_object_deletions d
    SET attempts = d.attempts + 1
    FROM batch
    WHERE d.object_path = batch.object_path
    RETURNING d.object_path, d.queued_at
  )
  SELECT COALESCE(array_agg(claimed.object_path ORDER BY claimed.queued_at), ARRAY[]::TEXT[])
  INTO v_paths
  FROM claimed;

  RETURN v_paths;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_voice_message_object_deletions(p_paths TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM private.voice_message_object_deletions d
  WHERE d.object_path = ANY (COALESCE(p_paths, ARRAY[]::TEXT[]));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_voice_message_object_deletions(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_voice_message_object_deletions(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_voice_message_object_deletions(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_voice_message_object_deletions(TEXT[]) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Capability probe: lets the client show Save / the mic only when this backend supports them.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_chat_capabilities()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object('v', 1, 'saved_messages', TRUE, 'voice_messages', TRUE);
$$;

REVOKE ALL ON FUNCTION public.get_chat_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_capabilities() TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- fetch_text_messages_with_peer: also return the voice columns (return type changes → drop/create).
-- ---------------------------------------------------------------------------------------------
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
  voice_waveform SMALLINT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tm.id, tm.sender_id, tm.receiver_id, tm.body, tm.created_at, tm.expires_at,
         tm.client_message_id, tm.metadata, tm.is_system, tm.read_at, tm.saved_at, tm.saved_by,
         tm.kind, tm.voice_path, tm.voice_duration_ms, tm.voice_waveform
  FROM public.text_messages tm
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
