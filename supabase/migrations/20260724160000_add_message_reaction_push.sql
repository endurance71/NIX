-- Migration: add_message_reaction_push
-- Transactional push when peer reacts to your text message (author-only; no self-react; no delete).
--
-- IMPORTANT: shared trigger function must nest per-table branches before touching
-- table-specific NEW/OLD columns (e.g. friendships.status). Otherwise INSERT on
-- message_reactions raises: record "new" has no field "status".

ALTER TABLE public.push_notification_jobs
  DROP CONSTRAINT IF EXISTS push_notification_jobs_event_type_check;

ALTER TABLE public.push_notification_jobs
  ADD CONSTRAINT push_notification_jobs_event_type_check
  CHECK (event_type IN (
    'new_nix',
    'friend_request',
    'friend_accepted',
    'new_text_message',
    'message_reaction'
  ));

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

DROP TRIGGER IF EXISTS enqueue_message_reaction_push_notification ON public.message_reactions;
CREATE TRIGGER enqueue_message_reaction_push_notification
AFTER INSERT OR UPDATE OF emoji ON public.message_reactions
FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_notification_job();
