# NiX iOS — current release status

> This document is the single source of truth for the current iOS release.
> Dated sprint plans and audit snapshots are historical evidence and must link
> here instead of presenting their old binary state as current.

## Current binary

| Field | Value |
| --- | --- |
| App Store Connect app | NiX (`6791332379`) |
| Version | `1.0.11` |
| Latest build | `5` |
| Source SHA | `c2175ce8902161bceefd86668e98955e1487b12c` |
| Source branch at upload | `codex/sprint-4-minimal-app-review` |
| Main integration | merge commit `2e173c034627c800224f40c88ddad90d7d4e7d27` |
| Distribution | Internal TestFlight only |
| Public App Review | **NO-GO / not submitted** |

App Store Connect reported builds `1.0.11 (4)` and `1.0.11 (5)` as
`IN_BETA_TESTING` on 2026-08-31. Build 5 was also
`READY_FOR_BETA_SUBMISSION`; this is a TestFlight state and does not mean the
binary was submitted to public App Review.

The intended internal group is **NiX Internal QA**. Before treating group
assignment as complete, verify in App Store Connect that build 5 is the only
active build attached to that group.

## Verified gates

On the exact build 5 source SHA:

- TypeScript: PASS;
- ESLint: PASS;
- Vitest: 77 files / 430 tests PASS;
- Knip: PASS;
- iOS config synchronization: PASS;
- Internal TestFlight config: PASS;
- production release environment validation and its tests: PASS;
- Xcode Archive, export, signing and App Store upload: PASS, recorded outside
  Git in `~/.nix-ops/sprint5-paste-input/INTERNAL-TESTFLIGHT-5.md`.

### C1 — least privilege (code merged; prod deploy pending authorization)

- Migration `20260831120000_harden_security_definer_execute_grants.sql` on `main`;
- pgTAP `security_definer_grants_test.sql` + registry [`../supabase-function-grants.md`](../supabase-function-grants.md);
- Release scripts: `check:supabase-security-advisors`, `check:*-integrity:local`,
  `check:supabase-security-advisors:local`;
- EAS Internal TestFlight workflow: `test:supabase-db`, `check:supabase-db-lint`,
  `check:supabase-security-advisors:local`, `check:toolchain`.

**Post-deploy smoke (record in `~/.nix-ops/c1-smoke-YYYY-MM-DD.md`, not Git):**

- [ ] login (Apple + email);
- [ ] profile view/edit;
- [ ] friend invite create/redeem;
- [ ] inbox unread count;
- [ ] send text message;
- [ ] photo/video upload + finalize;
- [ ] push notification received;
- [ ] report content;
- [ ] block/unblock user;
- [ ] request data export.

**Production advisors:** run `SUPABASE_DB_URL=… npm run check:supabase-security-advisors`
after authorized migration deploy. Until that deploy, C1 remains code-complete /
ops-pending.

### C2 — walidacja dostawcy (STOP — ADR Proposed)

- Zakres PR #9 / ADR-001 + spike + runbook na drzewie; szczegóły operacyjne:
  [`../moderation-spike-runbook.md`](../moderation-spike-runbook.md).
- Azure F0 **Sweden Central** istnieje; spike **uruchomiony** (dry-run + live text/
  JPEG + pełna macierz MP4). Dowody: `~/.nix-ops/p0-3-spike/` (bez mediów).
- **STOP / NO-GO Accepted:** `baseline_1fps` odrzucił 12/12 high-risk MP4, ale
  `uniform` przepuścił off-anchor 15/60 s; `scene_plus_anchors` przepuścił
  off-anchor 15/60/180 s, a `contact_sheet` ma dalsze false negatives. Brakuje
  też rzeczywistego forecastu 7d/30d i 3 próbek latency. ADR pozostaje
  **Proposed**. C3 prod nie startuje.
- Naprawczy `uniform_scene_guard` przeszedł wąski live delta (safe 3/3 approved,
  off-anchor 3/3 rejected severity 6, 210 txn, clean SHA). To nie jest pełne C2;
  konserwatywny stan F0 wynosi 3624/5000, koszt 0 PLN.
- Hard budget operacyjny: **4000** txn/mies. (rezerwa 1000 z F0 5000).
- Worker strategy (kod, nie Accepted): domyślna `uniform`; eksperymentalna
  `uniform_scene_guard` ma delta PASS. Żadnej nie aktywować przed pełnym C2.

### C3 — pre-delivery enforcement (kod; prod rollout pending + C2 STOP)

