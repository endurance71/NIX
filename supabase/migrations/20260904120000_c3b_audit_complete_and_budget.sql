-- C3B audit fixes (local-only — do NOT db push to prod).
-- 1) REVOKE + lease/state hardening for complete_moderation_job
-- 2) recovery claim must not overwrite an active lease
-- 3) reserve_moderation_budget: no free retry after confirm/release

-- ---------------------------------------------------------------------------
-- Budget: open-attempt idempotency only; terminal attempts require new id
-- ---------------------------------------------------------------------------
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
  v_month_key TEXT := private.moderation_f0_month_key();
  ledger private.moderation_f0_ledger;
  reservation_id UUID;
  existing private.moderation_f0_reservations%ROWTYPE;
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
    v_month_key,
    COALESCE(p_hard_budget, 4000),
    COALESCE(p_external_used, 0)
  );

  SELECT * INTO ledger
  FROM private.moderation_f0_ledger
  WHERE moderation_f0_ledger.month_key = v_month_key
  FOR UPDATE;

  IF p_external_used IS NOT NULL AND p_external_used > ledger.external_used THEN
    UPDATE private.moderation_f0_ledger
    SET external_used = p_external_used,
        updated_at = NOW()
    WHERE private.moderation_f0_ledger.month_key = v_month_key
    RETURNING * INTO ledger;
  END IF;

  SELECT * INTO existing
  FROM private.moderation_f0_reservations
  WHERE moderation_f0_reservations.month_key = v_month_key
    AND attempt_id = p_attempt_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing.confirmed OR existing.released THEN
      -- Accounting replay must not authorize another free provider send.
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'attempt_already_terminal',
        'reservation_id', existing.id,
        'month_key', v_month_key,
        'confirmed', existing.confirmed,
        'released', existing.released
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'reservation_id', existing.id,
      'month_key', v_month_key,
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
    v_month_key, p_job_id, p_attempt_id, p_category, p_units
  )
  RETURNING id INTO reservation_id;

  UPDATE private.moderation_f0_ledger
  SET reserved_txn = reserved_txn + p_units,
      text_txn = text_txn + CASE WHEN p_category = 'text' THEN p_units ELSE 0 END,
      image_txn = image_txn + CASE WHEN p_category = 'image' THEN p_units ELSE 0 END,
      updated_at = NOW()
  WHERE private.moderation_f0_ledger.month_key = v_month_key;

  RETURN jsonb_build_object(
    'ok', true,
    'reservation_id', reservation_id,
    'month_key', v_month_key
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- complete_moderation_job: require active lease + processing only
-- ---------------------------------------------------------------------------
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
  IF p_lease_owner IS NULL OR length(trim(p_lease_owner)) = 0 THEN
    RAISE EXCEPTION 'LEASE_OWNER_REQUIRED';
  END IF;

  SELECT *
  INTO selected
  FROM public.moderation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;
  IF selected.status IS DISTINCT FROM 'processing' THEN
    RAISE EXCEPTION 'JOB_NOT_CLAIMABLE';
  END IF;
  IF selected.lease_owner IS DISTINCT FROM p_lease_owner THEN
    RAISE EXCEPTION 'LEASE_MISMATCH';
  END IF;
  IF selected.lease_expires_at IS NULL OR selected.lease_expires_at <= NOW() THEN
    RAISE EXCEPTION 'LEASE_EXPIRED';
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

-- ---------------------------------------------------------------------------
-- Recovery claim: never steal an active lease from another worker
-- ---------------------------------------------------------------------------
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
      AND (
        j.lease_expires_at IS NULL
        OR j.lease_expires_at <= NOW()
      )
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

REVOKE ALL ON FUNCTION public.reserve_moderation_budget(TEXT, INTEGER, UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_moderation_job(
  UUID, TEXT, public.moderation_job_status, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_approved_unmaterialized_moderation_jobs(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_moderation_budget(TEXT, INTEGER, UUID, TEXT, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_moderation_job(
  UUID, TEXT, public.moderation_job_status, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, BOOLEAN
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_approved_unmaterialized_moderation_jobs(TEXT, INTEGER)
  TO service_role;
