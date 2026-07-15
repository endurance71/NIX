-- Device-scoped push notifications with an idempotent outbox.

ALTER TABLE public.profiles DROP COLUMN IF EXISTS push_token;

CREATE TABLE public.push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL UNIQUE CHECK (char_length(expo_push_token) BETWEEN 20 AND 512),
  native_push_token TEXT CHECK (native_push_token IS NULL OR char_length(native_push_token) BETWEEN 8 AND 1024),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('pl', 'en')),
  app_version TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_reason TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_devices_active_user_idx
  ON public.push_devices(user_id)
  WHERE enabled;

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_devices FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_push_device(
  p_installation_id UUID,
  p_expo_push_token TEXT,
  p_native_push_token TEXT,
  p_platform TEXT,
  p_locale TEXT,
  p_app_version TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'Invalid platform'; END IF;
  IF p_locale NOT IN ('pl', 'en') THEN RAISE EXCEPTION 'Invalid locale'; END IF;
  IF char_length(trim(p_expo_push_token)) NOT BETWEEN 20 AND 512 THEN
    RAISE EXCEPTION 'Invalid Expo push token';
  END IF;

  -- One physical installation/token belongs to the account currently signed in on it.
  DELETE FROM public.push_devices
  WHERE installation_id = p_installation_id
     OR expo_push_token = trim(p_expo_push_token);

  INSERT INTO public.push_devices (
    installation_id,
    user_id,
    expo_push_token,
    native_push_token,
    platform,
    locale,
    app_version,
    enabled,
    disabled_reason,
    last_seen_at,
    updated_at
  ) VALUES (
    p_installation_id,
    current_user_id,
    trim(p_expo_push_token),
    NULLIF(trim(p_native_push_token), ''),
    p_platform,
    p_locale,
    NULLIF(trim(p_app_version), ''),
    TRUE,
    NULL,
    now(),
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_push_device_state(p_installation_id UUID)
RETURNS TABLE(enabled BOOLEAN, "exists" BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT d.enabled FROM public.push_devices d
              WHERE d.installation_id = p_installation_id AND d.user_id = auth.uid()), FALSE),
    EXISTS(SELECT 1 FROM public.push_devices d
           WHERE d.installation_id = p_installation_id AND d.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.disable_push_device(p_installation_id UUID, p_reason TEXT DEFAULT 'user_disabled')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.push_devices
  SET enabled = FALSE,
      disabled_reason = left(COALESCE(NULLIF(trim(p_reason), ''), 'user_disabled'), 80),
      updated_at = now()
  WHERE installation_id = p_installation_id AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_device(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_push_device_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disable_push_device(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_device(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_push_device_state(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_push_device(UUID, TEXT) TO authenticated;

CREATE TABLE public.push_notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('new_nix', 'friend_request', 'friend_accepted')),
  event_key TEXT NOT NULL UNIQUE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'dispatched', 'skipped', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (recipient_id <> actor_id)
);

CREATE INDEX push_notification_jobs_ready_idx
  ON public.push_notification_jobs(next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed', 'processing');

CREATE TABLE public.push_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.push_notification_jobs(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.push_devices(id) ON DELETE CASCADE,
  expo_ticket_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ticketed', 'delivered', 'failed')),
  error_code TEXT,
  ticket_received_at TIMESTAMPTZ,
  next_receipt_check_at TIMESTAMPTZ,
  receipt_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, device_id)
);

CREATE INDEX push_notification_deliveries_receipt_idx
  ON public.push_notification_deliveries(next_receipt_check_at)
  WHERE status = 'ticketed';

ALTER TABLE public.push_notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_notification_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.push_notification_deliveries FROM PUBLIC, anon, authenticated;

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

DROP TRIGGER IF EXISTS enqueue_nix_push_notification ON public.nixes;
CREATE TRIGGER enqueue_nix_push_notification
AFTER INSERT ON public.nixes
FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_notification_job();

DROP TRIGGER IF EXISTS enqueue_friendship_push_notification ON public.friendships;
CREATE TRIGGER enqueue_friendship_push_notification
AFTER INSERT OR UPDATE OF status ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_notification_job();

CREATE OR REPLACE FUNCTION public.claim_push_notification_jobs(p_limit INTEGER DEFAULT 10)
RETURNS SETOF public.push_notification_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT j.id
    FROM public.push_notification_jobs j
    WHERE j.attempts < 5
      AND (
        (j.status IN ('pending', 'failed') AND j.next_attempt_at <= now())
        OR (j.status = 'processing' AND j.locked_at < now() - interval '5 minutes')
      )
    ORDER BY j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
  )
  UPDATE public.push_notification_jobs j
  SET status = 'processing', attempts = attempts + 1, locked_at = now(), updated_at = now()
  FROM candidates c
  WHERE j.id = c.id
  RETURNING j.*;
$$;

CREATE OR REPLACE FUNCTION public.prune_push_notification_history()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  DELETE FROM public.push_notification_jobs
  WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_push_notification_jobs(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_push_notification_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_notification_jobs(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_push_notification_history() TO service_role;
