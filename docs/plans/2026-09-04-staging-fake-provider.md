# Staging — fake provider only (zero Azure)

**Date:** 2026-09-04  
**Status:** Plan document — **not executed**. Zero runtime.  
**Activation:** only after **Accepted C2** (owner) **and** §6 Decision 3 staging GO.  
**Aligned with:** [`2026-09-03-c3b-s6-decision-gate.md`](2026-09-03-c3b-s6-decision-gate.md); sibling canary plan in PR #27 [`2026-09-04-c3b-next-gate-staging-canary.md`](2026-09-04-c3b-next-gate-staging-canary.md) once merged.

## Goal

Soak moderation worker / Edge paths on **test tenants** using the **fake** Content Safety provider. Prove leases, budgets, fail-closed behavior, and rollback **without** Azure spend.

## Hard non-goals (this stage)

- Live Azure Content Safety (any SKU)
- Production `pre_delivery_moderation_enabled = true`
- Production `db push` / contract expand
- Privacy Policy / App Review claims
- Paid EAS

## Preconditions

1. ADR-001 **Accepted** (owner) — not merely technical PASS
2. Admin Portal/ledger gate closed (exact txn or activated exception)
3. §6 Decision 3 = GO for **fake-only** staging (live still separate)
4. Prod flag remains **OFF**
5. `ffmpeg` / `ffprobe` on PATH if any video path is exercised offline against fixtures

## Shape

| Item | Rule |
| --- | --- |
| Tenants | Test tenants only |
| Provider | Fake / stub only |
| Live Azure | **Forbidden** in this stage |
| Video | Offline fixtures or skip; no live image:analyze |
| Duration | Fixed soak window written in ops file before start |
| Observability | Job outcomes, lease renewals, budget counters — no media payloads |

## Rollback

1. Stop worker / canary process
2. Clear staging-only config (never touched prod flag)
3. No prod migrations
4. File ops note under `~/.nix-ops/p0-3-s6/`

## Exit → next human decision

PASS this stage only with: soak complete, rollback drilled, **0** Azure txn, prod still OFF.  
Live Azure (tiny cap) and video live remain **later** separate GO after Accepted recall confirmation in staging policy.
