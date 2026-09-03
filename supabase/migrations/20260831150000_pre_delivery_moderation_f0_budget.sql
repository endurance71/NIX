-- C3B offline: durable F0 budget ledger, waiting_reason, claim defaults,
-- approved→materialize recovery. Test locally only — do NOT db push to prod
-- and do NOT enable pre_delivery_moderation_enabled.

ALTER TABLE public.moderation_jobs
  ADD COLUMN IF NOT EXISTS waiting_reason TEXT,
  ADD COLUMN IF NOT EXISTS materialized_at TIMESTAMPTZ;

COMMENT ON COLUMN public.moderation_jobs.waiting_reason IS
  'Explicit deferral reason (e.g. f0_budget_exhausted). Never means approved.';
COMMENT ON COLUMN public.moderation_jobs.materialized_at IS
  'Set after successful materialize; used to recover crash between approve and publish.';

CREATE TABLE IF NOT EXISTS private.moderation_f0_ledger (
  month_key TEXT PRIMARY KEY,
  hard_budget INTEGER NOT NULL DEFAULT 4000 CHECK (hard_budget > 0 AND hard_budget <= 5000),
  external_used INTEGER NOT NULL DEFAULT 0 CHECK (external_used >= 0),
  text_txn INTEGER NOT NULL DEFAULT 0 CHECK (text_txn >= 0),
  image_txn INTEGER NOT NULL DEFAULT 0 CHECK (image_txn >= 0),
  reserved_txn INTEGER NOT NULL DEFAULT 0 CHECK (reserved_txn >= 0),
  consumed_txn INTEGER NOT NULL DEFAULT 0 CHECK (consumed_txn >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT moderation_f0_ledger_cap_chk CHECK (
    external_used + reserved_txn + consumed_txn <= hard_budget
  )
);

CREATE TABLE IF NOT EXISTS private.moderation_f0_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key TEXT NOT NULL REFERENCES private.moderation_f0_ledger(month_key) ON DELETE CASCADE,
  job_id UUID REFERENCES public.moderation_jobs(id) ON DELETE SET NULL,
  attempt_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('text', 'image')),
  units INTEGER NOT NULL CHECK (units >= 1),
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  released BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT moderation_f0_reservations_terminal_chk CHECK (NOT (confirmed AND released))
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_f0_reservations_attempt_uidx
  ON private.moderation_f0_reservations(month_key, attempt_id);

ALTER TABLE private.moderation_f0_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.moderation_f0_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.moderation_f0_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.moderation_f0_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.moderation_f0_ledger TO service_role;
GRANT ALL ON TABLE private.moderation_f0_reservations TO service_role;

CREATE OR REPLACE FUNCTION private.moderation_f0_month_key(p_ts TIMESTAMPTZ DEFAULT NOW())
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(timezone('utc', p_ts), 'YYYY-MM');
$$;

