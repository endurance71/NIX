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
| Distribution | Internal TestFlight only |
| Public App Review | **NO-GO / not submitted** |

Build `1.0.11 (6)` was uploaded to App Store Connect on 2026-09-12 via local
Xcode Archive (not EAS). Owner recorded Internal TestFlight device **PASS**
the same day (`pass wszystko`: navigation, lists, camera, media upload,
background upload). Confirm **6** remains the active build on **NiX Internal QA**.
Build 5 remains prior Internal TestFlight evidence.

Uploading a binary never advances public App Review. Build 6 is Internal
TestFlight only.

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
| Production pre-delivery filter | **ON** 2026-09-12 — flag TRUE after OTA. Hotfix [PR #48](https://github.com/endurance71/NIX/pull/48) (`e1d73cf`) delivers approved text and finalizes photos. HTTPS privacy/terms **2026-09-12** live. Public App Review still **NO-GO** (remaining device matrix). |

Flag `pre_delivery_moderation_enabled` is **TRUE** on production after owner `wlacz flage` (2026-09-12). HTTPS privacy/terms **2026-09-12** (Azure wording) are live at `https://nix.damianmotylinski.pl/privacy/` and `/terms/` (PL + EN). READY FOR REVIEW stays blocked until remaining device gates pass. Build **6** + OTA `874edb39`. Rollback is `UPDATE … = false`, not a migration. See [`../plans/2026-09-04-c3b-next-gate-staging-canary.md`](../plans/2026-09-04-c3b-next-gate-staging-canary.md).

## Open release blockers

1. **P0-3 — UGC filtering:** Flag **TRUE** 2026-09-12 (owner `wlacz flage`).
   Text/photo enqueue is fail-closed pending Azure. Hotfix [PR #48](https://github.com/endurance71/NIX/pull/48)
   is on prod. HTTPS privacy/terms **2026-09-12** published (PL + EN). Remaining
   before public App Review: the rest of the device matrix.
2. **Physical-device QA:** owner Internal TF **PASS** on `1.0.11 (6)` 2026-09-12
   (navigation, lists, camera, media upload, background upload; flag was OFF).
   After OTA `874edb39` + flag TRUE + hotfix: owner confirmed text and photo
   send (`poszlo wszystko teraz`). Remaining App Review matrix:
   [`../testing/app-review-device-smoke.md`](../testing/app-review-device-smoke.md)
   (iPad, IPv6/NAT64, SIWA revoke, live 1.2). Chat paste:
   [`../testing/testflight-chat-paste-input.md`](../testing/testflight-chat-paste-input.md).
3. **P0-4/P0-5 device gates:** verify Sign in with Apple, Apple credential
   revocation during account deletion, clean install, upgrade, offline/retry,
   IPv6/NAT64 and iPad compatibility.
4. **Push JWT consistency:** production `push-dispatch` v14 still has
   `verify_jwt=false`. Read-only verification confirmed that active cron callers
   send the Vault-backed service-role JWT and currently receive HTTP 200. Close
   GitHub issue #7 only after an authorized v15 deployment with
   `verify_jwt=true` and a repeated cron/webhook smoke.
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

Build 6 is the current Internal TestFlight binary (enqueue + wait loop via OTA
`874edb39`). HTTPS privacy/terms match in-app version **2026-09-12**. Public App
Review stays **NO-GO** until remaining device blockers pass. Build 5 stays as
prior evidence.

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
| §6 Decision 4 | **Flag TRUE** 2026-09-12 (`wlacz flage`); OTA `874edb39`; INSERT blocked; App Review **NO-GO** |
| Production flag | **ON** — hotfix [PR #48](https://github.com/endurance71/NIX/pull/48) `e1d73cf`; owner send PASS after flag ON |
| HTTPS privacy/terms | **2026-09-12** live (`/privacy`, `/terms`, `/privacy/en`, `/terms/en`) |
| Public App Review | **NO-GO** |

Production flag is TRUE. Binary **6** + OTA `874edb39` + SQL hotfix `20260912150000`.
HTTPS privacy matches in-app 2026-09-12. Do not READY FOR REVIEW until the
remaining device matrix in this document passes.
