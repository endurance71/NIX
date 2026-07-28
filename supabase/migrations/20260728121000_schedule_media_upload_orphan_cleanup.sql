CREATE OR REPLACE FUNCTION private.invoke_cleanup_media_upload_orphans()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := 'https://xjdjlxfulpqpundkcdul.supabase.co/functions/v1/cleanup-media-upload-orphans',
    headers := private.push_edge_auth_headers(),
    body := '{}'::JSONB,
    timeout_milliseconds := 30_000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_cleanup_media_upload_orphans() FROM PUBLIC;

DO $$
DECLARE
  job RECORD;
BEGIN
  FOR job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'cleanup-media-upload-orphans'
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'cleanup-media-upload-orphans',
  '17 * * * *',
  $cron$SELECT private.invoke_cleanup_media_upload_orphans();$cron$
);
