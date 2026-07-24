-- Fix shared enqueue_push_notification_job: nest per-table before NEW.status / NEW.emoji.
-- Flat ELSIF with NEW.status broke message_reactions inserts (no status column).

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
    IF TG_OP = 'INSERT' THEN
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