- Migracje: `20260831130000_pre_delivery_moderation_expand.sql`, `20260831140000_pre_delivery_moderation_contract.sql`.
- Edge: `send-text-message`, `moderation-worker` (`verify_jwt=true` w `config.toml`).
- Klient: `insertTextMessageDirect` wyłącznie po `MODERATION_DISABLED`; retryable /
  pending / reject nigdy nie wracają do INSERT.
- Wideo: ffmpeg + sampling (`uniform` / `baseline_1fps`); brak klatek → `error`.
- Flaga `private.safety_policy_config.pre_delivery_moderation_enabled` domyślnie **FALSE**.
- Kill switch: flaga off zatrzymuje nowe wysyłki (503), nie wraca fail-open po contract.
- Rollout (po Accepted ADR i autoryzacji): expand → worker + Azure secrets → konto
  testowe → flaga true → contract → 24h. Hosted Edge bez ffmpeg nie nadaje się do
  wideo — runtime z binarką ffmpeg.

### C4 — SLA 1.2 (tooling; smoke poza Git)

- Właściciel dyżuru i alert: [`../moderation-runbook.md`](../moderation-runbook.md).
- `npm run check:moderation-sla` (prod) / `:local`. Dowody w `~/.nix-ops/c4-sla-*.md`.

### C5 — push JWT (kod; prod v15 pending)

- `config.toml`: `push-dispatch` `verify_jwt=true`.
- pgTAP: tabele moderacji / kwarantanny nie enqueue'ują push; `nixes` i
  `text_messages` dopiero po materialize INSERT.
- Produkcja v14 nadal `verify_jwt=false` do autoryzowanego deployu (issue #7).

### C6 — native toolchain (RN 0.86.3 + Node 24 / Deno 2.9.6; binary 6+ pending)

- React Native patched `0.86.3` (issue #15) + CocoaPods. Override Metro `0.84.5`
  (vendored image-size) — **nie** `npm audit fix --force`. `npm audit --audit-level=high` = 0.
- Pin: `.nvmrc` / `.node-version` `24.18.0`, `.deno-version` `2.9.6`, EAS `node`,
  `deno:check`/`deno:test` z `--frozen-lockfile`.
- Archive `1.0.11 (6+)` tylko po osobnej zgodzie.

### C7 — ASC / Privacy (kanon bieżący + szkic po C3)

- [`../app-store-listing.md`](../app-store-listing.md): Social Media = No;
  copy po C3 nie wklejać, dopóki flaga jest off.
- Post-enforcement Privacy:
  [`../legal/privacy-policy-post-enforcement.md`](../legal/privacy-policy-post-enforcement.md).

### C8 — device candidate (checklist; Archive pending)

- [`../testing/app-review-device-smoke.md`](../testing/app-review-device-smoke.md).
- iPhone + iPad Air 11" M3, SIWA revoke, IPv6/NAT64, allow/reject/provider-down.
- Status publiczny pozostaje **NO-GO** do PASS urządzenia + deployów.

## Open release blockers

1. **P0-3 — UGC filtering:** kod C3 na drzewie; C2 spike ukończony z wynikiem
   recall NO-GO — ADR **Proposed**, flaga off. Zobacz C2/C3 powyżej.
2. **C1 prod deploy:** migracja grantów + Advisors na produkcji czekają na
   autoryzację; smoke ścieżek poza Git.
3. **C5 push JWT:** produkcja `push-dispatch` v14 `verify_jwt=false` (issue #7)
   do autoryzowanego v15.
4. **Physical-device QA:**
   [`../testing/app-review-device-smoke.md`](../testing/app-review-device-smoke.md)
   na iPhonie i iPadzie; dowód poza Git.
5. **Release tag:** signed `testflight/ios-1.0.11-build.5` na `c2175ce` po
   odblokowaniu klucza; tag kandydata 6+ dopiero po nowym Archive.
6. **Native binary 6+:** RN 0.86.3 i pin toolchain w kodzie; Archive/submit
   tylko po osobnej zgodzie.

## Next eligible App Review candidate

Build 5 is retained as Internal TestFlight evidence. P0-3 changes require a new
binary, so the earliest public candidate is `1.0.11 (6)` or higher, built from a
tagged `main` SHA after every blocker above passes.

Allowed status progression:

```text
NO-GO / INTERNAL TESTFLIGHT
  -> READY FOR REVIEW
  -> WAITING FOR REVIEW
  -> IN REVIEW
```

Uploading a binary or attaching it to TestFlight never advances the public App
Review status by itself.
