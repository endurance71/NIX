# C3B audit fixes (offline) — 2026-09-04

**Branch:** `codex/c3b-audit-fixes`  
**Base SHA:** see `~/.nix-ops/p0-3-c3b-audit-fixes/BASE_SHA`  
**Status:** offline audit repairs; **not** C3 prod GO. ADR **Proposed**. §6 / App Review **NO-GO**.

## Fixed issues

### P1 — `complete_moderation_job` / recovery claim

Migration: [`supabase/migrations/20260904120000_c3b_audit_complete_and_budget.sql`](../../supabase/migrations/20260904120000_c3b_audit_complete_and_budget.sql)

- `REVOKE ALL … FROM PUBLIC, anon, authenticated` on the current 11-arg signature + `GRANT` to `service_role` only.
- Reject empty owner, status ≠ `processing`, lease mismatch, missing/expired lease under `FOR UPDATE`.
- `claim_approved_unmaterialized_moderation_jobs` skips rows with an **active** lease.

### P1 — budget attempt accounting

- Worker: every provider send uses `crypto.randomUUID()` attempt id (job id is correlation only).
- SQL `reserve_moderation_budget`: open attempt → idempotent; confirmed/released → `attempt_already_terminal` (no free retry).
- Memory ledger aligned with SQL. Cap remains **4000**.

### P2 — local PostgreSQL

- Fixed pgTAP `plan()` counts; boundary `3999+1` then exhausted; ledger isolation between cases.
- Concurrency: `npm run test:c3b-budget-concurrency` (two `psql` connections).
- Allowlist updated in `security_definer_grants_test.sql` for F0 RPCs.

## Local quality commands

| Command | Meaning |
| --- | --- |
| `npm run check:toolchain` | Node 24 / Deno 2.9.6 |
| `npm run deno:check` / `deno:test` | frozen lockfile |
| `npm run test:moderation-worker` | Deno workers/moderation |
| `npm run test:supabase-db` | local Postgres (docker fallback) |
| `npm run test:c3b-budget-concurrency` | two-connection race |
| `npm run audit:high` | high+ only; no `--force` |

Report labels: **LOCAL PASS** / **CI ERROR** / **NOT RUN**. Do not treat memory tests as SQL PASS.

## Historical F0 vs S0

- Historical F0 spike evidence: `~/.nix-ops/p0-3-spike/` (immutable).
- Any later S0 experiment stays separate; this PR does **not** create S0 or PAYG.

## Rollback

1. Revert this branch / drop migration `20260904120000_c3b_audit_complete_and_budget.sql` from local DB only (`supabase migration repair` / restore).
2. Worker attempt-id / ledger changes revert with the git revert.
3. Keep `pre_delivery_moderation_enabled = false`. Never `db push` this migration to prod without a separate written GO.

## Evidence

Outside Git: `~/.nix-ops/p0-3-c3b-audit-fixes/` (SHA, Deno/SQL/audit logs; no secrets/media).