CREATE OR REPLACE FUNCTION private.ensure_moderation_f0_ledger(
  p_month_key TEXT DEFAULT private.moderation_f0_month_key(),
  p_hard_budget INTEGER DEFAULT 4000,
  p_external_used INTEGER DEFAULT 0
)
RETURNS private.moderation_f0_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  row private.moderation_f0_ledger;
BEGIN
  IF p_hard_budget IS NULL OR p_hard_budget < 1 OR p_hard_budget > 5000 THEN
    RAISE EXCEPTION 'INVALID_HARD_BUDGET';
  END IF;
  INSERT INTO private.moderation_f0_ledger AS l (month_key, hard_budget, external_used)
  VALUES (p_month_key, p_hard_budget, GREATEST(COALESCE(p_external_used, 0), 0))
  ON CONFLICT (month_key) DO UPDATE
    SET updated_at = NOW()
  RETURNING * INTO row;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_moderation_budget(
  p_category TEXT,
  p_units INTEGER,
  p_job_id UUID,
  p_attempt_id TEXT,
  p_hard_budget INTEGER DEFAULT 4000,
  p_external_used INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  month_key TEXT := private.moderation_f0_month_key();
  ledger private.moderation_f0_ledger;
  reservation_id UUID;
  used INTEGER;
BEGIN
  IF p_category IS NULL OR p_category NOT IN ('text', 'image') THEN
    RAISE EXCEPTION 'INVALID_CATEGORY';
  END IF;
  IF p_units IS NULL OR p_units < 1 THEN
    RAISE EXCEPTION 'INVALID_UNITS';
  END IF;
  IF p_attempt_id IS NULL OR length(trim(p_attempt_id)) = 0 THEN
    RAISE EXCEPTION 'ATTEMPT_ID_REQUIRED';
  END IF;

  PERFORM private.ensure_moderation_f0_ledger(
    month_key,
    COALESCE(p_hard_budget, 4000),
    COALESCE(p_external_used, 0)
  );

  SELECT * INTO ledger
  FROM private.moderation_f0_ledger
  WHERE moderation_f0_ledger.month_key = month_key
  FOR UPDATE;

  IF p_external_used IS NOT NULL AND p_external_used > ledger.external_used THEN
    UPDATE private.moderation_f0_ledger
    SET external_used = p_external_used,
        updated_at = NOW()
    WHERE private.moderation_f0_ledger.month_key = month_key
    RETURNING * INTO ledger;
  END IF;

  SELECT id INTO reservation_id
  FROM private.moderation_f0_reservations
  WHERE moderation_f0_reservations.month_key = month_key
    AND attempt_id = p_attempt_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reservation_id', reservation_id,
      'month_key', month_key,
      'idempotent', true
    );
  END IF;

  used := ledger.external_used + ledger.reserved_txn + ledger.consumed_txn;
  IF used + p_units > ledger.hard_budget THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'f0_budget_exhausted',
      'used', used,
      'hard_budget', ledger.hard_budget
    );
  END IF;

  INSERT INTO private.moderation_f0_reservations (
    month_key, job_id, attempt_id, category, units
  ) VALUES (
    month_key, p_job_id, p_attempt_id, p_category, p_units
  )
  RETURNING id INTO reservation_id;

  UPDATE private.moderation_f0_ledger
  SET reserved_txn = reserved_txn + p_units,
      text_txn = text_txn + CASE WHEN p_category = 'text' THEN p_units ELSE 0 END,
      image_txn = image_txn + CASE WHEN p_category = 'image' THEN p_units ELSE 0 END,
      updated_at = NOW()
  WHERE private.moderation_f0_ledger.month_key = month_key;

  RETURN jsonb_build_object(
    'ok', true,
    'reservation_id', reservation_id,
    'month_key', month_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_moderation_budget(p_reservation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  row private.moderation_f0_reservations%ROWTYPE;
BEGIN
  SELECT * INTO row
  FROM private.moderation_f0_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;
  IF row.confirmed OR row.released THEN
    RETURN;
  END IF;

  UPDATE private.moderation_f0_reservations
  SET confirmed = TRUE
  WHERE id = p_reservation_id;

  UPDATE private.moderation_f0_ledger
  SET reserved_txn = reserved_txn - row.units,
      consumed_txn = consumed_txn + row.units,
      updated_at = NOW()
  WHERE month_key = row.month_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_moderation_budget_if_unused(p_reservation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  row private.moderation_f0_reservations%ROWTYPE;
BEGIN
  SELECT * INTO row
  FROM private.moderation_f0_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- Uncertain / confirmed attempts must not be released.
  IF row.confirmed OR row.released THEN
    RETURN;
  END IF;

  UPDATE private.moderation_f0_reservations
  SET released = TRUE
  WHERE id = p_reservation_id;

  UPDATE private.moderation_f0_ledger
  SET reserved_txn = reserved_txn - row.units,
      text_txn = text_txn - CASE WHEN row.category = 'text' THEN row.units ELSE 0 END,
      image_txn = image_txn - CASE WHEN row.category = 'image' THEN row.units ELSE 0 END,
      updated_at = NOW()
  WHERE month_key = row.month_key;
END;
$$;

-- Replace prior complete signature from expand (extra waiting/rollover args).
DROP FUNCTION IF EXISTS public.complete_moderation_job(
  UUID, TEXT, public.moderation_job_status, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER
);

-- Claim defaults: one job, lease 900s (C3B).
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
    ORDER BY j.next_attempt_at, j.created_at
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

CREATE OR REPLACE FUNCTION public.complete_moderation_job(
  p_job_id UUID,
  p_lease_owner TEXT,
  p_status public.moderation_job_status,
  p_decision TEXT DEFAULT NULL,
  p_policy_version TEXT DEFAULT NULL,
  p_max_severity INTEGER DEFAULT NULL,
  p_provider_operation_id TEXT DEFAULT NULL,
  p_last_error TEXT DEFAULT NULL,
  p_retry_delay_seconds INTEGER DEFAULT NULL,
  p_waiting_reason TEXT DEFAULT NULL,
  p_next_attempt_at_month_rollover BOOLEAN DEFAULT FALSE
)
RETURNS public.moderation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected public.moderation_jobs%ROWTYPE;
  next_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO selected
  FROM public.moderation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;
  IF selected.lease_owner IS DISTINCT FROM p_lease_owner THEN
    RAISE EXCEPTION 'LEASE_MISMATCH';
  END IF;
  IF selected.status NOT IN ('processing', 'pending') THEN
    RAISE EXCEPTION 'JOB_NOT_CLAIMABLE';
  END IF;
  IF p_status NOT IN ('approved', 'rejected', 'error', 'pending') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  IF p_next_attempt_at_month_rollover THEN
    next_at := date_trunc('month', timezone('utc', NOW())) + INTERVAL '1 month';
  ELSIF p_status = 'pending' AND p_retry_delay_seconds IS NOT NULL THEN
    next_at := NOW() + make_interval(secs => p_retry_delay_seconds);
  ELSE
    next_at := selected.next_attempt_at;
  END IF;

  UPDATE public.moderation_jobs
  SET status = p_status,
      decision = p_decision,
      policy_version = p_policy_version,
      max_severity = p_max_severity,
      provider_operation_id = p_provider_operation_id,
      last_error = p_last_error,
      waiting_reason = p_waiting_reason,
      lease_owner = NULL,
      lease_expires_at = NULL,
      next_attempt_at = next_at,
      completed_at = CASE
        WHEN p_status IN ('approved', 'rejected', 'error') THEN NOW()
        ELSE completed_at
      END,
      updated_at = NOW()
  WHERE id = p_job_id
  RETURNING * INTO selected;

  RETURN selected;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_approved_unmaterialized_moderation_jobs(
  p_lease_owner TEXT,
  p_limit INTEGER DEFAULT 1
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
    WHERE j.status = 'approved'
      AND j.materialized_at IS NULL
    ORDER BY j.completed_at NULLS FIRST, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  claimed AS (
    UPDATE public.moderation_jobs j
    SET lease_owner = p_lease_owner,
        lease_expires_at = NOW() + INTERVAL '900 seconds',
        updated_at = NOW()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.*
  )
  SELECT * FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_moderation_job_materialized(p_job_id UUID)
RETURNS public.moderation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected public.moderation_jobs%ROWTYPE;
BEGIN
  UPDATE public.moderation_jobs
  SET materialized_at = COALESCE(materialized_at, NOW()),
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = NOW()
  WHERE id = p_job_id
    AND status = 'approved'
  RETURNING * INTO selected;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_APPROVED_OR_MISSING';
  END IF;
  RETURN selected;
END;
$$;

REVOKE ALL ON FUNCTION private.moderation_f0_month_key(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.ensure_moderation_f0_ledger(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_moderation_budget(TEXT, INTEGER, UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_moderation_budget(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_moderation_budget_if_unused(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_approved_unmaterialized_moderation_jobs(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_moderation_job_materialized(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_moderation_budget(TEXT, INTEGER, UUID, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_moderation_budget(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_moderation_budget_if_unused(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_approved_unmaterialized_moderation_jobs(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_moderation_job_materialized(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_moderation_jobs(INTEGER, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_moderation_job(UUID, TEXT, public.moderation_job_status, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO service_role;
