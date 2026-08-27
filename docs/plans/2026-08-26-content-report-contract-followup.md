# Follow-up PR: content report contract (CHECK + drop v1)

**Nie** dołączać tej migracji do PR expand. Otworzyć osobny PR dopiero po:

1. wdrożeniu expand `20260826120000_content_report_text_target_and_evidence_retention.sql`;
2. wdrożeniu Edge Functions `report-content` i `cleanup-moderation-evidence`;
3. smoke A/B/C;
4. pozytywnym dry-run cleanupu.

## Migracja (szkic)

Plik np. `supabase/migrations/YYYYMMDDHHMMSS_content_report_evidence_expiry_check_and_drop_v1.sql`:

```sql
-- Re-backfill any rows created by v1 during the expand→Edge gap.
UPDATE public.content_reports
SET evidence_expires_at = created_at + INTERVAL '30 days'
WHERE evidence_path IS NOT NULL
  AND evidence_expires_at IS NULL;

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
```

Rollback awarii v2: `TEXT_REPORTS_ENABLED = false` w
`supabase/functions/report-content/contract.ts`. **Nie** przywracać v1.
