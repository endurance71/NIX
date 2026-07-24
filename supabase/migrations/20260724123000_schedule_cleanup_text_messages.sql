-- Schedule periodic cleanup of expired text_messages via Edge Function.
-- Reuses Vault secret `push_dispatch_service_role` (service role JWT) for Authorization,
-- same pattern as push-dispatch cron.

CREATE OR REPLACE FUNCTION private.invoke_cleanup_text_messages()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://xjdjlxfulpqpundkcdul.supabase.co/functions/v1/cleanup-text-messages',
    headers := private.push_edge_auth_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 15_000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_cleanup_text_messages() FROM PUBLIC;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid, jobname FROM cron.job
    WHERE jobname = 'cleanup-text-messages'
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'cleanup-text-messages',
  '*/10 * * * *',
  $cron$SELECT private.invoke_cleanup_text_messages();$cron$
);
