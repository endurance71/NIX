# Shortest path to moderation GO (cost-first)

**Date:** 2026-09-04  
**Sources:** [`../release/ios-current.md`](../release/ios-current.md), ADR-001 (Proposed), [`2026-09-03-c3b-s6-decision-gate.md`](2026-09-03-c3b-s6-decision-gate.md), [`2026-09-04-c3b-next-gate-staging-canary.md`](2026-09-04-c3b-next-gate-staging-canary.md).  
**Verdict today:** **NO-GO** on real production / App Review GO. Merging C3B code does **not** unlock GO.

## Ordered path (shortest, cost-first)

1. **Portal reconcile F0 txn** (§6 Decision 1) — **0 PLN** Azure; human in Portal Metrics; set `external_used` floor.
2. **Subscription / F0 after 2026-10-01** (§6 Decision 2) — written confirmation; no auto-upgrade to S0.
3. **Accepted C2** — currently **NO-GO** / ADR-001 **Proposed**. No S0; forecast must stay ≤ **4000** operational ceiling. Do not re-spend spike matrix casually.
4. **Staging GO** with hard cap + rollback ([next-gate plan](2026-09-04-c3b-next-gate-staging-canary.md)) — test tenants; **prod flag still OFF**.
5. **Only then:** prod `db push` + production flag + Privacy Policy / Guideline 1.2 claims → candidate public App Review (`1.0.11` build **6+**).
6. **Parallel (do not block C3B code; do block public GO):**
   - Physical-device QA on Internal TestFlight
   - Push JWT / issue #7 (`verify_jwt=true` deployment)
   - New native binary after RN patch (issue #15)
   - Signed TF tag on verified SHA
   - [PR #26](https://github.com/endurance71/NIX/pull/26) patch-package align — **separate** track; not a moderation unlock

## What already landed (not GO)

| Item | State |
| --- | --- |
| C3B offline / audit / Auth-Storage | **MERGED** `5d3cd41` ([PR #24](https://github.com/endurance71/NIX/pull/24)); flag OFF |
| Expo CI for #24 | Exception (quota); local preflight PASS |
| C2 spike | NO-GO / ADR Proposed; interim `external_used` floor **3624 / 4000** (remaining **376**); historical F0 spike alone was **3414** before hybrid delta |
| Production pre-delivery filter | **OFF** |

## Nearest unlocking step

Not more code merges. **Portal reconcile + C2 status** (items 1 and 3). Until those are written GO, treat every staging/live Azure request as **blocked**.

## Hard stops (unchanged)

- No S0 / paid Content Safety
- No prod flag / prod `db push` before items 1–4
- No App Review READY FOR REVIEW while Guideline 1.2 UGC filtering is unmet on production
- 0 PLN EAS “to force” CI green for historical #24
