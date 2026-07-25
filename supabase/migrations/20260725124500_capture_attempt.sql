-- Migration: capture_attempt
-- Adds support for capture attempt push notifications and system text messages.

-- 1. Extend CHECK constraint for event_type in push_notification_jobs
ALTER TABLE public.push_notification_jobs
  DROP CONSTRAINT IF EXISTS push_notification_jobs_event_type_check;

ALTER TABLE public.push_notification_jobs
  ADD CONSTRAINT push_notification_jobs_event_type_check
  CHECK (event_type IN (
    'new_nix',
    'friend_request',
    'friend_accepted',
    'new_text_message',
    'message_reaction',
    'capture_attempt'
  ));

-- 2. Add metadata and is_system to text_messages
ALTER TABLE public.text_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NULL,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- 3. Modify trigger enqueue_push_notification_job to ignore is_system = true for new_text_message
CREATE OR REPLACE FUNCTION public.enqueue_push_notification_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  message_author UUID;
  message_expires_at TIMESTAMPTZ;
BEGIN
  IF TG_TABLE_NAME = 'nixes' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
      VALUES ('new_nix', 'new_nix:' || NEW.id, NEW.receiver_id, NEW.sender_id, NEW.id)
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
  ELSIF TG_TABLE_NAME = 'text_messages' THEN
    IF TG_OP = 'INSERT' AND NEW.is_system = false THEN
      INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
      VALUES ('new_text_message', 'new_text_message:' || NEW.id, NEW.receiver_id, NEW.sender_id, NEW.id)
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
  ELSIF TG_TABLE_NAME = 'friendships' THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
      VALUES ('friend_request', 'friend_request:' || NEW.id, NEW.friend_id, NEW.user_id, NEW.id)
      ON CONFLICT (event_key) DO NOTHING;
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
      INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
      VALUES ('friend_accepted', 'friend_accepted:' || NEW.id, NEW.user_id, NEW.friend_id, NEW.id)
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
  ELSIF TG_TABLE_NAME = 'message_reactions' THEN
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.emoji IS DISTINCT FROM NEW.emoji) THEN
      SELECT tm.sender_id, tm.expires_at
        INTO message_author, message_expires_at
      FROM public.text_messages tm
      WHERE tm.id = NEW.message_id;

      -- Author-only; skip self-react and expired messages.
      IF message_author IS NOT NULL
         AND message_author <> NEW.user_id
         AND message_expires_at > now() THEN
        INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
        VALUES (
          'message_reaction',
          'message_reaction:' || NEW.id || ':' || NEW.emoji,
          message_author,
          NEW.user_id,
          NEW.id
        )
        ON CONFLICT (event_key) DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Create RPC report_capture_attempt
CREATE OR REPLACE FUNCTION public.report_capture_attempt(p_nix_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nix_sender_id UUID;
  v_nix_receiver_id UUID;
BEGIN
  -- Verify caller
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify nix exists and caller is receiver
  SELECT sender_id, receiver_id INTO v_nix_sender_id, v_nix_receiver_id
  FROM public.nixes
  WHERE id = p_nix_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nix not found';
  END IF;

  IF v_nix_receiver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Enqueue push notification
  INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
  VALUES (
    'capture_attempt',
    'capture_attempt:' || p_nix_id,
    v_nix_sender_id,
    auth.uid(),
    p_nix_id
  )
  ON CONFLICT (event_key) DO NOTHING;

  -- Insert system message
  -- Idempotency check: only insert system message if push job was actually inserted (i.e. no conflict)
  -- Or just use a unique client_message_id
  INSERT INTO public.text_messages(
    sender_id,
    receiver_id,
    body,
    metadata,
    is_system,
    client_message_id
  )
  VALUES (
    auth.uid(),
    v_nix_sender_id,
    'capture_attempt',
    jsonb_build_object('type', 'capture_attempt', 'nix_id', p_nix_id),
    true,
    'sys_capture:' || p_nix_id
  )
  ON CONFLICT (sender_id, receiver_id, client_message_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_capture_attempt(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.report_capture_attempt(UUID) FROM PUBLIC, anon;

-- Update fetch_text_messages_with_peer to fetch new columns
DROP FUNCTION IF EXISTS public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INT);
CREATE OR REPLACE FUNCTION public.fetch_text_messages_with_peer(
  peer_id UUID,
  before_created_at TIMESTAMPTZ DEFAULT NULL,
  msg_limit INT DEFAULT 50
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
  is_system BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.id, tm.sender_id, tm.receiver_id, tm.body, tm.created_at, tm.expires_at, tm.client_message_id, tm.metadata, tm.is_system
  FROM public.text_messages tm
  WHERE
    ((tm.sender_id = auth.uid() AND tm.receiver_id = peer_id) OR (tm.receiver_id = auth.uid() AND tm.sender_id = peer_id))
    AND tm.expires_at > NOW()
    AND NOT private.is_pair_blocked(auth.uid(), peer_id)
    AND (before_created_at IS NULL OR tm.created_at < before_created_at)
  ORDER BY tm.created_at DESC
  LIMIT LEAST(COALESCE(msg_limit, 50), 100);
$$;
