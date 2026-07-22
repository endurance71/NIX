-- Enable async HTTP + scheduler for push dispatch pipeline.
-- Vault secret `push_dispatch_service_role` must exist (service role JWT)
-- before webhook/cron invocations succeed; seed it operationally, not in-repo.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.push_edge_auth_headers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  service_key text;
BEGIN
  SELECT ds.decrypted_secret INTO service_key
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'push_dispatch_service_role'
  LIMIT 1;

  IF service_key IS NULL OR length(service_key) = 0 THEN
    RAISE EXCEPTION 'vault secret push_dispatch_service_role is missing';
  END IF;

  RETURN jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_key
  );
END;
$$;

REVOKE ALL ON FUNCTION private.push_edge_auth_headers() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.invoke_push_dispatch()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://xjdjlxfulpqpundkcdul.supabase.co/functions/v1/push-dispatch',
    headers := private.push_edge_auth_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_push_dispatch() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.invoke_push_receipts()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://xjdjlxfulpqpundkcdul.supabase.co/functions/v1/push-receipts',
    headers := private.push_edge_auth_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_push_receipts() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.trigger_push_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.invoke_push_dispatch();
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'push-dispatch webhook failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS push_jobs_dispatch_webhook ON public.push_notification_jobs;
CREATE TRIGGER push_jobs_dispatch_webhook
AFTER INSERT ON public.push_notification_jobs
FOR EACH STATEMENT
EXECUTE FUNCTION private.trigger_push_dispatch();

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid, jobname FROM cron.job
    WHERE jobname IN ('push-dispatch', 'push-receipts', 'prune-push-notification-history')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'push-dispatch',
  '* * * * *',
  $cron$SELECT private.invoke_push_dispatch();$cron$
);

SELECT cron.schedule(
  'push-receipts',
  '*/5 * * * *',
  $cron$SELECT private.invoke_push_receipts();$cron$
);

SELECT cron.schedule(
  'prune-push-notification-history',
  '17 3 * * *',
  $cron$SELECT public.prune_push_notification_history();$cron$
);
