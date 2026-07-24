-- Migration: add_text_messages_realtime_chat
-- Ephemeral 1:1 text messaging with 24h TTL, realtime subscription support, RLS, rate limiting, and push notification triggers.

-- 1. Create text_messages table
CREATE TABLE IF NOT EXISTS public.text_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  client_message_id TEXT NULL,
  CONSTRAINT check_sender_neq_receiver CHECK (sender_id <> receiver_id)
);

-- Unique index for client idempotency
CREATE UNIQUE INDEX IF NOT EXISTS text_messages_client_msg_uniq_idx
  ON public.text_messages(sender_id, receiver_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Indexes for fast query and cleanup performance
CREATE INDEX IF NOT EXISTS text_messages_receiver_created_idx
  ON public.text_messages(receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS text_messages_expires_at_idx
  ON public.text_messages(expires_at);

CREATE INDEX IF NOT EXISTS text_messages_pair_created_idx
  ON public.text_messages(sender_id, receiver_id, created_at DESC);

-- 2. Function can_send_text_message
CREATE OR REPLACE FUNCTION public.can_send_text_message(sender UUID, receiver UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  friendship_exists BOOLEAN;
  recent_count INT;
BEGIN
  IF auth.uid() IS NULL OR sender IS DISTINCT FROM auth.uid() THEN RETURN FALSE; END IF;
  IF sender IS NULL OR receiver IS NULL OR sender = receiver THEN RETURN FALSE; END IF;
  IF private.is_pair_blocked(sender, receiver) THEN RETURN FALSE; END IF;
  IF private.is_account_restricted(sender) OR private.is_account_restricted(receiver) THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.user_id = sender AND f.friend_id = receiver) OR (f.user_id = receiver AND f.friend_id = sender))
  ) INTO friendship_exists;
  IF NOT friendship_exists THEN RETURN FALSE; END IF;

  SELECT COUNT(*) INTO recent_count
  FROM public.text_messages tm
  WHERE tm.sender_id = sender AND tm.created_at > NOW() - INTERVAL '1 minute';
  RETURN recent_count < 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_send_text_message(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.can_send_text_message(UUID, UUID) FROM PUBLIC, anon;

-- 3. Row Level Security
ALTER TABLE public.text_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS text_messages_select ON public.text_messages;
CREATE POLICY text_messages_select ON public.text_messages
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT private.is_pair_blocked(sender_id, receiver_id)
  );

DROP POLICY IF EXISTS text_messages_insert ON public.text_messages;
CREATE POLICY text_messages_insert ON public.text_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.can_send_text_message(sender_id, receiver_id)
  );

-- 4. Enable Supabase Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'text_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.text_messages;
  END IF;
END $$;

-- 5. Updated RPC delete_my_conversation_with_peer
CREATE OR REPLACE FUNCTION public.delete_my_conversation_with_peer(peer_profile_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_nixes_count INTEGER;
  deleted_text_count INTEGER;
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

  GET DIAGNOSTICS deleted_nixes_count = ROW_COUNT;

  DELETE FROM public.text_messages tm
  WHERE
    (tm.sender_id = auth.uid() AND tm.receiver_id = peer_profile_id)
    OR (tm.receiver_id = auth.uid() AND tm.sender_id = peer_profile_id);

  GET DIAGNOSTICS deleted_text_count = ROW_COUNT;

  RETURN COALESCE(deleted_nixes_count, 0) + COALESCE(deleted_text_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_conversation_with_peer(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_my_conversation_with_peer(UUID) FROM PUBLIC, anon;

-- 6. RPC fetch_text_messages_with_peer
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
  client_message_id TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.id, tm.sender_id, tm.receiver_id, tm.body, tm.created_at, tm.expires_at, tm.client_message_id
  FROM public.text_messages tm
  WHERE
    ((tm.sender_id = auth.uid() AND tm.receiver_id = peer_id) OR (tm.receiver_id = auth.uid() AND tm.sender_id = peer_id))
    AND tm.expires_at > NOW()
    AND NOT private.is_pair_blocked(auth.uid(), peer_id)
    AND (before_created_at IS NULL OR tm.created_at < before_created_at)
  ORDER BY tm.created_at DESC
  LIMIT LEAST(COALESCE(msg_limit, 50), 100);
$$;

GRANT EXECUTE ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.fetch_text_messages_with_peer(UUID, TIMESTAMPTZ, INT) FROM PUBLIC, anon;

-- 7. Update push notification event_type constraint & trigger
ALTER TABLE public.push_notification_jobs
  DROP CONSTRAINT IF EXISTS push_notification_jobs_event_type_check;

ALTER TABLE public.push_notification_jobs
  ADD CONSTRAINT push_notification_jobs_event_type_check
  CHECK (event_type IN ('new_nix', 'friend_request', 'friend_accepted', 'new_text_message'));

CREATE OR REPLACE FUNCTION public.enqueue_push_notification_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'nixes' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
    VALUES ('new_nix', 'new_nix:' || NEW.id, NEW.receiver_id, NEW.sender_id, NEW.id)
    ON CONFLICT (event_key) DO NOTHING;
  ELSIF TG_TABLE_NAME = 'text_messages' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
    VALUES ('new_text_message', 'new_text_message:' || NEW.id, NEW.receiver_id, NEW.sender_id, NEW.id)
    ON CONFLICT (event_key) DO NOTHING;
  ELSIF TG_TABLE_NAME = 'friendships' AND TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
    VALUES ('friend_request', 'friend_request:' || NEW.id, NEW.friend_id, NEW.user_id, NEW.id)
    ON CONFLICT (event_key) DO NOTHING;
  ELSIF TG_TABLE_NAME = 'friendships' AND TG_OP = 'UPDATE'
        AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.push_notification_jobs(event_type, event_key, recipient_id, actor_id, entity_id)
    VALUES ('friend_accepted', 'friend_accepted:' || NEW.id, NEW.user_id, NEW.friend_id, NEW.id)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_text_message_push_notification ON public.text_messages;
CREATE TRIGGER enqueue_text_message_push_notification
AFTER INSERT ON public.text_messages
FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_notification_job();
