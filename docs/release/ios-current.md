# NiX iOS — current release status

> This document is the single source of truth for the current iOS release.
> Dated sprint plans and audit snapshots are historical evidence and must link
> here instead of presenting their old binary state as current.

## Current binary

| Field | Value |
| --- | --- |
| App Store Connect app | NiX (`6791332379`) |
| Version | `1.0.11` |
| Latest build | `6` (Internal TestFlight; owner device PASS 2026-09-12) |
| Source SHA | `063530f49418b6fc7e99ed857e8556306d03e867` |
| Source branch at upload | `feat/ios-1.0.11-build-6` |
| Previous Internal TF evidence | build `5` on `c2175ce8902161bceefd86668e98955e1487b12c` |
| Distribution | Internal TestFlight + public App Review |
| Public App Review | **WAITING FOR REVIEW** (submitted 2026-09-12) |
| Submission | `8db797c3-1620-4294-8af2-8d3e688ba4f3` — iOS App `1.0.11 (6)` |
| Release type | Manual (`Manually release this version`) |

Build `1.0.11 (6)` was uploaded to App Store Connect on 2026-09-12 via local
Xcode Archive (not EAS). Owner recorded Internal TestFlight device **PASS**
the same day (`pass wszystko`: navigation, lists, camera, media upload,
background upload). Owner GO Submit the same day. ASC accepted the version;
status is **Waiting for Review**. Build 5 remains prior Internal TestFlight
evidence. Evidence: `~/.nix-ops/p0-3-s6/ASC-SUBMIT-20260912.md`.

## Verified gates

On the exact build 5 source SHA (`c2175ce`):

- TypeScript: PASS;
- ESLint: PASS;
- Vitest: 77 files / 430 tests PASS;
- Knip: PASS;
- iOS config synchronization: PASS;
- Internal TestFlight config: PASS;
- production release environment validation and its tests: PASS;
- Xcode Archive, export, signing and App Store upload: PASS, recorded outside
  Git in `~/.nix-ops/sprint5-paste-input/INTERNAL-TESTFLIGHT-5.md`.

On the exact build 6 archive SHA (`063530f`):

- iOS config synchronization: PASS;
- Sentry default-off: PASS;
- production release environment validation: PASS;
- Vitest: 78 files / 440 tests PASS;
- Xcode Archive, export, signing and App Store Connect upload: PASS, recorded
  outside Git in `~/.nix-ops/p0-3-s6/DECISION4-IOS-BUILD6-ARCHIVE-20260912.md`.
- Owner Internal TestFlight device PASS: 2026-09-12 (`pass wszystko`;
  navigation, lists, camera, media upload, background upload). Evidence:
  `DECISION4-IOS-BUILD6-DEVICE-PASS-20260912.md`. Flag OFF; not the full C8
  App Review matrix.
- TypeScript `tsc --noEmit` still fails on pre-existing auth route types and
  `productAnalyticsService.test.ts` (unchanged by the build-number bump).

## P0-3 / moderation progress (2026-09-03)

