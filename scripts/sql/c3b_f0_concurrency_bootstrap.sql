-- Minimal F0 budget schema for ephemeral c3b_conc_* race DBs only.
-- Operational hard_budget ceiling = 4000. Not for production.
-- Does NOT create cluster roles or grant memberships — requires existing
-- local Supabase roles: anon, authenticated, service_role.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.moderation_jobs (
  id UUID PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS private.moderation_f0_ledger (
  month_key TEXT PRIMARY KEY,
  hard_budget INTEGER NOT NULL DEFAULT 4000
    CONSTRAINT moderation_f0_ledger_hard_budget_check
    CHECK (hard_budget > 0 AND hard_budget <= 4000),
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
  IF p_hard_budget IS NULL OR p_hard_budget < 1 OR p_hard_budget > 4000 THEN
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
  v_month_key TEXT := private.moderation_f0_month_key();
  ledger private.moderation_f0_ledger;
  reservation_id UUID;
  existing private.moderation_f0_reservations%ROWTYPE;
  used INTEGER;
  v_hard INTEGER := COALESCE(p_hard_budget, 4000);
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
  IF v_hard < 1 OR v_hard > 4000 THEN
    RAISE EXCEPTION 'INVALID_HARD_BUDGET';
  END IF;

  PERFORM private.ensure_moderation_f0_ledger(
    v_month_key,
    v_hard,
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

REVOKE ALL ON FUNCTION private.moderation_f0_month_key(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.ensure_moderation_f0_ledger(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_moderation_budget(TEXT, INTEGER, UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_moderation_budget(TEXT, INTEGER, UUID, TEXT, INTEGER, INTEGER)
  TO service_role;
