# NiX iOS — current release status

> This document is the single source of truth for the current iOS release.
> Dated sprint plans and audit snapshots are historical evidence and must link
> here instead of presenting their old binary state as current.

## Current public candidate — build 9, updated 2026-10-09

**1.0.12 (9)** replaces build 8. Client source `859694ad3dab5b2287887ab88019a310952f89e9` hard-disables analytics regardless of local dotenv or internal roadmap flags. The Release preflight now rejects enabled analytics/Sentry flags, with regression tests for dotenv precedence and existing consent. Runtime **1.0.12**, channel **production**, backend and native feature scope remain unchanged. All local checks and [CI](https://github.com/endurance71/NIX/actions/runs/37889189207) pass, including 580 app tests, 14 release-environment tests, React Doctor 0/0 and Expo Doctor 20/20.

Local Xcode Release Archive **PASS**. Organizer signed a public App Store distribution IPA using the existing cloud certificate. The signed package was retained directly from Xcode's distribution pipeline after the Save panel did not complete; CLI export reports `No Accounts`. IPA SHA256 `41a4b7961b18c1a8b9634a45083b4994ae61da61182c4c78302d0195a5bd0c2f`; embedded Hermes SHA256 `a4013c33373334437b69fca5943f68185b94185c1d20c8672287c3f00d367075`. App/widget build 9, production APNs/backend, runtime/channel, distribution profile and strict deep signature verification **PASS**. Organizer upload was started with internal-only and build-number management disabled; completion is **not verified**, and the Mac subsequently locked. ASC processing, internal assignment and build selection remain pending. Release build 9 also compiled, installed and launched on an isolated iPad simulator; visual and functional compatibility QA remains pending.

Build 8 passed signing/upload and API smoke but is **superseded**, because the final environment inspection found `.env.local` enabling analytics over `.env.production=false`. Its beta availability is not evidence that it satisfies the no-analytics requirement. Do not use it for the final owner recording or approve it for App Review. Final QA must use build 9, with new IPA/bundle hashes and a fresh OTA snapshot.

**Not READY FOR APP REVIEW:** final TestFlight device QA, both reviewer logins, owner recording, six complete answers, screenshot/build selection and regional/DSA/privacy checks remain pending. The ASC session expired and requires the owner to log in again. DSA needs the owner's declaration; ICP applicability/documentation needs confirmation without reducing regions. No Apple reply, resubmission, OTA or public release has been performed.

See [preparation report](APP_REVIEW_PREPARATION_2026-10-08.pl.md), [deployment and recovery](BACKEND_DEPLOYMENT_2026-10-09.md), and [final QA scenario](APP_REVIEW_FINAL_QA_2026-10-09.pl.md).

## Superseded public build 8 — verified 2026-10-08


Candidate **1.0.12 (8)**, runtime **1.0.12**, production channel, has passed local Xcode Release Archive/export/upload and ASC processing. `testFlightInternalTestingOnly=false`; it is assigned to **NiX Internal QA** and **Team (Expo)**. ASC build ID `fc5ea753-5d50-41ab-8524-3818fb4695b6`, binary state Validated, beta state Ready to Submit. Client source `1300dc1283eb55434cdfcf3d0100f4ad11141bf3`; IPA SHA256 `29ff374d5898aa6c9f7ed741b0accf0259533ddc0d64e6fcf0e2405231259ce0`. [Open build 8](https://appstoreconnect.apple.com/teams/f808d5d8-f16c-48e0-8330-04dda650a25d/apps/6791332379/testflight/ios/fc5ea753-5d50-41ab-8524-3818fb4695b6).

Backend source `bbd143643a85665c378d2a197a4020b1f5843642` is deployed after encrypted backup, isolated database restore, real Auth/Storage staging and a rollout-order rehearsal preserving pending jobs. Both forward migrations and 16 Edge Functions are deployed; the exact tested worker image is running on OVH. Dedicated-account production smoke PASS; original reviewer accounts were not deleted. CI including real Auth/Storage paths A/B and EAS quality gates PASS. Native device QA is pending.

Public legal/support PL/EN pages, AASA and invite routes have been restored and verified. Mac and Vision Pro distribution are disabled; 175 regions preserved. Version field **1.0.12**, bilingual descriptions and support URLs saved; manual release retained. The former build 6 association was removed. Build 8 was not yet present in the App Review picker, and the ASC session expired; selecting it remains pending. No reply or resubmission was performed.

**Not READY FOR APP REVIEW:** final device QA, both reviewer logins, owner recording, six complete answers, screenshot/build selection and regional/DSA/privacy checks remain pending. DSA needs the owner's declaration; ICP applicability/documentation needs confirmation without reducing regions. No OTA exists for runtime 1.0.12 at the recorded snapshot; do not publish one before final QA and a new scope review. See [preparation report](APP_REVIEW_PREPARATION_2026-10-08.pl.md) and [final QA scenario](APP_REVIEW_FINAL_QA_2026-10-09.pl.md).

## Historical Internal-only build 7 — 2026-10-08

The prior Internal TestFlight build was **1.0.12 (7)**, runtime **1.0.12**, on `codex/nix-stabilization`. It includes native uploader changes, private photo downloads and updated native dependencies, so it requires a new binary. Source commit [`27595e2`](https://github.com/endurance71/NIX/commit/27595e28a5913631acf6a01ebb3db261c30bc3a9) is committed and pushed. A local **Release Archive succeeded** on 2026-10-08. The owner selected **Internal TestFlight / NiX Internal QA** as the deployment target; production backend deployment is outside this operation.

**Internal distribution verified:** the owner accepted the updated Apple Developer Program License Agreement. Local distribution export and upload succeeded on 2026-10-08; App Store Connect completed processing and shows **1.0.12 (7)** as **Testing / Internal**, expiring in 90 days. Build ID: `dad6024c-765c-4504-a6b9-b957cf206061`. The candidate is assigned to **NiX Internal QA** (four internal testers); the existing **Team (Expo)** group also received it through automatic distribution. Bilingual PL/EN “What to Test” notes were saved. [Open the build in TestFlight](https://appstoreconnect.apple.com/teams/f808d5d8-f16c-48e0-8330-04dda650a25d/apps/6791332379/testflight/ios/dad6024c-765c-4504-a6b9-b957cf206061).

IPA checks confirmed version/build/runtime, production Expo channel, production APNs and distribution provisioning (`get-task-allow=false`). Export options restrict the candidate to **Internal TestFlight only** and preserve build number 7. The app source remains commit `27595e2`; subsequent commits only record release evidence. No public submission or production backend deployment was performed for this candidate. Local archive, IPA, signing/upload logs, screenshots and release receipt are in `~/.nix-ops/release-2026-10-08/`. Full native QA remains tracked in the implementation reports below; owner camera photo/video/preview smoke passed on the development build.

Validation and rollout conditions: [implementation report](../IMPLEMENTATION_2026-10-08.pl.md), [React Doctor zero report](../REACT_DOCTOR_ZERO_2026-10-08.pl.md).

## Current public App Review status — verified 2026-10-08

Public submission **1.0.11 (6)**, `8db797c3-1620-4294-8af2-8d3e688ba4f3`, is **Rejected / Unresolved Issues**. Apple’s sole visible message, dated 2026-09-13, requests additional information under **2.1 — Information Needed — New App Submission**: a physical-device recording and answers about purpose, access, external services, regions and regulated/protected material. No developer reply is visible. The newer Internal-only build **1.0.12 (7)** does not replace this submission and cannot be submitted for public App Review.

The initial 2026-10-08 audit found **HTTP 404** at the configured public privacy and support URLs and the documented terms URL; Mac and Vision Pro distribution are enabled despite iPhone-only Review Notes. These were additional audit findings, not reasons stated in Apple's September message. The website/platform findings have since been fixed, metadata updated and backend deployed as described above. No Apple response or public resubmission was performed. See the [detailed feedback analysis](../APP_REVIEW_FEEDBACK_ANALYSIS_2026-10-08.pl.md) and [unsent reply draft](apple-review-response-draft-2026-10-08.en.md).

The production/ASC entries below are historical observations from **2026-09-12**. Their Waiting for Review state is superseded by the verified rejection above. Installed OTA, live backend behavior and moderation budget still require verification before a production rollout. No release action was taken during stabilization.

## Last recorded distributed binary (2026-09-12)

| Field | Value |
| --- | --- |
| App Store Connect app | NiX (`6791332379`) |
| Version | `1.0.11` |
| Last recorded build | `6` (Internal TestFlight; owner device PASS 2026-09-12) |
| Source SHA | `063530f49418b6fc7e99ed857e8556306d03e867` |
| Source branch at upload | `feat/ios-1.0.11-build-6` |
| Previous Internal TF evidence | build `5` on `c2175ce8902161bceefd86668e98955e1487b12c` |
| Distribution | Internal TestFlight + public App Review |
| Last recorded Public App Review | **WAITING FOR REVIEW** (2026-09-12; current state unverified) |
| Submission | `8db797c3-1620-4294-8af2-8d3e688ba4f3` — iOS App `1.0.11 (6)` |
| Release type | Manual (`Manually release this version`) |

Build `1.0.11 (6)` was uploaded to App Store Connect on 2026-09-12 via local
Xcode Archive (not EAS). Owner recorded Internal TestFlight device **PASS**
the same day (`pass wszystko`: navigation, lists, camera, media upload,
background upload). Owner GO Submit the same day. ASC accepted the version;
status is **Waiting for Review**. Build 5 remains prior Internal TestFlight
evidence. Evidence: `~/.nix-ops/p0-3-s6/ASC-SUBMIT-20260912.md`.

## Historical verified gates — builds 5 and 6

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

## Historical release blockers — recorded 2026-09-12

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

Build **1.0.11 (6)** remains attached to the rejected public submission. The
information request alone does not require a replacement binary: it can be
answered for that candidate after confirming its actual behavior, supplying
the requested recording and repairing the public URLs.

To ship the current stabilization changes, prepare a new public-eligible
binary, for example **1.0.12 (8)** after checking build-number availability.
Internal-only **1.0.12 (7)** cannot be used for this purpose. The recording,
review Notes, tested backend and selected binary must match. Resolve platform
scope and the six requested information items before resubmission. No candidate
was submitted during this analysis; publication remains a separate operation
and release after approval remains **manual**.

Illustrative public status progression (current state is **Rejected**):

```text
NO-GO / INTERNAL TESTFLIGHT
  -> READY FOR REVIEW
  -> WAITING FOR REVIEW
  -> IN REVIEW
  -> APPROVED or REJECTED / UNRESOLVED ISSUES
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
