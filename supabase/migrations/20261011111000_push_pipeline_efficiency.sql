-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- DB-12: call push/cleanup Edge Functions from pg_cron only when work is due.
--
-- The crons used to POST to push-dispatch every minute, push-receipts every
-- 5 minutes and cleanup-nix-due every 2 minutes even with empty queues, i.e.
-- ~2000 Edge invocations a day that each opened a client and ran a query.
-- Each cron now checks the same "due" predicate its Edge Function uses and
-- skips net.http_post when nothing is due. Schedules, job names, URLs, auth
-- headers and the INSERT webhook trigger on push_notification_jobs are
-- unchanged; private.invoke_* stay as they are so the trigger keeps working.
--
-- The new functions are SECURITY INVOKER: pg_cron runs them as the job owner
-- (postgres), and the http_post they delegate to is the existing SECURITY
-- DEFINER private.invoke_* function.

-- Mirrors public.claim_push_notification_jobs candidates.
CREATE OR REPLACE FUNCTION private.push_dispatch_has_due_jobs()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.push_notification_jobs j
    WHERE j.status IN ('pending', 'failed', 'processing')
      AND j.attempts < 5
      AND (
        (j.status IN ('pending', 'failed') AND j.next_attempt_at <= now())
        OR (j.status = 'processing' AND j.locked_at < now() - interval '5 minutes')
      )
  );
$$;

-- Mirrors the push-receipts Edge query (ticketed and due for a receipt check).
CREATE OR REPLACE FUNCTION private.push_receipts_has_due_deliveries()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.push_notification_deliveries d
    WHERE d.status = 'ticketed'
      AND d.next_receipt_check_at <= now()
  );
$$;

-- Mirrors the cleanup-nix-due Edge query (next_attempt_at <= now()).
CREATE OR REPLACE FUNCTION private.cleanup_nix_has_due_items()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.nix_cleanup_queue q
    WHERE q.next_attempt_at <= now()
  );
$$;

CREATE OR REPLACE FUNCTION private.invoke_push_dispatch_if_due()
RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF private.push_dispatch_has_due_jobs() THEN
    RETURN private.invoke_push_dispatch();
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.invoke_push_receipts_if_due()
RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF private.push_receipts_has_due_deliveries() THEN
    RETURN private.invoke_push_receipts();
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.invoke_cleanup_nix_due_if_due()
RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF private.cleanup_nix_has_due_items() THEN
    RETURN private.invoke_cleanup_nix_due();
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.push_dispatch_has_due_jobs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.push_receipts_has_due_deliveries() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cleanup_nix_has_due_items() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_push_dispatch_if_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_push_receipts_if_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_cleanup_nix_due_if_due() FROM PUBLIC, anon, authenticated;

-- The cleanup queue had no index usable for next_attempt_at; the Edge query
-- also orders by it. Small table, so a plain CREATE INDEX is fine.
CREATE INDEX IF NOT EXISTS nix_cleanup_queue_next_attempt_idx
  ON public.nix_cleanup_queue (next_attempt_at);

-- Re-point the existing cron jobs (same names and schedules) at the guarded
-- wrappers.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
      WHERE jobname IN ('push-dispatch', 'push-receipts', 'cleanup-nix-due');
    PERFORM cron.schedule('push-dispatch', '* * * * *',
      'SELECT private.invoke_push_dispatch_if_due();');
    PERFORM cron.schedule('push-receipts', '*/5 * * * *',
      'SELECT private.invoke_push_receipts_if_due();');
    PERFORM cron.schedule('cleanup-nix-due', '*/2 * * * *',
      'SELECT private.invoke_cleanup_nix_due_if_due();');
  END IF;
END;
$$;
