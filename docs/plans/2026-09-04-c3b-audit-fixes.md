# C3B audit fixes (offline) — 2026-09-04

**Branch:** `codex/c3b-audit-fixes`  
**Base SHA:** see `~/.nix-ops/p0-3-c3b-audit-fixes/BASE_SHA`  
**Status:** offline audit repairs; **not** C3 prod GO. ADR **Proposed**. §6 / App Review **NO-GO**.

## Fixed issues

### P1 / P2 summary (PR #22)

- `complete_moderation_job` REVOKE + lease checks; recovery claim skips active leases.
- Budget attempt UUID per send; SQL/memory terminal attempt semantics; hard_budget ≤ 4000.
- Concurrency harness: no raw URI; no query-param overrides; `psql -X`; cleared `PG*`.
- **No `pg_terminate_backend`.** Busy `TEMPLATE postgres` → exit **2** `BLOCKED` (no session kill).
- Bootstrap race on `:54322` ephemeral `c3b_conc_*` without cluster role CREATE/GRANT; role snapshot + leftover checks; `C3B_CONC_FORCE_FAIL=1` cleanup.
- Isolated migration stack: `npm run test:c3b-isolated-migrations` → Docker `:15432`, real `pg_cron`, iptables egress DROP, apply all `supabase/migrations`, F0 pgTAP, `C3B_CONC_DIRECT=1` race on migrated RPCs. Storage buckets stubbed (not shipped in postgres image). **Separate** from bootstrap PASS.

### Cron / project `supabase db reset`

Still **PARTIAL** on the everyday NIX local stack: `20260722193000` grants `cron` while CREATE EXTENSION is commented; local reset init may lack cron. Do not treat bootstrap or isolated-stack PASS as a clean project `db reset` PASS.

## Commands

| Command | Meaning |
| --- | --- |
| `test:c3b-budget-concurrency-validate` | URL allowlist + no terminate |
| `test:c3b-budget-concurrency` | bootstrap last-unit race (:54322) |
| `C3B_CONC_FORCE_FAIL=1 test:c3b-budget-concurrency` | cleanup regression |
| `C3B_CONC_USE_TEMPLATE=1 test:c3b-budget-concurrency` | busy source → exit 2 |
| `test:c3b-isolated-migrations` | disposable :15432 + real migrations + race |
| `test:moderation-worker` | Deno moderation |

## Evidence

`~/.nix-ops/p0-3-c3b-audit-fixes/` — SHA-tagged logs. Prod/Azure/§6/App Review **NO-GO**.
