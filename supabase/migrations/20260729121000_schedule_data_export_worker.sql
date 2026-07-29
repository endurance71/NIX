CREATE OR REPLACE FUNCTION private.invoke_process_data_exports()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := 'https://xjdjlxfulpqpundkcdul.supabase.co/functions/v1/process-data-exports',
    headers := private.push_edge_auth_headers(),
    body := '{}'::JSONB,
    timeout_milliseconds := 30_000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_process_data_exports() FROM PUBLIC;

DO $$
DECLARE
  job RECORD;
BEGIN
  FOR job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'process-data-exports'
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'process-data-exports',
  '*/10 * * * *',
  $cron$SELECT private.invoke_process_data_exports();$cron$
);
