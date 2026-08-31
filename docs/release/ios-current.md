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

## Open release blockers

1. **P0-3 — UGC filtering:** photos and video are not filtered before delivery.
   Public App Review remains blocked until backend enforcement, production
   evidence and policy updates are complete.
2. **Physical-device QA:** execute
   [`../testing/testflight-chat-paste-input.md`](../testing/testflight-chat-paste-input.md)
   on an iPhone and record the result outside Git.
3. **P0-4/P0-5 device gates:** verify Sign in with Apple, Apple credential
   revocation during account deletion, clean install, upgrade, offline/retry,
   IPv6/NAT64 and iPad compatibility.
4. **Push JWT consistency:** close GitHub issue #7 only after production cron
   and webhook calls are proven to work with `verify_jwt=true`.
5. **Release tag:** create a signed tag
   `testflight/ios-1.0.11-build.5` on `c2175ce` after the repository signing key
   is unlocked.

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
