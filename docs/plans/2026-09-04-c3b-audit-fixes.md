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
- Allowlist updated in `security_definer_grants_test.sql` for F0 RPCs.

### Pre-merge corrections (PR #22)

1. **Safe concurrency connection:** never passes a raw URI to `psql`; rejects query/hash + libpq overrides; `psql -X` + cleared `PG*`. Validator: `npm run test:c3b-budget-concurrency-validate`.
2. **Ephemeral race + cluster isolation:** `c3b_conc_<uuid>` + [`scripts/sql/c3b_f0_concurrency_bootstrap.sql`](../../scripts/sql/c3b_f0_concurrency_bootstrap.sql) **without** `CREATE ROLE` / `GRANT … TO CURRENT_USER`. Preflight requires existing `anon`/`authenticated`/`service_role` and membership; role/membership snapshot must be unchanged after DROP; no leftover `c3b_conc_%`. `C3B_CONC_FORCE_FAIL=1` verifies cleanup on controlled failure.
3. **Template mode (migration schema):** `C3B_CONC_USE_TEMPLATE=1` clones `TEMPLATE postgres`. On busy local Supabase (superuser sessions that cannot be terminated), CREATE may fail — record as evidence, not a PASS.
4. **Operational ceiling ≤ 4000:** [`20260904120100_c3b_audit_hard_budget_4000.sql`](../../supabase/migrations/20260904120100_c3b_audit_hard_budget_4000.sql) + memory reject. SKU `F0_MONTHLY_CAP = 5000` stays descriptive only.

### Cron / `supabase db reset`

Clean `supabase db reset` still **PARTIAL**: migration `20260722193000` runs `GRANT USAGE ON SCHEMA cron` while `CREATE EXTENSION pg_cron` is commented out, and local reset init does not create `cron` / `pg_cron` before that migration (`ERROR: schema "cron" does not exist`). Real `CREATE EXTENSION pg_cron` on the live `postgres` DB + `migration up` is a valid **upgrade-path** check (not a clean reset PASS). Do not use empty schema atrapas.

## Local quality commands

| Command | Meaning |
| --- | --- |
| `npm run check:toolchain` | Node 24 / Deno 2.9.6 |
| `npm run test:moderation-worker` | Deno workers/moderation |
| `npm run test:c3b-budget-concurrency-validate` | offline URL/target validator |
| `npm run test:c3b-budget-concurrency` | ephemeral bootstrap race (no cluster role mutation) |
| `C3B_CONC_FORCE_FAIL=1 npm run test:c3b-budget-concurrency` | cleanup / snapshot regression |
| `C3B_CONC_USE_TEMPLATE=1 npm run test:c3b-budget-concurrency` | race on TEMPLATE postgres (needs quiet DB) |
| `npm run audit:high` | high+ only; no `--force` |

Report labels: **LOCAL PASS** / **CI ERROR** / **PENDING** / **PARTIAL** / **NOT RUN**.

## Historical F0 vs S0

- Historical F0 spike evidence: `~/.nix-ops/p0-3-spike/` (immutable).
- This PR does **not** create S0 or PAYG.

## Rollback

1. Revert branch / drop audit migrations from local DB only.
2. Keep `pre_delivery_moderation_enabled = false`. Never `db push` to prod without a separate written GO.

## Evidence

Outside Git: `~/.nix-ops/p0-3-c3b-audit-fixes/` (SHA-tagged logs; no secrets/media).
