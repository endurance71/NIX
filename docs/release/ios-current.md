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

## P0-3 / moderation progress (2026-09-03)

| Gate | Status |
| --- | --- |
| C2 Azure F0 spike | **Accepted** 2026-09-12 — ADR-001 **Accepted**. Strategy `uniform_scene_guard` (not full video scan). F0 Monitor/MCP exact **3523**; `external_used` **3624 / 4000** (remaining **376**). S0 portal exception ACTIVE. Evidence: `~/.nix-ops/p0-3-spike-s0/decision.md` + `~/.nix-ops/p0-3-s6/S0-EXCEPTION-ACTIVATED-20260912.md`. **No** staging live / prod flag. |
| C3A OVH offline video runtime | **PASS** (offline benchmark; no Azure; no prod entry) |
| C3B offline integration | **PASS (base)** — merged via [PR #18](https://github.com/endurance71/NIX/pull/18). Fake Azure; flag OFF. |
| C3B audit fixes | **MERGED** — merge SHA [`5d3cd41`](https://github.com/endurance71/NIX/commit/5d3cd410079ce1488c9c80f7248786604595da81) ([PR #24](https://github.com/endurance71/NIX/pull/24), tip `59d6721`). Complete/lease REVOKE, attempt-id budget, Auth/Storage Path A+B PASS, local verify PASS. Expo CI **exception** (quota; reset 2026-10-01 UTC). Evidence: `~/.nix-ops/p0-3-c3b-audit-fixes/`. Flag OFF; **no** prod `db push` / Azure live / App Review. Status: [`../plans/2026-09-04-c3b-auth-storage-merged.md`](../plans/2026-09-04-c3b-auth-storage-merged.md). |
| Production pre-delivery filter | **OFF** — Guideline 1.2 still blocks public App Review |

Hard stop: C3 prod / flag / Privacy Policy „po C3” / READY FOR REVIEW only after **§6 Decision 3 staging GO** (separate). C2 Accepted does **not** turn the production flag on. See [`../plans/2026-09-04-c3b-next-gate-staging-canary.md`](../plans/2026-09-04-c3b-next-gate-staging-canary.md).

## Open release blockers

1. **P0-3 — UGC filtering:** C2 provider is **Accepted**; photos and video are still
   not filtered on production (flag OFF). Guideline 1.2 still requires authorized
   staging, then production enforcement, before public App Review.
2. **Physical-device QA:** execute
   [`../testing/app-review-device-smoke.md`](../testing/app-review-device-smoke.md)
   (and chat paste [`../testing/testflight-chat-paste-input.md`](../testing/testflight-chat-paste-input.md))
   on an iPhone and iPad; record the result outside Git.
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
6. **Native dependency security:** React Native `0.86.3` + patch is on `main`
   via [PR #19](https://github.com/endurance71/NIX/pull/19) (C6). A new native
   binary (`1.0.11` build `6+`) is still required before closing issue #15 on
   devices. Do not apply `npm audit fix --force`.
7. **Reproducible Deno gate:** Node `24.18` / Deno `2.9.6` pins + frozen
   `deno.lock` are on `main` via PR #19. Close GitHub issue #16 after confirming
   CI/toolchain on a green Lint/test run.

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
| Production flag | **OFF** |
| Public App Review | **NO-GO** |

Fazy 3–7 remain blocked. Next human gate: staging/canary GO ([`../plans/2026-09-04-c3b-next-gate-staging-canary.md`](../plans/2026-09-04-c3b-next-gate-staging-canary.md)). Do not staging-live, prod flag, Archive 6+, or READY FOR REVIEW without that signature.
