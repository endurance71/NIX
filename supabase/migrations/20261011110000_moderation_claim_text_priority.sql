-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- DB-8: claim text moderation jobs before media jobs.
--
-- claim_moderation_jobs was strict FIFO, so one video (up to 120 frames at a
-- 200 ms provider gap, i.e. 24 s or more) held every queued chat text behind
-- it. Text jobs are one provider call each, so they now go first; within a
-- kind the order stays next_attempt_at, created_at. Expired leases are still
-- reclaimed, and a media job is only delayed while due text jobs exist.
--
-- Body copied from 20260831150000_pre_delivery_moderation_f0_budget.sql; only
-- the ORDER BY changes. Signature, SECURITY DEFINER, search_path, grants and
-- FOR UPDATE SKIP LOCKED are unchanged.

CREATE OR REPLACE FUNCTION public.claim_moderation_jobs(
  p_limit INTEGER DEFAULT 1,
  p_lease_owner TEXT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 900
)
RETURNS SETOF public.moderation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lease_owner IS NULL OR length(trim(p_lease_owner)) = 0 THEN
    RAISE EXCEPTION 'LEASE_OWNER_REQUIRED';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'INVALID_LIMIT';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.moderation_jobs j
    WHERE (
      j.status = 'pending'
      AND j.next_attempt_at <= NOW()
    ) OR (
      j.status = 'processing'
      AND j.lease_expires_at IS NOT NULL
      AND j.lease_expires_at <= NOW()
    )
    ORDER BY (j.content_kind <> 'text'), j.next_attempt_at, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  claimed AS (
    UPDATE public.moderation_jobs j
    SET status = 'processing',
        lease_owner = p_lease_owner,
        lease_expires_at = NOW() + make_interval(secs => p_lease_seconds),
        attempt_count = j.attempt_count + 1,
        waiting_reason = NULL,
        updated_at = NOW()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_moderation_jobs(INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_moderation_jobs(INTEGER, TEXT, INTEGER) TO service_role;

-- Matches the new ORDER BY over the same active-row partial set as
-- moderation_jobs_claim_idx, so LIMIT 1 reads the index in order instead of
-- sorting every active job. The table holds few active rows, so a plain
-- (transactional) CREATE INDEX is fine.
CREATE INDEX IF NOT EXISTS moderation_jobs_claim_priority_idx
  ON public.moderation_jobs ((content_kind <> 'text'), next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');
