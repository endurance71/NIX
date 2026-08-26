-- Contract: retire the v1 report RPC after report-content has been deployed
-- against create_content_report_v2.
--
-- Production order (do not db-push this file together with expand before the
-- Edge Function is on v2):
-- 1. Apply 20260826120000_content_report_text_target_and_evidence_retention.sql
-- 2. Deploy report-content and cleanup-moderation-evidence
-- 3. Smoke A/B/C
-- 4. Apply this migration
--
-- Rollback must not restore v1: keep TEXT_REPORTS_ENABLED=false fail-closed.

REVOKE ALL ON FUNCTION public.create_content_report(TEXT, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.create_content_report(TEXT, UUID, UUID, TEXT);
