-- Contract: require expiry whenever evidence exists, then drop RPC v1.
-- Apply only after expand, Edge v2, smoke A/B/C, and a reviewed dry-run.
-- Rollback for v2 outage: TEXT_REPORTS_ENABLED=false. Do not restore v1.

UPDATE public.content_reports
SET evidence_expires_at = created_at + INTERVAL '30 days'
WHERE evidence_path IS NOT NULL
  AND evidence_expires_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.content_reports
    WHERE evidence_path IS NOT NULL
      AND evidence_expires_at IS NULL
  ) THEN
    RAISE EXCEPTION 'content_reports still has evidence without expiry';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_reports_evidence_requires_expiry'
      AND conrelid = 'public.content_reports'::regclass
  ) THEN
    ALTER TABLE public.content_reports
      ADD CONSTRAINT content_reports_evidence_requires_expiry
      CHECK (evidence_path IS NULL OR evidence_expires_at IS NOT NULL);
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.create_content_report(TEXT, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.create_content_report(TEXT, UUID, UUID, TEXT);
