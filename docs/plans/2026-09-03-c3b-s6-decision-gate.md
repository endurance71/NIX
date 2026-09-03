# C3B §6 — decision gate (ops, 0 PLN Azure)

**Date:** 2026-09-03  
**Purpose:** Pisemna bramka przed jakimkolwiek staging/live Azure lub flagą prod.  
**Zasada:** bez powtórki macierzy C2; bez S0; bez `db push` prod w tym dokumencie.

## Inputs (already recorded — do not re-spend)

| Source | Value |
| --- | --- |
| Resource | `nix-content-safety-f0`, Sweden Central, **SKU F0** |
| `noS0Created` | true ([`~/.nix-ops/p0-3-spike/resource-metadata.json`](~/.nix-ops/p0-3-spike/resource-metadata.json)) |
| Portal pre-run txn | **462** (445 image + 17 text) |
| Accounted after spike | **3414 / 5000** F0; hard ceiling **4000** |
| Cost | **0 PLN** |
| C2 verdict | **NO-GO** / ADR **Proposed** ([`~/.nix-ops/p0-3-spike/decision.md`](~/.nix-ops/p0-3-spike/decision.md)) |
| C3B | Offline PASS (PR #18); flag OFF |

## Decision 1 — reconcile Portal vs evidence (no matrix)

Owner: billing / product.

- [ ] Open Azure Portal → Content Safety resource → Metrics for **current calendar month**.
- [ ] Record `portal_monthly_txn_now` (image + text) **outside Git** in
      `~/.nix-ops/p0-3-s6/portal-reconcile-YYYYMMDD.md`.
- [ ] Confirm accounted spike **3414** is consistent with Portal (± lag). Do **not**
      re-run high-risk matrix to “match” numbers.
- [ ] Set `external_used` seed for any future ledger =
      `max(portal_monthly_txn_now, 3414)` (conservative).
- [ ] Remaining operational budget =
      `4000 - external_used` (must be ≥ 0).

**Recorded baseline (2026-09-03 evidence, pending live Portal re-check):**

| Field | Value |
| --- | --- |
| `accounted_spike_txn` | 3414 |
| `hard_budget` | 4000 |
| `remaining_if_unchanged` | 586 |
| `portal_recheck` | **PENDING human** |

Interim decision if Portal cannot be opened today: treat **3414** as floor for
`external_used`; **NO** live calls until Portal recheck is filed.

## Decision 2 — subscription after 1 October 2026

Owner: subscription Owner.

- [ ] Confirm whether promotional / free credit expires **2026-10-01**.
- [ ] Confirm F0 Content Safety remains available **without** auto-upgrade to S0
      or Pay-As-You-Go spend after that date.
- [ ] If uncertain: **NO-GO staging** until written confirmation; never create S0
      “to keep service”.

Interim: **assume non-automatic** — staging live after 1 Oct requires a fresh
written GO.

## Decision 3 — staging environment GO / NO-GO

| Criterion | Required |
| --- | --- |
| Existing F0 only | yes |
| New paid SKU / S0 | **forbidden** |
| Hard budget | 4000 − `external_used` |
| ADR | still Proposed until new Accepted C2 |
| `pre_delivery_moderation_enabled` on **prod** | **FALSE** |
| Staging flag | only if Decision 3 = **GO** and limited to test tenants |

### Staging GO checklist (only if Decision 3 = GO)

1. Worker / Edge use **fake** provider for soak; live Azure only for a **pre-approved**
   safe-only sample with hard txn cap written in ops file.
2. Cap example: `min(50, remaining_budget)` safe text+JPEG only; video live **off**
   until Accepted C2 sampling.
3. Rollback: stop worker, clear staging flag, no contract migration on prod.
4. Log txn used; update `external_used`.

### Default recommendation (2026-09-03)

**NO-GO staging live Azure** until:

1. Portal reconcile filed, and  
2. C2 sampling redesign reaches Accepted recall, **or** product explicitly accepts
   `baseline_1fps`-only with forecast ≤ 4000.

C3B offline code may stay merged with flag OFF.

## Decision 4 — production flag / C3 prod / C7–C8

**HARD STOP — do not authorize in this gate:**

- `pre_delivery_moderation_enabled = true` on production
- expand/contract/`…150000` `db push` to production
- Privacy Policy / Review Notes claiming automatic photo/video scan
- App Review status → READY FOR REVIEW
- S0 or any paid Content Safety tier

Requires **later** separate written GO after: Accepted C2 + successful limited
staging + observation window.

## Sign-off

| Decision | GO / NO-GO | Signer | Date |
| --- | --- | --- | --- |
| 1 Portal reconcile | **NO-GO for live** (interim: floor 3414) | ops interim | 2026-09-03 |
| 2 F0 after 1 Oct | **NO-GO until written confirmation** | ops interim | 2026-09-03 |
| 3 Staging live | **NO-GO** | plan default | 2026-09-03 |
| 4 Prod flag / Review | **NO-GO** | plan hard stop | 2026-09-03 |

Evidence: `~/.nix-ops/p0-3-s6/decision-signoff-20260903.md`. When humans file a
Portal recheck or F0-after-Oct confirmation, append under `~/.nix-ops/p0-3-s6/`
(no secrets) and update this table.
