CREATE OR REPLACE FUNCTION private.invoke_cleanup_nix_due()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://xjdjlxfulpqpundkcdul.supabase.co/functions/v1/cleanup-nix-due',
    headers := private.push_edge_auth_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 15_000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_cleanup_nix_due() FROM PUBLIC;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid, jobname FROM cron.job
    WHERE jobname = 'cleanup-nix-due'
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'cleanup-nix-due',
  '*/2 * * * *',
  $cron$SELECT private.invoke_cleanup_nix_due();$cron$
);