| Gate | Status |
| --- | --- |
| C2 Azure F0 spike | **Accepted** 2026-09-12 — ADR-001 **Accepted**. Strategy `uniform_scene_guard` (not full video scan). F0 Monitor/MCP exact **3523** at Accept; S0 portal exception ACTIVE. Evidence: `~/.nix-ops/p0-3-spike-s0/decision.md` + `~/.nix-ops/p0-3-s6/S0-EXCEPTION-ACTIVATED-20260912.md`. Prod flag **ON** 2026-09-12 (`wlacz flage`). |
| C3A OVH offline video runtime | **PASS** (offline benchmark; no Azure; no prod entry) |
| C3B offline integration | **PASS (base)** — merged via [PR #18](https://github.com/endurance71/NIX/pull/18). Fake Azure; flag OFF. |
| C3B audit fixes | **MERGED** — merge SHA [`5d3cd41`](https://github.com/endurance71/NIX/commit/5d3cd410079ce1488c9c80f7248786604595da81) ([PR #24](https://github.com/endurance71/NIX/pull/24), tip `59d6721`). Complete/lease REVOKE, attempt-id budget, Auth/Storage Path A+B PASS, local verify PASS. Expo CI **exception** (quota; reset 2026-10-01 UTC). Evidence: `~/.nix-ops/p0-3-c3b-audit-fixes/`. Flag OFF; **no** prod `db push` / App Review. Status: [`../plans/2026-09-04-c3b-auth-storage-merged.md`](../plans/2026-09-04-c3b-auth-storage-merged.md). |
| §6 Decision 3 fake-only staging | **PASS** 2026-09-12 — owner `zatwierdzam GO staging canary`. Deno 2.9.6 worker suite **41 passed / 0 failed** on SHA `d146bba`; ffmpeg/ffprobe 8.1.2; **0** Azure Analyze. Rollback drilled. Evidence: `~/.nix-ops/p0-3-s6/DECISION3-STAGING-FAKE-SOAK-PASS-20260912.md`. |
| §6 Decision 3 live Azure canary | **PASS** 2026-09-12 — owner `ruszaj`. Cap **50**; used **6** (5 safe text + 1 safe JPEG, all `approved` severity 0); video live **off**. SHA `3482e65`, clean tree. `external_used` **3630 / 4000** (remaining **370**). Evidence: `~/.nix-ops/p0-3-s6/DECISION3-LIVE-AZURE-CANARY-PASS-20260912.md`. |
| §6 Decision 4 | **GO recorded** 2026-09-12 (`zgoda`). C3 schema **on prod**. Storage download + OVH idle worker. `enqueue_own` + `get_own` on prod. Archive **1.0.11 (6)**; owner Internal TF device **PASS** 2026-09-12 (`pass wszystko`; issue [#15](https://github.com/endurance71/NIX/issues/15) closed). Owner `wlacz flage` 2026-09-12: Privacy Policy Azure wording, OTA `874edb39` (`8688bfb`, runtime `1.0.11`), then flag **TRUE**. INSERT fallback blocked. **Not** READY FOR REVIEW. Evidence: `~/.nix-ops/p0-3-s6/DECISION4-GO-20260912.md` + `DECISION4-PROD-SCHEMA-FLAG-OFF-20260912.md` + `DECISION4-STORAGE-DOWNLOAD-SMOKE-20260912.md` + `DECISION4-OVH-HOST-IDLE-20260912.md` + `DECISION4-IOS-ENQUEUE-FALLBACK-20260912.md` + `DECISION4-IOS-BUILD6-ARCHIVE-20260912.md` + `DECISION4-IOS-BUILD6-DEVICE-SMOKE-20260912.md` + `DECISION4-IOS-BUILD6-DEVICE-PASS-20260912.md` + `DECISION4-FLAG-ON-20260912.md`. |
| Production pre-delivery filter | **ON** 2026-09-12 — flag TRUE after OTA. Hotfix [PR #48](https://github.com/endurance71/NIX/pull/48) (`e1d73cf`) delivers approved text and finalizes photos. HTTPS privacy/terms **2026-09-12** live. Photo wait loop [PR #50](https://github.com/endurance71/NIX/pull/50) (`ae943fb`) + OTA `4f1fcd22`. Owner allowed **text + photo + video** delivered 2026-09-12. Public App Review **WAITING FOR REVIEW** 2026-09-12 (owner Submit GO). |

Flag `pre_delivery_moderation_enabled` is **TRUE** on production after owner `wlacz flage` (2026-09-12). HTTPS privacy/terms **2026-09-12** (Azure wording) are live at `https://nix.damianmotylinski.pl/privacy/` and `/terms/` (PL + EN). Public App Review is **WAITING FOR REVIEW** (submitted 2026-09-12; build **6**; manual release). Build **6** + OTA `4f1fcd22` (runtime `1.0.11`; prior send-PASS OTA was `874edb39`). OVH worker image `nix-moderation-worker:e1d73cf` (try/catch from PR #48). Rollback is `UPDATE … = false`, not a migration. See [`../plans/2026-09-04-c3b-next-gate-staging-canary.md`](../plans/2026-09-04-c3b-next-gate-staging-canary.md).

## Open release blockers

1. **P0-3 — pre-delivery filter:** Flag **TRUE**. Text/photo/video enqueue is
   fail-closed pending Azure. Hotfix [PR #48](https://github.com/endurance71/NIX/pull/48)
   and photo wait [PR #50](https://github.com/endurance71/NIX/pull/50) are on prod.
   HTTPS privacy/terms **2026-09-12** published (PL + EN). Owner live send on
   OTA `4f1fcd22`: allowed **text, photo, and video all delivered** 2026-09-12.
   F0 ledger **3649 / 4000** (`external_used` 3630 + `consumed_txn` 19).
   Public App Review **WAITING FOR REVIEW** 2026-09-12.
2. **Physical-device QA (iPhone):** owner Internal TF **PASS** on `1.0.11 (6)`
   plus remaining 1.2 (reject / report / block / paste / offline / permissions)
   attested 2026-09-12. Allowed text/photo/video delivery confirmed the same
   day. Current JS is OTA `4f1fcd22`. Runbook:
   `~/.nix-ops/c8-device-2026-09-12.md`. Matrix:
   [`../testing/app-review-device-smoke.md`](../testing/app-review-device-smoke.md).
3. **iPad / IPv6:** owner excluded from this C8 slice (`tylko iPhone`). App is
   `supportsTablet: false`. Residual Apple Review risk (iPad compatibility mode
   and IPv6 NAT64) stays documented; not a C8 execute item.
4. **Push JWT:** production `push-dispatch` **v15** `verify_jwt=true` (owner GO
   2026-09-12). Vault cron path HTTP 200; unauthenticated POST 401. Issue
   [#7](https://github.com/endurance71/NIX/issues/7) closed completed.
5. **Release tag:** create a signed tag
   `testflight/ios-1.0.11-build.5` on `c2175ce` after the repository signing key
   is unlocked.
6. **Native dependency security:** React Native `0.86.3` + patch is in binary
   `1.0.11 (6)`. Owner device PASS 2026-09-12 closed GitHub issue #15. Do not
   apply `npm audit fix --force`.
7. **Reproducible Deno gate:** Node `24.18` / Deno `2.9.6` pins + frozen
   `deno.lock` are on `main` via PR #19. Close GitHub issue #16 after confirming
   CI/toolchain on a green Lint/test run.

## Next eligible App Review candidate

Build 6 is the submitted binary (enqueue + wait loop via OTA `4f1fcd22`,
runtime `1.0.11`). HTTPS privacy/terms match in-app version **2026-09-12**.
Public App Review is **WAITING FOR REVIEW** after owner Submit GO 2026-09-12.
Do **not** cancel the submission or attach a new IPA unless Apple rejects or
the owner asks. Build 5 stays as prior Internal TestFlight evidence. Release
after approval is **manual**.

Allowed status progression:

```text
NO-GO / INTERNAL TESTFLIGHT
  -> READY FOR REVIEW
  -> WAITING FOR REVIEW
  -> IN REVIEW
```

Uploading a binary or attaching it to TestFlight never advances the public App
Review status by itself.

## GO path progress (2026-09-11)

Workspace synced to `origin/main`. Local dirty C1–C8 tree was snapshotted on
`wip/local-pre-sync-20260911` (do not merge) and discarded from `main`.

| Item | Result |
| --- | --- |
| PR [#9](https://github.com/endurance71/NIX/pull/9) spike | Closed obsolete — already on `main` via later C3B PRs |
| Issue [#29](https://github.com/endurance71/NIX/issues/29) JWT | Closed not_planned — local Supabase **demo** keys (`iss=supabase-demo`), not prod |
| PR [#32](https://github.com/endurance71/NIX/pull/32) S0 binding | Merged `6d8bcc9` — does **not** activate S0 exception or Accept ADR |
| PR [#31](https://github.com/endurance71/NIX/pull/31) privacy / Sentry | Merged `9f52de8` after rebase onto `main` |
| ADR-001 | **Accepted** 2026-09-12 (owner GO S0 exception + `zatwierdzam Accepted`) |
| C2 `--require-complete-s0` | PASS after ACTIVE + Accepted `decision.md` |
| §6 Decision 3 fake-only | **PASS** 2026-09-12 (`zatwierdzam GO staging canary`; 41 tests; 0 Analyze) |
| §6 Decision 3 live Azure canary | **PASS** 2026-09-12 (`ruszaj`; 6/50 txn; video off; `external_used` **3630**) |
| §6 Decision 4 | **Flag TRUE** 2026-09-12 (`wlacz flage`); OTA `874edb39` then `4f1fcd22`; INSERT blocked; later same day App Review **WAITING FOR REVIEW** |
| Production flag | **ON** — hotfix [PR #48](https://github.com/endurance71/NIX/pull/48) `e1d73cf`; owner **allowed** send PASS after flag ON |
| Photo wait OTA | [PR #50](https://github.com/endurance71/NIX/pull/50) `ae943fb`; group `4f1fcd22`; RPC `get_own_media_moderation_job` |
| OVH worker | image `nix-moderation-worker:e1d73cf`; try/catch live; RestartCount 0 |
| HTTPS privacy/terms | **2026-09-12** live (`/privacy`, `/terms`, `/privacy/en`, `/terms/en`) |
| `push-dispatch` | prod **v15** `verify_jwt=true` — Vault cron HTTP 200; issue #7 closed |
| C8 iPhone + SIWA | owner PASS 2026-09-12 (attestation; no PII in Git) |
| Allowed text / photo / video | **PASS** 2026-09-12 — owner `wszystko doszlo`; jobs 4 text + 2 image + 1 video approved |
| iPad / IPv6 | deferred by owner (`tylko iPhone`); `supportsTablet: false` |
| F0 | **3649 / 4000** remaining **351** |
| Public App Review | **WAITING FOR REVIEW** 2026-09-12 — submission `8db797c3-1620-4294-8af2-8d3e688ba4f3`, build **6**, manual release |

Production flag is TRUE. Binary **6** + OTA `4f1fcd22` + SQL `20260912150000` +
`20260912160000`. `push-dispatch` v15. HTTPS privacy matches in-app 2026-09-12.
Public App Review submitted 2026-09-12.
