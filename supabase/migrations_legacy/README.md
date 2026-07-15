# Archived Supabase migrations

These files are retained only for audit history after the 2026-07-15 schema
consolidation. Supabase CLI does not execute this directory.

The file `20260623120000_db_reset_keep_accounts.sql.archive` is intentionally archived:
it contains destructive cleanup statements and must never be applied to the
linked project. The active migration history starts from
`20260714104841_remote_baseline.sql`.
