-- Daily cleanup of expired/orphan moderation evidence via Edge Function.
-- Timestamp is after 20260827120000 (already on production). `migration new`
-- at wall-clock 08:50 UTC would insert before the contract version and break
-- history — same rule as reconstructing 20260825195500.
-- Vault secret `moderation_cleanup_secret` must exist (x-cleanup-secret value)
-- and match Edge Function secret MODERATION_CLEANUP_SECRET. Seed operationally,
-- never commit the value. Reuses Vault `push_dispatch_service_role` for Bearer.

CREATE OR REPLACE FUNCTION private.moderation_cleanup_auth_headers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  service_key text;
  cleanup_secret text;
BEGIN
  SELECT ds.decrypted_secret INTO service_key
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'push_dispatch_service_role'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO cleanup_secret
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'moderation_cleanup_secret'
  LIMIT 1;

  IF service_key IS NULL OR length(service_key) = 0 THEN
    RAISE EXCEPTION 'vault secret push_dispatch_service_role is missing';
  END IF;

  IF cleanup_secret IS NULL OR length(cleanup_secret) = 0 THEN
    RAISE EXCEPTION 'vault secret moderation_cleanup_secret is missing';
  END IF;

  RETURN jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_key,
    'x-cleanup-secret', cleanup_secret
  );
END;
$$;

REVOKE ALL ON FUNCTION private.moderation_cleanup_auth_headers() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.invoke_cleanup_moderation_evidence()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://xjdjlxfulpqpundkcdul.supabase.co/functions/v1/cleanup-moderation-evidence',
    headers := private.moderation_cleanup_auth_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 30_000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_cleanup_moderation_evidence() FROM PUBLIC;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid, jobname FROM cron.job
    WHERE jobname = 'cleanup-moderation-evidence'
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'cleanup-moderation-evidence',
  '27 4 * * *',
  $cron$SELECT private.invoke_cleanup_moderation_evidence();$cron$
);
