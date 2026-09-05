# C3B — next gate: staging / canary (plan only)

**Date:** 2026-09-04
**Status:** Plan document — **not executed**. Zero runtime in this file.
**Aligned with:** [`2026-09-03-c3b-s6-decision-gate.md`](2026-09-03-c3b-s6-decision-gate.md), [`../moderation-spike-runbook.md`](../moderation-spike-runbook.md), [`2026-09-04-c3b-auth-storage-merged.md`](2026-09-04-c3b-auth-storage-merged.md).

## Goal of this gate

Authorize a **limited staging + canary** exercise for moderation worker paths on **test tenants only**, after §6 Decision 1–3 move from interim NO-GO to written GO.

This stage does **not** include:

- Production feature flag enablement
- Production `db push` / migrations
- App Review / Privacy Policy updates
- Creating S0 or any paid Content Safety SKU

## Preconditions (must be filed outside Git)

1. F0 reconcile (§6 Decision 1) — **DONE** via authenticated Azure Monitor / MCP → `~/.nix-ops/p0-3-s6/F0-MONITOR-MCP-20260904.md` / `portal-reconcile-20260904.md`
2. `external_used` = `max(3523, 3624)` = **3624**; remaining to 4000 = **376** (to F0 5000 = **1376**)
3. Written F0-after-2026-10-01 confirmation if the window crosses that date (§6 Decision 2)
4. Staging Decision 3 = **GO** with named signer
5. Runtime: `ffmpeg` / `ffprobe` on PATH for any worker/video path (see spike runbook)
6. C3B code on `main` (merge `5d3cd41`+) with flag still OFF on prod
7. C2 **Accepted** (owner) — still **Proposed**; S0 admin exact **or** activated exception still open

## Staging + canary shape

| Item | Rule |
| --- | --- |
| Tenants | Test tenants only; no production user traffic |
| Provider default | Fake Azure for soak |
| Live Azure | Only after separate GO + hard txn cap written in ops file |
| Cap example | `min(50, remaining_budget)` safe text+JPEG only |
| Video live | **Off** until Accepted C2 sampling redesign |
| Canary | Subset of staging tenants / low QPS; abort on budget or error budget breach |

## Budget

| Field | Value |
| --- | --- |
| Hard operational ceiling | **4000** txn/month (1000 of F0 5000 = untouchable reserve) |
| F0 month-to-date exact (Azure Monitor / MCP) | **3523** (3499 image + 24 text) |
| `external_used` operational floor | **3624** = `max(3523, 3624)` (hybrid ledger; historical spike **3414**) |
| Remaining to ops **4000** | **376** — insufficient for new live matrix |
| Remaining to F0 **5000** | **1376** |
| F0 reconcile | **DONE** (MCP) |
| Open admin | Deleted S0 exact usage unavailable (exception proposal inactive) |
| Cost target | **0 PLN** Azure incremental beyond accounted F0 |

Do not re-run high-risk matrix to “match” Monitor numbers.

## Rollback

1. Stop moderation worker / canary process.
2. Clear **staging** flag / config (prod flag never turned on in this gate).
3. No contract migration / `db push` on production.
4. Log txn consumed; update `external_used` outside Git.
5. If live Azure was used: freeze further live until budget re-check.

## Explicit non-goals (this stage)

- `pre_delivery_moderation_enabled = true` on **production**
- Production `db push`
- Claiming Guideline 1.2 compliance
- Merging or expanding [PR #26](https://github.com/endurance71/NIX/pull/26) patch-package work into this gate

## Exit criteria → next human decision

Staging/canary may be marked **PASS** only with:

- Cap not exceeded; rollback drill documented
- No S0 / paid SKU created
- Observation notes filed under `~/.nix-ops/p0-3-s6/`

Production flag / prod `db push` / App Review remain a **later** separate GO (see shortest-path doc).
